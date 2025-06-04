import { LimitlessClient } from '../core/limitless-client.js';
import { FileManager } from '../storage/file-manager.js';
import { ChromaVectorStore } from '../vector-store/chroma-manager.js';
import { QueryRouter, QueryType } from './query-router.js';
import { FastPatternMatcher } from './fast-patterns.js';
import { ClaudeOrchestrator } from './claude-orchestrator.js';
import { IntelligentCache } from '../cache/intelligent-cache.js';
import { logger } from '../utils/logger.js';
import { Phase2Lifelog, toPhase2Lifelog } from '../types/phase2.js';
import type {
  VectorSearchResult,
  BaseVectorStore,
} from '../vector-store/vector-store.interface.js';
import type { FastSearchResult } from './fast-patterns.js';
import type { ClaudeSearchResult } from './claude-orchestrator.js';

export interface UnifiedSearchOptions {
  strategy?: 'auto' | 'fast' | 'vector' | 'hybrid' | 'claude';
  limit?: number;
  includeContent?: boolean;
  includeMetadata?: boolean;
  scoreThreshold?: number;
  enableCache?: boolean;
  enableLearning?: boolean;
}

export interface UnifiedSearchResult {
  query: string;
  strategy: 'fast' | 'vector' | 'hybrid' | 'claude';
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
}

export class UnifiedSearchHandler {
  private client: LimitlessClient;
  private fileManager: FileManager;
  private vectorStore: BaseVectorStore | null = null;
  private queryRouter: QueryRouter;
  private fastMatcher: FastPatternMatcher;
  private claudeOrchestrator: ClaudeOrchestrator | null = null;
  private cache: IntelligentCache;
  private isInitialized: boolean = false;

  constructor(
    client: LimitlessClient,
    fileManager: FileManager,
    options: {
      enableVectorStore?: boolean;
      enableClaude?: boolean;
      cacheOptions?: any;
    } = {}
  ) {
    this.client = client;
    this.fileManager = fileManager;
    this.queryRouter = new QueryRouter();
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

    // Initialize LanceDB if needed
    if (!this.vectorStore && this.client) {
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

    // Classify query
    const classification = await this.queryRouter.classifyQuery(query);

    // Get suggested strategy from cache if learning is enabled
    let strategy = options.strategy || 'auto';
    if (strategy === 'auto' && options.enableLearning !== false) {
      const learnedStrategy = this.cache.getSuggestedStrategy(query, classification);
      if (learnedStrategy) {
        strategy = learnedStrategy;
      } else {
        strategy = classification.suggestedStrategy;
      }
    } else if (strategy === 'auto') {
      strategy = classification.suggestedStrategy;
    }

    // Execute search based on strategy
    let result: UnifiedSearchResult;
    const searchStartTime = Date.now();

    switch (strategy) {
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
      // Get recent lifelogs (last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const apiLifelogs = await this.client.listLifelogsByRange({
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        limit: 1000,
      });

      const phase2Lifelogs = apiLifelogs.map(toPhase2Lifelog);
      await this.fastMatcher.buildIndex(phase2Lifelogs);
      logger.info('Fast search index built', { lifelogCount: phase2Lifelogs.length });

      // Also populate vector store if available
      if (this.vectorStore && phase2Lifelogs.length > 0) {
        try {
          const vectorDocs = phase2Lifelogs.map((log) => ({
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
