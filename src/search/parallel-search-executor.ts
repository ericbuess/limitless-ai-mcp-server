import { Phase2Lifelog } from '../types/phase2.js';
import { FastPatternMatcher } from './fast-patterns.js';
import { logger } from '../utils/logger.js';
import { BaseVectorStore } from '../vector-store/vector-store.interface.js';
import { FileManager } from '../storage/file-manager.js';

// Define local types
interface LifelogSearchResult {
  id: string;
  score: number;
  lifelog: Phase2Lifelog;
  highlights?: string[];
  metadata?: Record<string, any>;
}

interface SearchContext {
  hotDocumentIds: Set<string>;
  discoveredDates: Set<string>;
  relevantKeywords: Set<string>;
  strategyConfidence: Map<string, number>;
  updateContext: (updates: Partial<SearchContext>) => void;
}

// Import the real interface
import { PreprocessedQuery as ActualPreprocessedQuery } from './query-preprocessor.js';

// Create adapter interface for compatibility
interface InternalPreprocessedQuery extends ActualPreprocessedQuery {
  temporalRefs?: Array<{
    text: string;
    date: Date;
    confidence: number;
  }>;
}

interface SearchStrategy {
  name: string;
  weight: number;
  execute: (query: string, context: SearchContext, options: any) => Promise<LifelogSearchResult[]>;
}

interface StrategyTiming {
  strategy: string;
  duration: number;
  resultCount: number;
  success: boolean;
}

export class ParallelSearchExecutor {
  private strategies: Map<string, SearchStrategy> = new Map();
  private fileManager: FileManager;

  constructor(
    private fastMatcher: FastPatternMatcher,
    private vectorStore: BaseVectorStore | null,
    fileManager: FileManager
  ) {
    this.fileManager = fileManager;
    this.initializeStrategies();
  }

  private initializeStrategies() {
    // Phase 1 strategies (fast discovery)
    this.strategies.set('fast-keyword', {
      name: 'fast-keyword',
      weight: 0.3,
      execute: async (query, context, options) => {
        const results = await this.fastMatcher.search(query, {
          maxResults: options.limit || 50,
        });

        // Extract keywords and dates from top results
        const keywords = new Set<string>();
        const dates = new Set<string>();
        const hotIds = new Set<string>();

        // Convert FastSearchResult to LifelogSearchResult
        const searchResults: LifelogSearchResult[] = results.map((r) => ({
          id: r.lifelog.id,
          score: r.score,
          lifelog: r.lifelog,
          highlights: r.matches.map((m) => m.context),
          metadata: {
            source: 'fast-keyword',
            matchType: r.matches[0]?.type || 'partial',
          },
        }));

        // Process top 10 results for context
        searchResults.slice(0, 10).forEach((result) => {
          hotIds.add(result.id);

          // Extract dates from content
          const dateMatches = result.lifelog.content.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g);
          if (dateMatches) {
            dateMatches.forEach((date) => dates.add(date));
          }

          // Extract significant keywords from matched content
          const queryWords = query
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 2);
          const content = result.lifelog.content.toLowerCase();

          // Extract multi-word phrases from content (domain-agnostic)
          const phrasePatterns = [
            // Numbered items (e.g., "version 2", "chapter 3")
            /\b\w+\s+\d+\b/gi,
            // Capitalized multi-word phrases (likely proper nouns)
            /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
            // Common bigrams/trigrams around query words
            new RegExp(`\\b\\w+\\s+(?:${queryWords.join('|')})\\s+\\w+\\b`, 'gi'),
          ];

          phrasePatterns.forEach((pattern) => {
            const matches = content.match(pattern);
            if (matches) {
              matches.forEach((match) => {
                if (match.length > 3 && match.split(/\s+/).length <= 3) {
                  keywords.add(match.toLowerCase());
                }
              });
            }
          });

          queryWords.forEach((word) => {
            // Find word boundaries around matches
            const regex = new RegExp(`\\b(\\w*${word}\\w*)\\b`, 'gi');
            const matches = content.match(regex);
            if (matches) {
              matches.forEach((match) => {
                if (match.length > 3) keywords.add(match);
              });
            }
          });
        });

        // Update context for other strategies
        context.updateContext({
          hotDocumentIds: hotIds,
          discoveredDates: dates,
          relevantKeywords: keywords,
          strategyConfidence: new Map([['fast-keyword', searchResults[0]?.score || 0]]),
        });

        logger.debug('Fast-keyword strategy completed', {
          resultCount: searchResults.length,
          hotDocs: hotIds.size,
          keywords: Array.from(keywords),
          dates: Array.from(dates),
        });

        return searchResults;
      },
    });

    this.strategies.set('smart-date', {
      name: 'smart-date',
      weight: 0.2,
      execute: async (_query, context, options) => {
        const preprocessed = options.preprocessed as InternalPreprocessedQuery;

        // Handle multi-temporal queries (e.g., "last week and today")
        const dateRanges: Array<{ start: Date; end: Date; confidence: number; text?: string }> = [];

        if (
          preprocessed?.temporalInfo?.hasMultipleTemporal &&
          preprocessed.temporalInfo.multiTemporal
        ) {
          // Process primary temporal reference
          const primary = preprocessed.temporalInfo.multiTemporal.primary;
          dateRanges.push({
            start: new Date(primary.start + 'T00:00:00'),
            end: new Date(primary.end + 'T23:59:59'),
            confidence: 1.0,
            text: primary.text,
          });

          // Process secondary temporal references
          for (const secondary of preprocessed.temporalInfo.multiTemporal.secondary) {
            dateRanges.push({
              start: new Date(secondary.start + 'T00:00:00'),
              end: new Date(secondary.end + 'T23:59:59'),
              confidence: 0.9,
              text: secondary.text,
            });
          }

          logger.debug('Multi-temporal query detected', {
            primary: primary.text,
            secondary: preprocessed.temporalInfo.multiTemporal.secondary.map((s) => s.text),
            rangeCount: dateRanges.length,
          });
        } else if (
          preprocessed?.temporalInfo?.dateRanges &&
          preprocessed.temporalInfo.dateRanges.length > 0
        ) {
          // Handle standard date ranges
          for (const range of preprocessed.temporalInfo.dateRanges) {
            dateRanges.push({
              start: new Date(range.start + 'T00:00:00'),
              end: new Date(range.end + 'T23:59:59'),
              confidence: 0.95,
            });
          }
        } else if (
          preprocessed?.temporalInfo?.dates &&
          preprocessed.temporalInfo.dates.length > 0
        ) {
          // Convert single dates to ranges
          for (const dateStr of preprocessed.temporalInfo.dates) {
            const date = new Date(dateStr);
            dateRanges.push({
              start: new Date(date.setHours(0, 0, 0, 0)),
              end: new Date(date.setHours(23, 59, 59, 999)),
              confidence: 1.0,
            });
          }
        }

        // Also check for discovered dates from other strategies
        if (context.discoveredDates.size > 0 && dateRanges.length === 0) {
          for (const dateStr of context.discoveredDates) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              dateRanges.push({
                start: new Date(date.setHours(0, 0, 0, 0)),
                end: new Date(date.setHours(23, 59, 59, 999)),
                confidence: 0.7,
                text: 'discovered from context',
              });
            }
          }
        }

        if (dateRanges.length === 0) {
          return [];
        }

        const results: LifelogSearchResult[] = [];
        const uniqueIds = new Set<string>();

        for (const range of dateRanges) {
          const dayResults = await this.fileManager.listLifelogsByDateRange(range.start, range.end);

          for (const { id, date } of dayResults) {
            if (!uniqueIds.has(id)) {
              uniqueIds.add(id);
              const lifelog = await this.fileManager.loadLifelog(id, date);
              if (lifelog) {
                results.push({
                  id,
                  lifelog,
                  score: 0.8 * range.confidence,
                  highlights: [
                    `Date match: ${date.toLocaleDateString()}${range.text ? ` (${range.text})` : ''}`,
                  ],
                  metadata: {
                    source: 'smart-date',
                    matchedDate: date.toISOString(),
                    temporalText: range.text,
                  },
                });
              }
            }
          }
        }

        // Add discovered dates to context
        const discoveredDates = new Set(context.discoveredDates);
        results.forEach((r) => {
          if (r.lifelog.createdAt) {
            discoveredDates.add(new Date(r.lifelog.createdAt).toLocaleDateString());
          }
        });
        context.updateContext({ discoveredDates });

        return results;
      },
    });

    // Phase 2 strategies (enhanced with context)
    this.strategies.set('vector-semantic', {
      name: 'vector-semantic',
      weight: 0.35,
      execute: async (query, context, options) => {
        if (!this.vectorStore) return [];

        // Enhance query with discovered keywords
        let enhancedQuery = query;
        if (context.relevantKeywords.size > 0) {
          const keywords = Array.from(context.relevantKeywords).slice(0, 5);
          enhancedQuery = `${query} ${keywords.join(' ')}`;
          logger.debug('Enhanced vector query with keywords', {
            original: query,
            enhanced: enhancedQuery,
            keywords,
          });
        }

        const vectorResults = await this.vectorStore.searchByText(enhancedQuery, {
          topK: options.limit || 50,
          scoreThreshold: 0.5,
        });

        // Convert vector results to LifelogSearchResult
        const searchResults: LifelogSearchResult[] = [];
        for (const r of vectorResults) {
          // Need to fetch the actual lifelog from file manager
          if (r.metadata?.date && r.metadata?.id) {
            const lifelog = await this.fileManager.loadLifelog(
              r.metadata.id,
              new Date(r.metadata.date)
            );
            if (lifelog) {
              searchResults.push({
                id: r.id,
                score: r.score,
                lifelog: lifelog,
                highlights: [],
                metadata: { source: 'vector-semantic', ...r.metadata },
              });
            }
          }
        }

        // Extract keywords from top vector results
        const newKeywords = new Set<string>();
        searchResults.slice(0, 5).forEach((result) => {
          // Extract nouns and important words from content
          const words = result.lifelog.content
            .split(/\s+/)
            .filter((w: string) => w.length > 4 && /^[a-zA-Z]+$/.test(w))
            .map((w: string) => w.toLowerCase());

          words.forEach((word: string) => {
            if (!['about', 'there', 'which', 'would', 'could', 'should'].includes(word)) {
              newKeywords.add(word);
            }
          });
        });

        // Update context with new keywords
        if (newKeywords.size > 0) {
          const updatedKeywords = new Set([...context.relevantKeywords, ...newKeywords]);
          context.updateContext({ relevantKeywords: updatedKeywords });
        }

        return searchResults;
      },
    });

    this.strategies.set('context-aware-filter', {
      name: 'context-aware-filter',
      weight: 0.15,
      execute: async (query, context, _options) => {
        const results: LifelogSearchResult[] = [];

        // Fetch hot documents that other strategies found
        if (context.hotDocumentIds.size > 0) {
          logger.debug('Fetching hot documents', { count: context.hotDocumentIds.size });

          for (const docId of Array.from(context.hotDocumentIds)) {
            try {
              // Find the document in our file system
              const allLifelogs = await this.fileManager.loadAllLifelogs();
              const lifelog = allLifelogs.find((l) => l.id === docId);

              if (lifelog) {
                // Check if content matches any keywords or phrases
                const contentLower = lifelog.content.toLowerCase();
                const queryWords = query
                  .toLowerCase()
                  .split(/\s+/)
                  .filter((w) => w.length > 2);

                // Check for multi-word phrase matches
                // Extract potential phrases from the query (2-3 word sequences)
                const queryPhrases: string[] = [];
                const words = query.toLowerCase().split(/\s+/);

                // Extract 2-word phrases
                for (let i = 0; i < words.length - 1; i++) {
                  queryPhrases.push(`${words[i]} ${words[i + 1]}`);
                }

                // Extract 3-word phrases
                for (let i = 0; i < words.length - 2; i++) {
                  queryPhrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
                }

                let phraseMatchCount = 0;
                const matchedPhrases: string[] = [];
                for (const phrase of queryPhrases) {
                  if (phrase.length > 3 && contentLower.includes(phrase)) {
                    phraseMatchCount++;
                    matchedPhrases.push(phrase);
                  }
                }

                // Check individual keywords
                const keywordMatches = queryWords.filter((word) => contentLower.includes(word));

                if (keywordMatches.length > 0 || phraseMatchCount > 0) {
                  // Reduced base scores - require stronger evidence
                  let baseScore = 0.5; // Start lower

                  // Scale up based on match quality
                  if (phraseMatchCount > 0) {
                    baseScore = 0.65 + 0.1 * phraseMatchCount; // Phrase matches are valuable
                  } else if (keywordMatches.length >= queryWords.length * 0.5) {
                    baseScore = 0.6; // At least half the keywords matched
                  }

                  const keywordBonus = (0.05 * keywordMatches.length) / queryWords.length; // Reduced from 0.1
                  const phraseBonus = 0.1 * phraseMatchCount; // Reduced from 0.15

                  results.push({
                    id: docId,
                    lifelog,
                    score: Math.min(baseScore + keywordBonus + phraseBonus, 0.9), // Cap at 0.9 instead of 1.0
                    highlights: [
                      phraseMatchCount > 0 ? `Phrase matches: ${matchedPhrases.join(', ')}` : '',
                      keywordMatches.length > 0
                        ? `Keyword matches: ${keywordMatches.join(', ')}`
                        : '',
                    ].filter((h) => h),
                    metadata: {
                      source: 'context-aware-filter',
                      consensusStrategies: ['fast-keyword', 'vector-semantic'],
                      keywordMatches: keywordMatches.length,
                      phraseMatches: phraseMatchCount,
                    },
                  });
                }
              }
            } catch (error) {
              logger.debug('Failed to fetch hot document', { docId, error });
            }
          }
        }

        // Search within discovered date ranges
        if (context.discoveredDates.size > 0 && results.length < 10) {
          logger.debug('Searching within discovered dates', {
            dates: Array.from(context.discoveredDates),
          });

          for (const dateStr of Array.from(context.discoveredDates)) {
            try {
              const date = new Date(dateStr as string);
              const dayResults = await this.fileManager.listLifelogsByDate(date);

              for (const id of dayResults.slice(0, 5)) {
                if (!results.find((r) => r.id === id)) {
                  const lifelog = await this.fileManager.loadLifelog(id, date);
                  if (lifelog && lifelog.content.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                      id,
                      lifelog,
                      score: 0.4, // Reduced from 0.6 - date context alone is weak evidence
                      highlights: [`Date context: ${dateStr}`],
                      metadata: { source: 'context-aware-filter', dateContext: dateStr },
                    });
                  }
                }
              }
            } catch (error) {
              logger.debug('Failed to search date context', { dateStr, error });
            }
          }
        }

        return results;
      },
    });
  }

  async executeParallelSearch(
    query: string,
    preprocessed: ActualPreprocessedQuery,
    options: any
  ): Promise<{
    results: LifelogSearchResult[];
    performance: {
      totalTime: number;
      strategyTimings: Record<string, number>;
      failedStrategies: string[];
    };
    contextInsights: {
      hotDocuments: number;
      discoveredDates: number;
      relevantKeywords: number;
    };
  }> {
    const startTime = Date.now();
    const context = this.createSearchContext();
    const timings: StrategyTiming[] = [];

    // Determine which strategies to use
    const strategiesToUse = this.selectStrategies(preprocessed, options);

    logger.info('Executing parallel search with context sharing', {
      query,
      strategies: strategiesToUse,
    });

    // Execute Phase 1: Discovery strategies
    const phase1Strategies = strategiesToUse.filter((s) =>
      ['fast-keyword', 'smart-date'].includes(s)
    );

    const phase1Results = await this.executePhase(
      phase1Strategies,
      query,
      context,
      { ...options, preprocessed },
      timings
    );

    // Wait a bit for context to propagate
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Execute Phase 2: Enhanced strategies using context
    const phase2Strategies = strategiesToUse.filter((s) =>
      ['vector-semantic', 'context-aware-filter'].includes(s)
    );

    const phase2Results = await this.executePhase(
      phase2Strategies,
      query,
      context,
      { ...options, preprocessed },
      timings
    );

    // Merge all results
    const allResults = [...phase1Results, ...phase2Results];
    const mergedResults = this.mergeResultsWithContext(allResults, context);

    const totalTime = Date.now() - startTime;

    const strategyTimings = timings.reduce(
      (acc, t) => {
        acc[t.strategy] = t.duration;
        return acc;
      },
      {} as Record<string, number>
    );

    const failedStrategies = timings.filter((t) => !t.success).map((t) => t.strategy);

    logger.info('Parallel search with context sharing completed', {
      totalTime,
      strategyTimings,
      failedStrategies,
      resultCount: mergedResults.length,
      contextInsights: {
        hotDocuments: context.hotDocumentIds.size,
        discoveredDates: context.discoveredDates.size,
        relevantKeywords: context.relevantKeywords.size,
      },
    });

    return {
      results: mergedResults,
      performance: {
        totalTime,
        strategyTimings,
        failedStrategies,
      },
      contextInsights: {
        hotDocuments: context.hotDocumentIds.size,
        discoveredDates: context.discoveredDates.size,
        relevantKeywords: context.relevantKeywords.size,
      },
    };
  }

  private async executePhase(
    strategies: string[],
    query: string,
    context: SearchContext,
    options: any,
    timings: StrategyTiming[]
  ): Promise<LifelogSearchResult[]> {
    const promises = strategies.map(async (strategyName) => {
      const strategy = this.strategies.get(strategyName);
      if (!strategy) return null;

      const strategyStart = Date.now();
      try {
        const results = await strategy.execute(query, context, options);
        const duration = Date.now() - strategyStart;

        timings.push({
          strategy: strategyName,
          duration,
          resultCount: results.length,
          success: true,
        });

        return results;
      } catch (error) {
        const duration = Date.now() - strategyStart;
        logger.error(`Strategy ${strategyName} failed`, error);

        timings.push({
          strategy: strategyName,
          duration,
          resultCount: 0,
          success: false,
        });

        return null;
      }
    });

    const results = await Promise.allSettled(promises);
    const successfulResults = results
      .filter(
        (r): r is PromiseFulfilledResult<LifelogSearchResult[] | null> =>
          r.status === 'fulfilled' && r.value !== null
      )
      .map((r) => r.value!)
      .flat();

    return successfulResults;
  }

  private selectStrategies(preprocessed: ActualPreprocessedQuery, _options: any): string[] {
    const strategies: string[] = ['fast-keyword']; // Always use fast-keyword

    // Add smart-date if temporal references exist
    if (
      preprocessed.temporalInfo &&
      (preprocessed.temporalInfo.dates.length > 0 ||
        preprocessed.temporalInfo.dateRanges.length > 0 ||
        preprocessed.temporalInfo.hasMultipleTemporal)
    ) {
      strategies.push('smart-date');
    }

    // Add vector search if available
    if (this.vectorStore) {
      strategies.push('vector-semantic');
    }

    // Always add context-aware filter for consensus
    strategies.push('context-aware-filter');

    return strategies;
  }

  private createSearchContext(): SearchContext {
    const context: SearchContext = {
      hotDocumentIds: new Set(),
      discoveredDates: new Set(),
      relevantKeywords: new Set(),
      strategyConfidence: new Map(),
      updateContext: (updates: Partial<SearchContext>) => {
        if (updates.hotDocumentIds) {
          updates.hotDocumentIds.forEach((id: string) => context.hotDocumentIds.add(id));
        }
        if (updates.discoveredDates) {
          updates.discoveredDates.forEach((date: string) => context.discoveredDates.add(date));
        }
        if (updates.relevantKeywords) {
          updates.relevantKeywords.forEach((kw: string) => context.relevantKeywords.add(kw));
        }
        if (updates.strategyConfidence) {
          updates.strategyConfidence.forEach((conf: number, strategy: string) => {
            context.strategyConfidence.set(strategy, conf);
          });
        }
      },
    };

    return context;
  }

  private mergeResultsWithContext(
    results: LifelogSearchResult[],
    context: SearchContext
  ): LifelogSearchResult[] {
    const resultMap = new Map<string, LifelogSearchResult & { strategies: Set<string> }>();

    // First pass: collect all results and track which strategies found them
    for (const result of results) {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Merge result
        existing.score = Math.max(existing.score, result.score);
        existing.highlights = [...(existing.highlights || []), ...(result.highlights || [])];
        existing.strategies.add(result.metadata?.source || 'unknown');

        // Keep the metadata with more information
        if (
          result.metadata &&
          Object.keys(result.metadata).length > Object.keys(existing.metadata || {}).length
        ) {
          existing.metadata = { ...existing.metadata, ...result.metadata };
        }
      } else {
        resultMap.set(result.id, {
          ...result,
          strategies: new Set([result.metadata?.source || 'unknown']),
        });
      }
    }

    // Second pass: apply boosts based on context and consensus
    const boostedResults = Array.from(resultMap.values()).map((result) => {
      let finalScore = result.score;
      const strategyCount = result.strategies.size;

      // Consensus boost: exponential boost for multiple strategies
      if (strategyCount >= 2) {
        finalScore *= Math.pow(1.15, strategyCount - 1);
        logger.debug('Applied consensus boost', {
          id: result.id,
          strategies: Array.from(result.strategies),
          boost: Math.pow(1.15, strategyCount - 1),
        });
      }

      // Hot document boost
      if (context.hotDocumentIds.has(result.id)) {
        finalScore *= 1.1;
      }

      // Temporal relevance boost
      if (context.discoveredDates.size > 0 && result.lifelog.createdAt) {
        const docDate = new Date(result.lifelog.createdAt);
        const relevantDates = Array.from(context.discoveredDates).map((d) => new Date(d as string));
        const closestDateDiff = Math.min(
          ...relevantDates.map(
            (d) => Math.abs(docDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
          )
        );

        // Decay by 5% per day away from relevant date
        const temporalBoost = Math.max(0.7, 1 - closestDateDiff * 0.05);
        finalScore *= temporalBoost;
      }

      // Keyword density boost
      const queryWords = Array.from(context.relevantKeywords);
      if (queryWords.length > 0) {
        const contentLower = result.lifelog.content.toLowerCase();
        const matchedKeywords = queryWords.filter((kw: string) =>
          contentLower.includes((kw as string).toLowerCase())
        );
        const keywordBoost = 1 + 0.05 * matchedKeywords.length;
        finalScore *= keywordBoost;
      }

      return {
        ...result,
        score: finalScore,
        metadata: {
          ...result.metadata,
          strategies: Array.from(result.strategies),
          finalScore,
          originalScore: result.score,
        },
      };
    });

    // Sort by final score
    boostedResults.sort((a, b) => b.score - a.score);

    // Remove the temporary strategies property
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return boostedResults.map(({ strategies, ...result }) => result);
  }
}
