// Search is always local - no API client needed
import { FileManager } from '../storage/file-manager.js';
import { QueryRouter, QueryType } from './query-router.js';
import { FastPatternMatcher } from './fast-patterns.js';
import { ClaudeOrchestrator } from './claude-orchestrator.js';
import { IntelligentCache } from '../cache/intelligent-cache.js';
import { ParallelSearchExecutor } from './parallel-search-executor.js';
import { QueryPreprocessor, PreprocessedQuery, QueryIntent } from './query-preprocessor.js';
import { temporalPeopleExtractor } from './temporal-people-extractor.js';
import { HybridSearcher } from './hybrid-searcher.js';
import { LanceDBStore } from '../vector-store/lancedb-store.js';
import { meetingSummaryExtractor } from './meeting-summary-extractor.js';
import { queryDecomposer } from './query-decomposer.js';
import { logger } from '../utils/logger.js';
import type { Phase2Lifelog } from '../types/phase2.js';
import type {
  VectorSearchResult,
  BaseVectorStore,
} from '../vector-store/vector-store.interface.js';
import type { FastSearchResult } from './fast-patterns.js';
import type { ClaudeSearchResult } from './claude-orchestrator.js';

export interface UnifiedSearchOptions {
  strategy?: 'auto' | 'fast' | 'vector' | 'hybrid' | 'claude' | 'parallel';
  limit?: number;
  includeContent?: boolean;
  includeMetadata?: boolean;
  scoreThreshold?: number;
  enableCache?: boolean;
  enableLearning?: boolean;
  enableParallel?: boolean;
  enableQueryExpansion?: boolean;
}

export interface UnifiedSearchResult {
  query: string;
  strategy: 'fast' | 'vector' | 'hybrid' | 'claude' | 'parallel';
  results: Array<{
    id: string;
    score: number;
    lifelog?: Phase2Lifelog;
    highlights?: string[];
    metadata?: Record<string, any>;
  }>;
  insights?: string;
  actionItems?: string[];
  summary?: string;
  performance: {
    totalTime: number;
    searchTime: number;
    strategy: string;
    cacheHit: boolean;
  };
  strategyTimings?: Record<string, number>;
  failedStrategies?: string[];
  contextInsights?: {
    hotDocuments: number;
    discoveredDates: number;
    relevantKeywords: number;
  };
  peopleInsights?: {
    extractedPeople: string[];
    timeframe: string;
    meetingCount: number;
  };
  meetingInsights?: {
    meetingCount: number;
    participants: string[];
    mainTopics: string[];
    decisions: string[];
    confidence: number;
  };
  decompositionInsights?: {
    subQueryCount: number;
    complexity: number;
    executedQueries: number;
  };
}

export class UnifiedSearchHandler {
  private fileManager: FileManager;
  private vectorStore: BaseVectorStore | null = null;
  private queryRouter: QueryRouter;
  private queryPreprocessor: QueryPreprocessor;
  private fastMatcher: FastPatternMatcher;
  private claudeOrchestrator: ClaudeOrchestrator | null = null;
  private cache: IntelligentCache;
  private parallelExecutor: ParallelSearchExecutor | null = null;
  private hybridSearcher: HybridSearcher | null = null;
  private isInitialized: boolean = false;

  constructor(
    fileManager: FileManager,
    options: {
      enableVectorStore?: boolean;
      enableClaude?: boolean;
      cacheOptions?: any;
    } = {}
  ) {
    this.fileManager = fileManager;
    this.queryRouter = new QueryRouter();
    this.queryPreprocessor = new QueryPreprocessor();
    this.fastMatcher = new FastPatternMatcher();
    this.cache = new IntelligentCache(options.cacheOptions);

    // Always use LanceDB for vector store (when enabled)
    if (options.enableVectorStore !== false) {
      this.vectorStore = new LanceDBStore({
        collectionName: 'limitless-chunks',
        persistPath: './data/lancedb',
      });
    }

    if (options.enableClaude) {
      this.claudeOrchestrator = new ClaudeOrchestrator();
    }
  }

  /**
   * Initialize the search handler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info('Initializing unified search handler');

    // Initialize components
    await this.fileManager.initialize();

    // Initialize vector store if present
    if (this.vectorStore) {
      try {
        await this.vectorStore.initialize();
      } catch (error) {
        logger.error('Vector store initialization failed', { error });
        // Vector store is critical for search quality, don't silently fail
        throw error;
      }
    }

    // Build initial fast search index
    await this.buildFastSearchIndex();

    // Initialize parallel executor after vector store is ready
    this.parallelExecutor = new ParallelSearchExecutor(
      this.fastMatcher,
      this.vectorStore,
      this.fileManager
    );

    // Initialize hybrid searcher if we have vector store
    if (this.vectorStore && this.vectorStore instanceof LanceDBStore) {
      this.hybridSearcher = new HybridSearcher(this.vectorStore);
      await this.hybridSearcher.initialize();
      logger.info('Hybrid searcher initialized with BM25 + vector search');
    }

    this.isInitialized = true;
    logger.info('Unified search handler initialized');
  }

  /**
   * Perform a unified search
   */
  async search(query: string, options: UnifiedSearchOptions = {}): Promise<UnifiedSearchResult> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check cache first
    if (options.enableCache !== false) {
      const cached = this.cache.get(query);
      if (cached) {
        return {
          ...cached.results,
          performance: {
            totalTime: Date.now() - startTime,
            searchTime: 0,
            strategy: cached.strategy,
            cacheHit: true,
          },
        };
      }
    }

    // Preprocess query
    const preprocessed = this.queryPreprocessor.preprocess(query);
    logger.debug('Query preprocessing complete', {
      original: query,
      normalized: preprocessed.normalized,
      expandedCount: preprocessed.expandedQueries.length,
      intent: preprocessed.intent,
      entities: preprocessed.entities,
    });

    // Classify query with preprocessed data
    const classification = await this.queryRouter.classifyQuery(preprocessed.normalized);

    // Get suggested strategy from cache if learning is enabled
    let strategy = options.strategy || 'auto';
    if (strategy === 'auto' && options.enableLearning !== false) {
      const learnedStrategy = this.cache.getSuggestedStrategy(query, classification);
      if (learnedStrategy) {
        strategy = learnedStrategy;
      } else {
        // Use parallel by default if enabled
        strategy =
          options.enableParallel !== false && this.parallelExecutor
            ? 'parallel'
            : classification.suggestedStrategy;
      }
    } else if (strategy === 'auto') {
      // Use parallel by default if enabled
      strategy =
        options.enableParallel !== false && this.parallelExecutor
          ? 'parallel'
          : classification.suggestedStrategy;
    }

    // Execute search based on strategy
    let result: UnifiedSearchResult;
    const searchStartTime = Date.now();

    // Check if we should use query expansion
    const shouldUseQueryExpansion =
      options.enableQueryExpansion !== false &&
      preprocessed.expandedQueries.length > 1 &&
      strategy !== 'parallel'; // Don't expand if already using parallel executor

    if (shouldUseQueryExpansion) {
      // Use parallel query expansion
      result = await this.executeParallelQueryExpansion(
        preprocessed,
        classification,
        strategy,
        options
      );
    } else {
      // Regular search execution
      switch (strategy) {
        case 'parallel':
          if (this.parallelExecutor) {
            const parallelResult = await this.parallelExecutor.executeParallelSearch(
              query,
              preprocessed,
              options
            );
            result = {
              query,
              results: parallelResult.results,
              strategy: 'parallel',
              performance: {
                ...parallelResult.performance,
                searchTime: parallelResult.performance.totalTime,
                strategy: 'parallel',
                cacheHit: false,
              },
              strategyTimings: parallelResult.performance.strategyTimings,
              failedStrategies: parallelResult.performance.failedStrategies,
              contextInsights: parallelResult.contextInsights,
            };
          } else {
            // Fallback to hybrid search
            result = await this.executeHybridSearch(query, classification, options);
          }
          break;

        case 'fast':
          result = await this.executeFastSearch(query, classification, options);
          break;

        case 'vector':
          if (this.vectorStore) {
            result = await this.executeVectorSearch(query, classification, options);
          } else {
            // Fallback to fast search
            result = await this.executeFastSearch(query, classification, options);
          }
          break;

        case 'hybrid':
          result = await this.executeHybridSearch(query, classification, options);
          break;

        case 'claude':
          if (this.claudeOrchestrator && this.claudeOrchestrator.isClaudeAvailable()) {
            result = await this.executeClaudeSearch(query, classification, options);
          } else {
            // Fallback to hybrid search
            result = await this.executeHybridSearch(query, classification, options);
          }
          break;

        default:
          result = await this.executeFastSearch(query, classification, options);
      }
    }

    const searchTime = Date.now() - searchStartTime;
    result.performance = {
      totalTime: Date.now() - startTime,
      searchTime,
      strategy: result.strategy,
      cacheHit: false,
    };

    // Cache the result
    if (options.enableCache !== false) {
      this.cache.set(query, classification, result, searchTime);
    }

    // Update performance metrics
    this.queryRouter.updatePerformanceMetrics(classification.type, searchTime);

    // Check if this is a "who did I meet" type query and enhance results
    if (this.isPeopleQuery(preprocessed)) {
      result = this.enhanceWithPeopleInfo(result, preprocessed);
    }

    // Check if this is a meeting recap query and enhance with summaries
    if (this.isMeetingRecapQuery(preprocessed)) {
      result = await this.enhanceWithMeetingSummaries(result, preprocessed);
    }

    // Check if query needs decomposition
    const decomposed = queryDecomposer.decompose(query);
    if (decomposed.subQueries.length > 1) {
      result = await this.executeDecomposedQuery(decomposed, result, preprocessed, options);
    }

    return result;
  }

  /**
   * Execute parallel query expansion
   * Runs multiple query variations in parallel for better recall
   */
  private async executeParallelQueryExpansion(
    preprocessed: PreprocessedQuery,
    classification: any,
    strategy: string,
    options: UnifiedSearchOptions
  ): Promise<UnifiedSearchResult> {
    const startTime = Date.now();
    const limit = options.limit || 20;

    // Get query variations (max 5 to avoid too many parallel requests)
    const queries = preprocessed.expandedQueries.slice(0, 5);
    logger.debug(`Running parallel query expansion with ${queries.length} variations`, { queries });

    // Execute searches for all variations in parallel
    const searchPromises = queries.map(async (queryVariation) => {
      try {
        // Use the underlying strategy for each variation
        switch (strategy) {
          case 'fast':
            return await this.executeFastSearch(queryVariation, classification, {
              ...options,
              enableCache: false, // Don't cache individual variations
            });
          case 'vector':
            return await this.executeVectorSearch(queryVariation, classification, {
              ...options,
              enableCache: false,
            });
          case 'hybrid':
            return await this.executeHybridSearch(queryVariation, classification, {
              ...options,
              enableCache: false,
            });
          default:
            return await this.executeFastSearch(queryVariation, classification, {
              ...options,
              enableCache: false,
            });
        }
      } catch (error) {
        logger.warn(`Query variation failed: ${queryVariation}`, error);
        return null;
      }
    });

    // Wait for all searches to complete
    const results = await Promise.all(searchPromises);
    const validResults = results.filter((r) => r !== null) as UnifiedSearchResult[];

    // Merge results with consensus scoring
    const mergedResults = this.mergeParallelResults(validResults, preprocessed);

    return {
      query: preprocessed.original,
      strategy: strategy as any,
      results: mergedResults.slice(0, limit),
      performance: {
        totalTime: Date.now() - startTime,
        searchTime: Date.now() - startTime,
        strategy: `${strategy}-parallel`,
        cacheHit: false,
      },
      insights: `Searched ${queries.length} query variations in parallel`,
    };
  }

  /**
   * Merge results from parallel query expansion with consensus scoring
   */
  private mergeParallelResults(
    results: UnifiedSearchResult[],
    preprocessed: PreprocessedQuery
  ): UnifiedSearchResult['results'] {
    // Track how many queries found each document
    const documentScores = new Map<
      string,
      {
        score: number;
        count: number;
        lifelog?: Phase2Lifelog;
        highlights: Set<string>;
        metadata?: Record<string, any>;
      }
    >();

    // Aggregate results
    for (const result of results) {
      for (const item of result.results) {
        const existing = documentScores.get(item.id);
        if (existing) {
          // Document found by multiple queries - boost score
          existing.count++;
          existing.score = Math.max(existing.score, item.score) * (1 + 0.2 * existing.count); // 20% boost per additional query
          if (item.highlights) {
            item.highlights.forEach((h) => existing.highlights.add(h));
          }
        } else {
          // First time seeing this document
          documentScores.set(item.id, {
            score: item.score,
            count: 1,
            lifelog: item.lifelog,
            highlights: new Set(item.highlights || []),
            metadata: item.metadata,
          });
        }
      }
    }

    // Convert to array and sort by score
    const sortedResults = Array.from(documentScores.entries())
      .map(([id, data]) => ({
        id,
        score: data.score,
        lifelog: data.lifelog,
        highlights: Array.from(data.highlights),
        metadata: {
          ...data.metadata,
          consensusCount: data.count,
          queryVariations: preprocessed.expandedQueries.slice(0, 5),
        },
      }))
      .sort((a, b) => b.score - a.score);

    return sortedResults;
  }

  /**
   * Execute fast pattern search
   */
  private async executeFastSearch(
    query: string,
    classification: any,
    options: UnifiedSearchOptions
  ): Promise<UnifiedSearchResult> {
    const searchOptions = {
      maxResults: options.limit || 20,
      scoreThreshold: options.scoreThreshold || 0.1,
    };

    // Check if it's a date-based query
    if (
      classification.type === QueryType.DATE_BASED &&
      classification.extractedEntities.dates?.length > 0
    ) {
      const date = classification.extractedEntities.dates[0];
      const results = await this.fastMatcher.searchByDateRange(date, date, query, searchOptions);

      return this.formatFastSearchResults(query, results, 'fast');
    }

    // Regular keyword search
    const results = await this.fastMatcher.search(query, searchOptions);
    return this.formatFastSearchResults(query, results, 'fast');
  }

  /**
   * Execute vector similarity search
   */
  private async executeVectorSearch(
    query: string,
    _classification: any,
    options: UnifiedSearchOptions
  ): Promise<UnifiedSearchResult> {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }

    const searchOptions = {
      topK: options.limit || 20,
      includeContent: options.includeContent,
      includeMetadata: options.includeMetadata,
      scoreThreshold: options.scoreThreshold,
    };

    const results = await this.vectorStore.searchByText(query, searchOptions);
    return this.formatVectorSearchResults(query, results, 'vector');
  }

  /**
   * Execute hybrid search (fast + vector)
   */
  private async executeHybridSearch(
    query: string,
    _classification: any,
    options: UnifiedSearchOptions
  ): Promise<UnifiedSearchResult> {
    const limit = options.limit || 20;

    // If we have a hybrid searcher, use it for better BM25 + vector fusion
    if (this.hybridSearcher) {
      const results = await this.hybridSearcher.search(query, {
        topK: limit,
        includeContent: options.includeContent,
        includeMetadata: options.includeMetadata,
        scoreThreshold: options.scoreThreshold,
      });

      // Load lifelogs for the results
      const resultsWithLifelogs = await Promise.all(
        results.map(async (result) => {
          let lifelog: Phase2Lifelog | null = null;
          let id = result.id;

          // Check if this is a chunk result (has parentId in metadata)
          if (result.metadata?.parentId) {
            id = result.metadata.parentId;
            const parentDate = result.metadata.parentDate || result.metadata.date;
            if (parentDate) {
              lifelog = await this.fileManager.loadLifelog(id, new Date(parentDate));
            }
          } else if (result.metadata?.date) {
            // Regular result with date metadata
            lifelog = await this.fileManager.loadLifelog(result.id, new Date(result.metadata.date));
          }

          return {
            id,
            score: result.score,
            lifelog: lifelog || undefined,
            metadata: {
              ...result.metadata,
              source: result.source,
              keywordScore: result.keywordScore,
              vectorScore: result.vectorScore,
              chunkId: result.metadata?.parentId ? result.id : undefined,
            },
          };
        })
      );

      return {
        query,
        strategy: 'hybrid',
        results: resultsWithLifelogs.filter((r) => r.lifelog !== undefined),
        performance: {
          totalTime: 0,
          searchTime: 0,
          strategy: 'hybrid',
          cacheHit: false,
        },
      };
    }

    // Fallback to simple parallel search
    const [fastResults, vectorResults] = await Promise.all([
      this.fastMatcher.search(query, { maxResults: limit }),
      this.vectorStore?.searchByText(query, { topK: limit }) || Promise.resolve([]),
    ]);

    // Merge and rank results
    const mergedResults = this.mergeSearchResults(fastResults, vectorResults);

    return {
      query,
      strategy: 'hybrid',
      results: mergedResults.slice(0, limit),
      performance: {
        totalTime: 0,
        searchTime: 0,
        strategy: 'hybrid',
        cacheHit: false,
      },
    };
  }

  /**
   * Execute Claude-orchestrated search
   */
  private async executeClaudeSearch(
    query: string,
    _classification: any,
    _options: UnifiedSearchOptions
  ): Promise<UnifiedSearchResult> {
    if (!this.claudeOrchestrator) {
      throw new Error('Claude orchestrator not initialized');
    }

    // First get candidate lifelogs using fast search
    const candidates = await this.fastMatcher.search(query, { maxResults: 50 });
    const lifelogs = candidates.map((r) => r.lifelog);

    // Execute Claude search
    const claudeResult = await this.claudeOrchestrator.executeComplexSearch(query, lifelogs, {
      maxTurns: 3,
    });

    return this.formatClaudeSearchResults(query, claudeResult);
  }

  /**
   * Format fast search results
   */
  private formatFastSearchResults(
    query: string,
    results: FastSearchResult[],
    strategy: 'fast' | 'hybrid'
  ): UnifiedSearchResult {
    return {
      query,
      strategy,
      results: results.map((r) => ({
        id: r.lifelog.id,
        score: r.score,
        lifelog: r.lifelog,
        highlights: r.matches.map((m) => m.context),
        metadata: {
          matchCount: r.matches.length,
          matchTypes: [...new Set(r.matches.map((m) => m.type))],
        },
      })),
      performance: {
        totalTime: 0,
        searchTime: 0,
        strategy,
        cacheHit: false,
      },
    };
  }

  /**
   * Format vector search results
   */
  private async formatVectorSearchResults(
    query: string,
    results: VectorSearchResult[],
    strategy: 'vector' | 'hybrid'
  ): Promise<UnifiedSearchResult> {
    // Handle chunked results - need to load parent documents
    const formattedResults = await Promise.all(
      results.map(async (r) => {
        // Check if this is a chunk result (has parentId in metadata)
        if (r.metadata?.parentId) {
          try {
            // Load the parent lifelog
            const parentDate = r.metadata.parentDate ? new Date(r.metadata.parentDate) : null;
            if (parentDate) {
              const lifelog = await this.fileManager.loadLifelog(r.metadata.parentId, parentDate);
              if (lifelog) {
                return {
                  id: r.metadata.parentId,
                  score: r.score,
                  lifelog,
                  metadata: {
                    ...r.metadata,
                    chunkId: r.id,
                    chunkContent: r.content,
                  },
                };
              }
            }
          } catch (error) {
            logger.warn('Failed to load parent lifelog for chunk', {
              chunkId: r.id,
              parentId: r.metadata.parentId,
              error,
            });
          }
        }

        // Not a chunk or failed to load parent - return as is
        return {
          id: r.id,
          score: r.score,
          metadata: r.metadata,
        };
      })
    );

    // Deduplicate results by parent ID (multiple chunks might match from same document)
    const uniqueResults = new Map<string, (typeof formattedResults)[0]>();
    for (const result of formattedResults) {
      const id = result.id;
      const existing = uniqueResults.get(id);
      if (!existing || result.score > existing.score) {
        uniqueResults.set(id, result);
      }
    }

    return {
      query,
      strategy,
      results: Array.from(uniqueResults.values()).sort((a, b) => b.score - a.score),
      performance: {
        totalTime: 0,
        searchTime: 0,
        strategy,
        cacheHit: false,
      },
    };
  }

  /**
   * Format Claude search results
   */
  private formatClaudeSearchResults(
    query: string,
    claudeResult: ClaudeSearchResult
  ): UnifiedSearchResult {
    return {
      query,
      strategy: 'claude',
      results: claudeResult.results.lifelogs.map((log, index) => ({
        id: log.id,
        score: 1 - index / claudeResult.results.lifelogs.length, // Score by position
        lifelog: log,
      })),
      insights: claudeResult.results.insights,
      actionItems: claudeResult.results.actionItems,
      summary: claudeResult.results.summary,
      performance: {
        totalTime: claudeResult.metadata.executionTime,
        searchTime: claudeResult.metadata.executionTime,
        strategy: 'claude',
        cacheHit: false,
      },
    };
  }

  /**
   * Merge results from different search strategies
   */
  private mergeSearchResults(
    fastResults: FastSearchResult[],
    vectorResults: VectorSearchResult[]
  ): UnifiedSearchResult['results'] {
    const resultMap = new Map<string, UnifiedSearchResult['results'][0]>();

    // Add fast search results
    for (const result of fastResults) {
      resultMap.set(result.lifelog.id, {
        id: result.lifelog.id,
        score: result.score * 0.4, // Weight for fast search
        lifelog: result.lifelog,
        highlights: result.matches.map((m) => m.context),
        metadata: { source: 'fast' },
      });
    }

    // Merge vector search results
    for (const result of vectorResults) {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Combine scores
        existing.score += result.score * 0.6; // Weight for vector search
        existing.metadata = { ...existing.metadata, ...result.metadata, source: 'hybrid' };
      } else {
        resultMap.set(result.id, {
          id: result.id,
          score: result.score * 0.6,
          metadata: { ...result.metadata, source: 'vector' },
        });
      }
    }

    // Sort by combined score
    return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Build or rebuild the fast search index
   */
  async buildFastSearchIndex(): Promise<void> {
    logger.info('Building fast search index');

    try {
      // Load ALL lifelogs from local storage instead of using API
      const localLifelogs = await this.fileManager.loadAllLifelogs();

      // No need to convert - loadAllLifelogs() already returns Phase2Lifelog[]
      await this.fastMatcher.buildIndex(localLifelogs);
      logger.info('Fast search index built from local files', {
        lifelogCount: localLifelogs.length,
        source: 'local',
      });

      // Vector store is pre-populated with chunks via rebuild-with-chunking.js
      // No need to populate here
    } catch (error) {
      logger.warn('Failed to build initial search index', { error });
      // Initialize with empty index
      await this.fastMatcher.buildIndex([]);
      logger.info('Fast search index initialized empty');
    }
  }

  /**
   * Get search performance statistics
   */
  getPerformanceStats(): {
    queryRouterStats: any;
    cacheStats: any;
    fastSearchStats: any;
  } {
    return {
      queryRouterStats: this.queryRouter.getPerformanceReport(),
      cacheStats: this.cache.getStats(),
      fastSearchStats: this.fastMatcher.getStats(),
    };
  }

  /**
   * Clear all caches and indexes
   */
  async clearCaches(): Promise<void> {
    this.cache.clear();
    this.fastMatcher.clear();
    this.queryRouter.clearCache();

    if (this.vectorStore) {
      await this.vectorStore.clear();
    }

    logger.info('All caches and indexes cleared');
  }

  /**
   * Stop the search handler
   */
  async stop(): Promise<void> {
    this.cache.stop();

    if (this.vectorStore) {
      await this.vectorStore.close();
    }

    logger.info('Unified search handler stopped');
  }

  /**
   * Check if the query is asking about people/meetings
   */
  private isPeopleQuery(preprocessed: PreprocessedQuery): boolean {
    const query = preprocessed.original.toLowerCase();

    // Check for people-related patterns
    const peoplePatterns = [
      /who did i meet/i,
      /people i met/i,
      /who was at/i,
      /meeting with/i,
      /conversation with/i,
      /talked to/i,
      /spoke with/i,
      /who mentioned/i,
      /who said/i,
    ];

    // Check if intent is PERSON_QUERY or if it matches people patterns
    return (
      preprocessed.intent === QueryIntent.PERSON_QUERY ||
      peoplePatterns.some((pattern) => pattern.test(query))
    );
  }

  /**
   * Enhance search results with people information
   */
  private enhanceWithPeopleInfo(
    result: UnifiedSearchResult,
    preprocessed: PreprocessedQuery
  ): UnifiedSearchResult {
    // Extract people information from results
    const peopleInfo = temporalPeopleExtractor.processTemporalPeopleQuery(
      preprocessed.original,
      result.results
    );

    // Add the people summary to the result
    if (peopleInfo.meetings.length > 0) {
      result.summary = peopleInfo.summary;

      // Add people insights
      result.peopleInsights = {
        extractedPeople: peopleInfo.meetings.flatMap((m) => m.people).map((p) => p.name),
        timeframe: peopleInfo.timeframe,
        meetingCount: peopleInfo.meetings.length,
      };
    }

    return result;
  }

  /**
   * Check if the query is asking for a meeting recap/summary
   */
  private isMeetingRecapQuery(preprocessed: PreprocessedQuery): boolean {
    const query = preprocessed.original.toLowerCase();

    // Check for recap-related patterns
    const recapPatterns = [
      /recap/i,
      /summar/i,
      /what did we discuss/i,
      /what was discussed/i,
      /meeting notes/i,
      /key points/i,
      /action items/i,
      /next steps/i,
      /decisions made/i,
      /what should i know/i,
      /prepare for.*meeting/i,
    ];

    return recapPatterns.some((pattern) => pattern.test(query));
  }

  /**
   * Enhance search results with meeting summaries
   */
  private async enhanceWithMeetingSummaries(
    result: UnifiedSearchResult,
    preprocessed: PreprocessedQuery
  ): Promise<UnifiedSearchResult> {
    // Extract meeting summaries from top results
    const summaries = [];
    const allActionItems = [];
    const allDecisions = [];
    const allTopics = new Set<string>();

    for (const item of result.results.slice(0, 10)) {
      if (item.lifelog) {
        const summary = meetingSummaryExtractor.extractSummary(item.lifelog);
        if (summary && summary.metadata.confidence > 0.3) {
          summaries.push(summary);
          allActionItems.push(...summary.actionItems);
          allDecisions.push(...summary.decisions);
          summary.mainTopics.forEach((topic) => allTopics.add(topic));
        }
      }
    }

    if (summaries.length > 0) {
      // Create aggregated summary
      const aggregatedSummary = this.aggregateMeetingSummaries(summaries, preprocessed);

      result.summary = aggregatedSummary.text;
      result.actionItems = aggregatedSummary.actionItems;

      // Add meeting insights
      result.meetingInsights = {
        meetingCount: summaries.length,
        participants: aggregatedSummary.participants,
        mainTopics: Array.from(allTopics).slice(0, 5),
        decisions: allDecisions.slice(0, 5),
        confidence: aggregatedSummary.confidence,
      };

      logger.debug('Enhanced with meeting summaries', {
        summaryCount: summaries.length,
        actionItems: allActionItems.length,
        topics: allTopics.size,
      });
    }

    return result;
  }

  /**
   * Aggregate multiple meeting summaries into a coherent response
   */
  private aggregateMeetingSummaries(
    summaries: any[],
    _preprocessed: PreprocessedQuery
  ): {
    text: string;
    actionItems: string[];
    participants: string[];
    confidence: number;
  } {
    // Collect all unique participants
    const participants = new Set<string>();
    summaries.forEach((s) => s.participants.forEach((p: string) => participants.add(p)));

    // Collect and deduplicate action items
    const actionItemsMap = new Map<string, any>();
    summaries.forEach((s) => {
      s.actionItems.forEach((item: any) => {
        const key = item.description.toLowerCase();
        if (!actionItemsMap.has(key) || item.confidence > actionItemsMap.get(key).confidence) {
          actionItemsMap.set(key, item);
        }
      });
    });

    // Format action items
    const actionItems = Array.from(actionItemsMap.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map((item) => {
        let text = item.description;
        if (item.owner) text += ` (${item.owner})`;
        if (item.deadline) text += ` - Due: ${item.deadline}`;
        return text;
      });

    // Build summary text
    const parts = [];

    if (summaries.length === 1) {
      parts.push(meetingSummaryExtractor.formatSummaryAsText(summaries[0]));
    } else {
      parts.push(`Found ${summaries.length} relevant meetings/discussions.`);

      // Add main topics
      const allTopics = new Set<string>();
      summaries.forEach((s) => s.mainTopics.forEach((t: string) => allTopics.add(t)));
      if (allTopics.size > 0) {
        parts.push(
          `\nMain topics covered:\n${Array.from(allTopics)
            .slice(0, 5)
            .map((t) => `• ${t}`)
            .join('\n')}`
        );
      }

      // Add key decisions
      const allDecisions: string[] = [];
      summaries.forEach((s) => allDecisions.push(...s.decisions));
      if (allDecisions.length > 0) {
        parts.push(
          `\nKey decisions:\n${allDecisions
            .slice(0, 3)
            .map((d) => `• ${d}`)
            .join('\n')}`
        );
      }

      // Add action items
      if (actionItems.length > 0) {
        parts.push(`\nAction items:\n${actionItems.map((a) => `• ${a}`).join('\n')}`);
      }
    }

    // Calculate average confidence
    const avgConfidence =
      summaries.reduce((sum, s) => sum + s.metadata.confidence, 0) / summaries.length;

    return {
      text: parts.join('\n'),
      actionItems,
      participants: Array.from(participants),
      confidence: avgConfidence,
    };
  }

  /**
   * Execute a decomposed multi-part query
   */
  private async executeDecomposedQuery(
    decomposed: any,
    initialResult: UnifiedSearchResult,
    preprocessed: PreprocessedQuery,
    options: UnifiedSearchOptions
  ): Promise<UnifiedSearchResult> {
    logger.debug('Executing decomposed query', {
      original: decomposed.original,
      parts: decomposed.subQueries.length,
      complexity: decomposed.metadata.complexity,
    });

    const results = new Map<string, UnifiedSearchResult>();
    results.set('initial', initialResult);

    // Execute sub-queries in order
    for (const queryId of decomposed.executionOrder) {
      const subQuery = decomposed.subQueries.find((q: any) => q.id === queryId);
      if (!subQuery) continue;

      // Skip the first query if it's the same as our initial search
      if (queryId === 'q1' && subQuery.text === decomposed.original) {
        continue;
      }

      try {
        // Execute the sub-query
        const subResult = await this.search(subQuery.text, {
          ...options,
          enableCache: false, // Don't cache sub-queries
          limit: Math.floor((options.limit || 20) / 2), // Use fewer results for sub-queries
        });

        results.set(queryId, subResult);
      } catch (error) {
        logger.warn('Sub-query execution failed', { queryId, error });
      }
    }

    // Combine results based on query requirements
    if (decomposed.requiresContextualSummary) {
      return this.combineDecomposedResults(decomposed, results, preprocessed);
    }

    return initialResult;
  }

  /**
   * Combine results from decomposed queries
   */
  private combineDecomposedResults(
    decomposed: any,
    results: Map<string, UnifiedSearchResult>,
    _preprocessed: PreprocessedQuery
  ): UnifiedSearchResult {
    const combined: UnifiedSearchResult = {
      query: decomposed.original,
      strategy: 'parallel',
      results: [],
      performance: {
        totalTime: 0,
        searchTime: 0,
        strategy: 'decomposed',
        cacheHit: false,
      },
    };

    // Collect all unique results
    const seenIds = new Set<string>();
    const allResults = [];

    for (const [queryId, result] of results) {
      for (const item of result.results) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          allResults.push({
            ...item,
            sourceQuery: queryId,
          });
        }
      }
    }

    // Sort by relevance
    allResults.sort((a, b) => b.score - a.score);
    combined.results = allResults.slice(0, 20);

    // Combine summaries and insights
    const summaries = [];
    const actionItems = [];

    for (const [, result] of results) {
      if (result.summary) {
        summaries.push(result.summary);
      }
      if (result.actionItems) {
        actionItems.push(...result.actionItems);
      }
    }

    if (summaries.length > 0) {
      combined.summary = summaries.join('\n\n');
    }

    if (actionItems.length > 0) {
      combined.actionItems = [...new Set(actionItems)];
    }

    combined.decompositionInsights = {
      subQueryCount: decomposed.subQueries.length,
      complexity: decomposed.metadata.complexity,
      executedQueries: results.size,
    };

    return combined;
  }
}
