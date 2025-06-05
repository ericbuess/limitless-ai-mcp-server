// Search is always local - no API client needed
import { FileManager } from '../storage/file-manager.js';
import { ChromaVectorStore } from '../vector-store/chroma-manager.js';
import { QueryRouter, QueryType } from './query-router.js';
import { FastPatternMatcher } from './fast-patterns.js';
import { ClaudeOrchestrator } from './claude-orchestrator.js';
import { IntelligentCache } from '../cache/intelligent-cache.js';
import { ParallelSearchExecutor } from './parallel-search-executor.js';
import { QueryPreprocessor, PreprocessedQuery } from './query-preprocessor.js';
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

    if (options.enableVectorStore) {
      // Try ChromaDB first
      if (process.env.CHROMADB_MODE !== 'simple') {
        this.vectorStore = new ChromaVectorStore({
          collectionName: 'limitless-lifelogs',
          persistPath: process.env.CHROMA_PATH || 'http://localhost:8000',
        });
      } else {
        // Use LanceDB with Contextual RAG for best performance
        logger.info('Initializing LanceDB with Contextual RAG');
        // Dynamic import in constructor not async, so defer to initialize()
        this.vectorStore = null; // Will be set in initialize()
      }
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

    // Initialize LanceDB if needed - no client dependency for vector store
    if (!this.vectorStore && this.fileManager) {
      const { LanceDBStore } = await import('../vector-store/lancedb-store.js');
      this.vectorStore = new LanceDBStore({
        collectionName: 'limitless-lifelogs',
        persistPath: './data/lancedb',
      });
    }

    if (this.vectorStore) {
      try {
        await this.vectorStore.initialize();
      } catch (error) {
        logger.warn('Vector store initialization failed, falling back to simple vector store', {
          error,
        });

        // If ChromaDB fails, fall back to LanceDB
        if (this.vectorStore instanceof ChromaVectorStore) {
          logger.info('ChromaDB failed, falling back to LanceDB');
          const { LanceDBStore } = await import('../vector-store/lancedb-store.js');
          this.vectorStore = new LanceDBStore({
            collectionName: 'limitless-lifelogs',
            persistPath: './data/lancedb',
          });
          await this.vectorStore.initialize();
          logger.info('Fallback to LanceDB successful');
        } else {
          // If simple vector store also fails, disable it
          this.vectorStore = null;
        }
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
            result = await this.parallelExecutor.search(query, classification, options);
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

    // Execute both searches in parallel
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
  private formatVectorSearchResults(
    query: string,
    results: VectorSearchResult[],
    strategy: 'vector' | 'hybrid'
  ): Promise<UnifiedSearchResult> {
    return Promise.resolve({
      query,
      strategy,
      results: results.map((r) => ({
        id: r.id,
        score: r.score,
        metadata: r.metadata,
      })),
      performance: {
        totalTime: 0,
        searchTime: 0,
        strategy,
        cacheHit: false,
      },
    });
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

      // Also populate vector store if available
      if (this.vectorStore && localLifelogs.length > 0) {
        try {
          const vectorDocs = localLifelogs.map((log) => ({
            id: log.id,
            content: log.content,
            metadata: {
              title: log.title,
              date: log.createdAt,
              duration: log.duration,
            },
          }));

          // Add documents in batches with progress logging
          const batchSize = 50;
          const totalDocs = vectorDocs.length;
          logger.info(`Starting vector store indexing of ${totalDocs} documents...`);

          for (let i = 0; i < vectorDocs.length; i += batchSize) {
            const batch = vectorDocs.slice(i, Math.min(i + batchSize, vectorDocs.length));
            await this.vectorStore.addDocuments(batch);

            const progress = Math.min(i + batchSize, totalDocs);
            const percentage = Math.round((progress / totalDocs) * 100);
            logger.info(`Indexing progress: ${progress}/${totalDocs} (${percentage}%)`);
          }

          logger.info('Vector store indexing completed', {
            documentCount: vectorDocs.length,
            indexSize: await this.vectorStore.getStats().then((s) => s.documentCount),
          });
        } catch (error) {
          logger.warn('Failed to populate vector store', { error });
        }
      }
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
}
