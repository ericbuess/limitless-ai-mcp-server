import { logger } from '../utils/logger.js';
import type { Phase2Lifelog } from '../types/phase2.js';
import type { UnifiedSearchOptions, UnifiedSearchResult } from './unified-search.js';
import type { FastPatternMatcher } from './fast-patterns.js';
import type { BaseVectorStore } from '../vector-store/vector-store.interface.js';
import type { QueryClassification } from './query-router.js';

/**
 * Shared context for inter-strategy communication
 */
export interface SearchContext {
  // Discovered date ranges from any strategy
  discoveredDates: Set<string>;
  // High-scoring document IDs that other strategies should prioritize
  hotDocumentIds: Set<string>;
  // Keywords found to be particularly relevant
  relevantKeywords: Set<string>;
  // Confidence scores from each strategy
  strategyConfidence: Map<string, number>;
  // Lock for thread-safe updates
  updateContext: (updates: Partial<SearchContext>) => void;
}

export interface EnhancedSearchStrategy {
  name: string;
  execute: (context: SearchContext) => Promise<any>;
  weight: number;
  enabled: boolean;
  // Strategies can subscribe to context updates
  onContextUpdate?: (context: SearchContext) => void;
}

export interface ParallelSearchResult extends UnifiedSearchResult {
  strategyTimings: Record<string, number>;
  failedStrategies: string[];
  searchContext?: SearchContext;
}

/**
 * Enhanced parallel search executor with inter-strategy communication
 */
export class ParallelSearchExecutor {
  private searchContext!: SearchContext;

  constructor(
    private fastMatcher: FastPatternMatcher,
    private vectorStore: BaseVectorStore | null,
    _fileManager: any // Future use for metadata search
  ) {}

  /**
   * Create a shared context with thread-safe update mechanism
   */
  private createSearchContext(): SearchContext {
    const context: SearchContext = {
      discoveredDates: new Set(),
      hotDocumentIds: new Set(),
      relevantKeywords: new Set(),
      strategyConfidence: new Map(),
      updateContext: (updates: Partial<SearchContext>) => {
        // Thread-safe updates
        if (updates.discoveredDates) {
          updates.discoveredDates.forEach((date) => context.discoveredDates.add(date));
        }
        if (updates.hotDocumentIds) {
          updates.hotDocumentIds.forEach((id) => context.hotDocumentIds.add(id));
        }
        if (updates.relevantKeywords) {
          updates.relevantKeywords.forEach((kw) => context.relevantKeywords.add(kw));
        }
        if (updates.strategyConfidence) {
          updates.strategyConfidence.forEach((conf, strategy) =>
            context.strategyConfidence.set(strategy, conf)
          );
        }
      },
    };
    return context;
  }

  /**
   * Execute all search strategies with inter-strategy communication
   */
  async search(
    query: string,
    classification: QueryClassification,
    options: UnifiedSearchOptions = {}
  ): Promise<ParallelSearchResult> {
    const startTime = Date.now();
    const limit = options.limit || 20;
    this.searchContext = this.createSearchContext();

    // Define enhanced search strategies
    const strategies: EnhancedSearchStrategy[] = [
      {
        name: 'fast-keyword',
        execute: async (context) => {
          const results = await this.fastMatcher.search(query, {
            maxResults: limit * 2, // Get more results to filter
            scoreThreshold: options.scoreThreshold || 0.1,
          });

          // Share high-scoring results with other strategies
          if (results.length > 0) {
            const topResults = results.slice(0, 5);
            const hotIds = new Set(topResults.map((r) => r.lifelog.id));
            const dates = new Set(
              topResults.map((r) => new Date(r.lifelog.createdAt).toISOString().split('T')[0])
            );

            context.updateContext({
              hotDocumentIds: hotIds,
              discoveredDates: dates,
              strategyConfidence: new Map([['fast-keyword', results[0].score]]),
            });
          }

          // Boost scores for documents that vector search also found
          return results.map((result) => ({
            ...result,
            score: context.hotDocumentIds.has(result.lifelog.id)
              ? result.score * 1.2
              : result.score,
          }));
        },
        weight: 0.3,
        enabled: true,
      },
      {
        name: 'vector-semantic',
        execute: async (context) => {
          if (!this.vectorStore) return [];

          // Use discovered keywords to enhance vector search
          const enhancedQuery =
            context.relevantKeywords.size > 0
              ? `${query} ${Array.from(context.relevantKeywords).join(' ')}`
              : query;

          const results = await this.vectorStore.searchByText(enhancedQuery, {
            topK: limit * 2,
            includeContent: options.includeContent,
            includeMetadata: options.includeMetadata,
            scoreThreshold: options.scoreThreshold,
            // Prefer documents from discovered dates
            filter:
              context.discoveredDates.size > 0
                ? {
                    date: { $in: Array.from(context.discoveredDates) },
                  }
                : undefined,
          });

          // Share semantic insights
          if (results.length > 0) {
            const topResults = results.slice(0, 5);
            const hotIds = new Set(topResults.map((r) => r.id));

            // Extract keywords from top semantic matches
            const keywords = new Set<string>();
            topResults.forEach((r) => {
              if (r.metadata?.keywords) {
                r.metadata.keywords.forEach((kw: string) => keywords.add(kw));
              }
            });

            context.updateContext({
              hotDocumentIds: hotIds,
              relevantKeywords: keywords,
              strategyConfidence: new Map([['vector-semantic', results[0].score]]),
            });
          }

          return results;
        },
        weight: 0.4,
        enabled: this.vectorStore !== null,
      },
      {
        name: 'smart-date',
        execute: async (context) => {
          // Use discovered dates from other strategies
          const datesToSearch = new Set([
            ...(classification.extractedEntities.dates || []),
            ...context.discoveredDates,
          ]);

          if (datesToSearch.size === 0) return [];

          const allResults = [];
          for (const date of datesToSearch) {
            const dateObj = date instanceof Date ? date : new Date(date);
            const results = await this.fastMatcher.searchByDateRange(dateObj, dateObj, query, {
              maxResults: limit,
            });
            allResults.push(...results);
          }

          // Boost scores for hot documents
          return allResults.map((result) => ({
            ...result,
            score: context.hotDocumentIds.has(result.lifelog.id)
              ? result.score * 1.3
              : result.score,
          }));
        },
        weight: 0.2,
        enabled:
          (classification.extractedEntities.dates?.length ?? 0) > 0 ||
          this.searchContext.discoveredDates.size > 0,
      },
      {
        name: 'context-aware-filter',
        execute: async (context) => {
          // This strategy specifically looks for documents that multiple strategies agree on
          if (context.hotDocumentIds.size === 0) return [];

          // Get metadata for hot documents
          const hotDocResults: any[] = [];
          // In a real implementation, fetch metadata for hot documents from fileManager
          logger.debug('Context-aware filtering for hot documents', {
            hotDocs: context.hotDocumentIds.size,
            keywords: context.relevantKeywords.size,
          });

          return hotDocResults;
        },
        weight: 0.1,
        enabled: true,
      },
    ];

    // Filter enabled strategies
    const enabledStrategies = strategies.filter((s) => s.enabled);
    logger.info(`Executing ${enabledStrategies.length} search strategies with context sharing`, {
      query,
      strategies: enabledStrategies.map((s) => s.name),
    });

    // Execute all strategies in parallel with shared context
    const strategyPromises = enabledStrategies.map((strategy) => ({
      name: strategy.name,
      weight: strategy.weight,
      promise: strategy
        .execute(this.searchContext)
        .then((result) => ({
          success: true,
          result,
          timing: Date.now() - startTime,
        }))
        .catch((error) => {
          logger.warn(`Search strategy ${strategy.name} failed`, { error });
          return {
            success: false,
            error,
            timing: Date.now() - startTime,
          };
        }),
    }));

    // Wait for all strategies to complete
    const results = await Promise.allSettled(strategyPromises.map((sp) => sp.promise));

    // Process results
    const strategyTimings: Record<string, number> = {};
    const failedStrategies: string[] = [];
    const successfulResults: Array<{
      name: string;
      weight: number;
      results: any[];
    }> = [];

    results.forEach((result, index) => {
      const strategy = strategyPromises[index];

      if (result.status === 'fulfilled' && result.value.success) {
        strategyTimings[strategy.name] = result.value.timing;
        successfulResults.push({
          name: strategy.name,
          weight: strategy.weight,
          results: Array.isArray((result.value as any).result) ? (result.value as any).result : [],
        });
      } else {
        failedStrategies.push(strategy.name);
        strategyTimings[strategy.name] =
          result.status === 'fulfilled' ? result.value.timing : Date.now() - startTime;
      }
    });

    // Merge results with context-aware scoring
    const mergedResults = this.mergeResultsWithContext(
      successfulResults,
      limit,
      this.searchContext
    );

    logger.info('Parallel search with context sharing completed', {
      totalTime: Date.now() - startTime,
      strategyTimings,
      failedStrategies,
      resultCount: mergedResults.length,
      contextInsights: {
        hotDocuments: this.searchContext.hotDocumentIds.size,
        discoveredDates: this.searchContext.discoveredDates.size,
        relevantKeywords: this.searchContext.relevantKeywords.size,
      },
    });

    return {
      query,
      strategy: 'parallel',
      results: mergedResults,
      performance: {
        totalTime: Date.now() - startTime,
        searchTime: Math.max(...Object.values(strategyTimings)),
        strategy: 'parallel',
        cacheHit: false,
      },
      strategyTimings,
      failedStrategies,
      searchContext: this.searchContext,
    };
  }

  /**
   * Merge results with context-aware scoring adjustments
   */
  private mergeResultsWithContext(
    strategyResults: Array<{
      name: string;
      weight: number;
      results: any[];
    }>,
    limit: number,
    context: SearchContext
  ): UnifiedSearchResult['results'] {
    const resultMap = new Map<
      string,
      {
        id: string;
        score: number;
        lifelog?: Phase2Lifelog;
        highlights?: string[];
        metadata: Record<string, any>;
        sources: string[];
        strategyCount: number;
      }
    >();

    // Process each strategy's results
    for (const { name, weight, results } of strategyResults) {
      for (const result of results) {
        const id = result.id || result.lifelog?.id;
        if (!id) continue;

        const existing = resultMap.get(id);
        if (existing) {
          // Document found by multiple strategies - boost score
          existing.score += (result.score || 0) * weight * 1.1; // 10% boost for consensus
          existing.sources.push(name);
          existing.strategyCount++;

          // Merge highlights
          if (result.matches) {
            existing.highlights = [
              ...(existing.highlights || []),
              ...result.matches.map((m: any) => m.context),
            ];
          }

          // Merge metadata
          existing.metadata = {
            ...existing.metadata,
            ...result.metadata,
            matchingSources: existing.sources,
            isHotDocument: context.hotDocumentIds.has(id),
            consensusScore: existing.strategyCount / strategyResults.length,
          };
        } else {
          // New result
          resultMap.set(id, {
            id,
            score: (result.score || 0) * weight,
            lifelog: result.lifelog,
            highlights: result.matches?.map((m: any) => m.context),
            metadata: {
              ...result.metadata,
              source: name,
              matchingSources: [name],
              isHotDocument: context.hotDocumentIds.has(id),
              consensusScore: 1 / strategyResults.length,
            },
            sources: [name],
            strategyCount: 1,
          });
        }
      }
    }

    // Apply final context-based scoring adjustments
    resultMap.forEach((result, id) => {
      // Boost documents that multiple strategies found
      if (result.strategyCount >= 2) {
        result.score *= 1.2;
      }

      // Boost hot documents identified during search
      if (context.hotDocumentIds.has(id)) {
        result.score *= 1.15;
      }
    });

    // Sort by combined score and return top results
    return Array.from(resultMap.values())
      .map(({ sources: _sources, strategyCount: _count, ...rest }) => rest)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
