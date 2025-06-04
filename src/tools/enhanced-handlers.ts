import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { LimitlessClient } from '../core/limitless-client.js';
import { FileManager } from '../storage/file-manager.js';
import { UnifiedSearchHandler } from '../search/unified-search.js';
import { SyncServiceV3 } from '../vector-store/sync-service-v3.js';
import {
  getLifelogByIdSchema,
  listLifelogsByDateSchema,
  listLifelogsByRangeSchema,
  listRecentLifelogsSchema,
  searchLifelogsSchema,
} from './schemas.js';
import { logger } from '../utils/logger.js';
import { formatLifelogResponse } from '../utils/format.js';

export interface EnhancedHandlerOptions {
  enablePhase2?: boolean;
  enableVectorStore?: boolean;
  enableClaude?: boolean;
  enableSync?: boolean;
  dataDir?: string;
}

export class EnhancedToolHandlers {
  private client: LimitlessClient;
  private fileManager: FileManager | null = null;
  private searchHandler: UnifiedSearchHandler | null = null;
  private syncService: SyncServiceV3 | null = null;
  private options: EnhancedHandlerOptions;
  private isInitialized: boolean = false;
  private shouldInitSync: boolean = false;

  constructor(client: LimitlessClient, options: EnhancedHandlerOptions = {}) {
    this.client = client;
    this.options = {
      enablePhase2: options.enablePhase2 ?? false,
      enableVectorStore: options.enableVectorStore ?? false,
      enableClaude: options.enableClaude ?? false,
      enableSync: options.enableSync ?? false,
      dataDir: options.dataDir || './data',
    };

    // Initialize Phase 2 components if enabled
    if (this.options.enablePhase2) {
      this.initializePhase2Components();
    }
  }

  private initializePhase2Components(): void {
    // Initialize file manager
    this.fileManager = new FileManager({
      baseDir: this.options.dataDir!,
      enableEmbeddings: this.options.enableVectorStore ?? false,
      enableMetadata: true,
    });

    // Initialize unified search handler
    this.searchHandler = new UnifiedSearchHandler(this.client, this.fileManager, {
      enableVectorStore: this.options.enableVectorStore,
      enableClaude: this.options.enableClaude,
    });

    // Sync service will be initialized asynchronously in initialize()
    this.shouldInitSync = !!(this.options.enableSync && this.options.enableVectorStore);
    if (this.shouldInitSync) {
      logger.info('Sync service will be initialized');
    }
  }

  private async createSyncService(): Promise<void> {
    // Create LanceDB store for sync (same as search handler uses)
    const { LanceDBStore } = await import('../vector-store/lancedb-store.js');
    const vectorStore = new LanceDBStore({
      collectionName: 'limitless-lifelogs',
      persistPath: './data/lancedb',
    });

    // Get sync interval from environment or use default
    const syncInterval = process.env.LIMITLESS_SYNC_INTERVAL
      ? parseInt(process.env.LIMITLESS_SYNC_INTERVAL, 10)
      : 60000; // 1 minute default

    if (!this.fileManager) {
      throw new Error('FileManager not initialized');
    }

    this.syncService = new SyncServiceV3(this.client, this.fileManager, vectorStore, {
      batchSize: 50,
      apiDelayMs: 2000, // 2 second delay between API calls
      checkpointInterval: 1, // Save after every batch
      downloadOnly: false, // We want both download and vectorization
      maxYearsBack: 10, // Go back max 10 years
    });

    logger.info('Sync service configured', {
      pollInterval: syncInterval,
      vectorStore: 'LanceDB',
      batchSize: 50,
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info('Initializing enhanced tool handlers', this.options);

    if (this.searchHandler) {
      await this.searchHandler.initialize();
    }

    // Create and start sync service if enabled
    if (this.shouldInitSync) {
      await this.createSyncService();
      if (this.syncService) {
        logger.info('Starting background sync service');
        await this.syncService.start();

        // Log initial sync status
        const progress = this.syncService.getProgress();
        logger.info('Sync service started', {
          phase: progress.phase,
          totalDownloaded: progress.totalDownloaded,
          totalVectorized: progress.totalVectorized,
          pollInterval: process.env.LIMITLESS_SYNC_INTERVAL || 60000,
        });
      }
    }

    this.isInitialized = true;
    logger.info('Enhanced tool handlers initialized');
  }

  async handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
    const { name, arguments: args } = request.params;
    logger.debug(`Handling tool call: ${name}`, args);

    // Ensure initialization
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      switch (name) {
        case 'limitless_get_lifelog_by_id':
          return await this.getLifelogById(args);
        case 'limitless_list_lifelogs_by_date':
          return await this.listLifelogsByDate(args);
        case 'limitless_list_lifelogs_by_range':
          return await this.listLifelogsByRange(args);
        case 'limitless_list_recent_lifelogs':
          return await this.listRecentLifelogs(args);
        case 'limitless_search_lifelogs':
          return await this.searchLifelogs(args);

        // New Phase 2 tools
        case 'limitless_advanced_search':
          return await this.advancedSearch(args);
        case 'limitless_semantic_search':
          return await this.semanticSearch(args);
        case 'limitless_analyze_lifelogs':
          return await this.analyzeLifelogs(args);
        case 'limitless_sync_status':
          return await this.getSyncStatus();
        case 'limitless_bulk_sync':
          return await this.bulkSync(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Tool call failed: ${name}`, error);

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Original tool implementations (unchanged)
  private async getLifelogById(args: unknown): Promise<CallToolResult> {
    const params = getLifelogByIdSchema.parse(args);

    const lifelog = await this.client.getLifelogById(params.lifelog_id, {
      includeMarkdown: params.includeMarkdown,
      includeHeadings: params.includeHeadings,
    });

    return {
      content: [
        {
          type: 'text',
          text: formatLifelogResponse([lifelog], params),
        },
      ],
    };
  }

  private async listLifelogsByDate(args: unknown): Promise<CallToolResult> {
    const params = listLifelogsByDateSchema.parse(args);

    const lifelogs = await this.client.listLifelogsByDate(params.date, {
      limit: params.limit,
      direction: params.direction,
      timezone: params.timezone,
      includeMarkdown: params.includeMarkdown,
      includeHeadings: params.includeHeadings,
    });

    return {
      content: [
        {
          type: 'text',
          text: formatLifelogResponse(lifelogs, params),
        },
      ],
    };
  }

  private async listLifelogsByRange(args: unknown): Promise<CallToolResult> {
    const params = listLifelogsByRangeSchema.parse(args);

    const lifelogs = await this.client.listLifelogsByRange({
      start: params.start,
      end: params.end,
      limit: params.limit,
      direction: params.direction,
      timezone: params.timezone,
      includeMarkdown: params.includeMarkdown,
      includeHeadings: params.includeHeadings,
    });

    return {
      content: [
        {
          type: 'text',
          text: formatLifelogResponse(lifelogs, params),
        },
      ],
    };
  }

  private async listRecentLifelogs(args: unknown): Promise<CallToolResult> {
    const params = listRecentLifelogsSchema.parse(args);

    const lifelogs = await this.client.listRecentLifelogs({
      limit: params.limit,
      timezone: params.timezone,
      includeMarkdown: params.includeMarkdown,
      includeHeadings: params.includeHeadings,
    });

    return {
      content: [
        {
          type: 'text',
          text: formatLifelogResponse(lifelogs, params),
        },
      ],
    };
  }

  // Enhanced search that uses Phase 2 if available
  private async searchLifelogs(args: unknown): Promise<CallToolResult> {
    const params = searchLifelogsSchema.parse(args);

    // Use Phase 2 search if available
    if (this.searchHandler && this.options.enablePhase2) {
      try {
        const result = await this.searchHandler.search(params.search_term, {
          strategy: 'auto',
          limit: params.limit,
          enableCache: true,
          enableLearning: true,
        });

        // Format enhanced results
        const formattedResponse = this.formatEnhancedSearchResults(result, params);
        return {
          content: [
            {
              type: 'text',
              text: formattedResponse,
            },
          ],
        };
      } catch (error) {
        logger.warn('Phase 2 search failed, falling back to basic search', { error });
      }
    }

    // Fallback to original search
    const lifelogs = await this.client.searchLifelogs({
      searchTerm: params.search_term,
      fetchLimit: params.fetch_limit,
      limit: params.limit,
      direction: params.direction,
      timezone: params.timezone,
      includeMarkdown: params.includeMarkdown,
      includeHeadings: params.includeHeadings,
    });

    return {
      content: [
        {
          type: 'text',
          text: formatLifelogResponse(lifelogs, params, params.search_term),
        },
      ],
    };
  }

  // New Phase 2 tools
  private async advancedSearch(args: any): Promise<CallToolResult> {
    if (!this.searchHandler) {
      throw new Error('Advanced search not available. Phase 2 features not enabled.');
    }

    const { query, strategy = 'auto', limit = 20 } = args;

    const result = await this.searchHandler.search(query, {
      strategy,
      limit,
      enableCache: true,
      enableLearning: true,
    });

    return {
      content: [
        {
          type: 'text',
          text: this.formatAdvancedSearchResults(result),
        },
      ],
    };
  }

  private async semanticSearch(args: any): Promise<CallToolResult> {
    if (!this.searchHandler || !this.options.enableVectorStore) {
      throw new Error('Semantic search not available. Vector store not enabled.');
    }

    const { query, limit = 20, threshold = 0.7 } = args;

    const result = await this.searchHandler.search(query, {
      strategy: 'vector',
      limit,
      scoreThreshold: threshold,
    });

    return {
      content: [
        {
          type: 'text',
          text: this.formatSemanticSearchResults(result),
        },
      ],
    };
  }

  private async analyzeLifelogs(args: any): Promise<CallToolResult> {
    if (!this.searchHandler || !this.options.enableClaude) {
      throw new Error('Analysis not available. Claude integration not enabled.');
    }

    const { query, analysisType = 'summary' } = args;

    const result = await this.searchHandler.search(query, {
      strategy: 'claude',
      limit: 50,
    });

    return {
      content: [
        {
          type: 'text',
          text: this.formatAnalysisResults(result, analysisType),
        },
      ],
    };
  }

  private async getSyncStatus(): Promise<CallToolResult> {
    if (!this.syncService) {
      return {
        content: [
          {
            type: 'text',
            text: '🔴 Sync Service Status: DISABLED\n\nTo enable background synchronization:\n1. Set LIMITLESS_ENABLE_SYNC=true\n2. Restart the server\n\nThis will sync new lifelogs every 60 seconds.',
          },
        ],
      };
    }

    const progress = this.syncService.getProgress();
    const lines = [
      '📊 Sync Service Status\n',
      `Phase: ${progress.phase.toUpperCase()}`,
      `Downloaded: ${progress.totalDownloaded} lifelogs`,
      `Vectorized: ${progress.totalVectorized} lifelogs`,
      `Current Date: ${progress.currentDate || 'N/A'}`,
      `Date Range: ${progress.oldestDate || 'N/A'} to ${progress.newestDate || 'N/A'}`,
      `Storage Size: ${(progress.storageSize / (1024 * 1024)).toFixed(2)} MB`,
      `Processed Batches: ${progress.processedBatches.size}`,
    ];

    if (progress.lastCheckpoint) {
      lines.push(`\nLast Checkpoint: ${progress.lastCheckpoint.toLocaleString()}`);
    }

    if (progress.errors.length > 0) {
      lines.push(`\n⚠️ Errors: ${progress.errors.length}`);
      progress.errors.slice(-3).forEach((err: { date: string; error: string }) => {
        lines.push(`  ${err.date}: ${err.error}`);
      });
    }

    // Add configuration info
    lines.push('\n📋 Configuration:');
    lines.push(
      `Poll Interval: ${process.env.LIMITLESS_SYNC_INTERVAL || '60000'}ms (${(parseInt(process.env.LIMITLESS_SYNC_INTERVAL || '60000') / 1000 / 60).toFixed(1)} minutes)`
    );
    lines.push(`Vector Store: LanceDB with Contextual RAG`);
    lines.push(`File Storage: Enabled`);
    lines.push(`Batch Size: 50 lifelogs per sync`);

    // Note about bulk sync
    lines.push('\n💡 To sync all historical data:');
    lines.push('Run: npm run sync:all');

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n'),
        },
      ],
    };
  }

  // Result formatting methods
  private formatEnhancedSearchResults(result: any, params: any): string {
    const lines = [
      `Search Results for: "${result.query}"`,
      `Strategy: ${result.strategy} | Time: ${result.performance.totalTime}ms`,
      `Found ${result.results.length} results`,
      '',
    ];

    if (result.insights) {
      lines.push('Insights:', result.insights, '');
    }

    if (result.actionItems && result.actionItems.length > 0) {
      lines.push('Action Items:', ...result.actionItems.map((item: string) => `- ${item}`), '');
    }

    // Add lifelog results
    result.results.forEach((r: any, index: number) => {
      if (r.lifelog) {
        lines.push(`${index + 1}. ${r.lifelog.title} (Score: ${r.score.toFixed(3)})`);
        lines.push(`   ID: ${r.lifelog.id}`);
        lines.push(`   Date: ${new Date(r.lifelog.createdAt).toLocaleString()}`);

        if (r.highlights && r.highlights.length > 0) {
          lines.push(`   Highlights: ${r.highlights[0]}`);
        }

        if (params.includeMarkdown && r.lifelog.content) {
          lines.push('   Content:', r.lifelog.content.substring(0, 200) + '...', '');
        }
      }
    });

    return lines.join('\n');
  }

  private formatAdvancedSearchResults(result: any): string {
    return this.formatEnhancedSearchResults(result, { includeMarkdown: true });
  }

  private formatSemanticSearchResults(result: any): string {
    const lines = [
      `Semantic Search Results for: "${result.query}"`,
      `Found ${result.results.length} similar results`,
      '',
    ];

    result.results.forEach((r: any, index: number) => {
      lines.push(`${index + 1}. ID: ${r.id} (Similarity: ${r.score.toFixed(3)})`);
      if (r.metadata) {
        lines.push(`   Title: ${r.metadata.title || 'N/A'}`);
        lines.push(`   Date: ${r.metadata.date || 'N/A'}`);
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  private formatAnalysisResults(result: any, analysisType: string): string {
    const lines = [`Analysis Results (${analysisType})`, `Query: "${result.query}"`, ''];

    if (result.summary) {
      lines.push('Summary:', result.summary, '');
    }

    if (result.insights) {
      lines.push('Insights:', result.insights, '');
    }

    if (result.actionItems && result.actionItems.length > 0) {
      lines.push('Action Items:', ...result.actionItems.map((item: string) => `- ${item}`), '');
    }

    lines.push(`Analyzed ${result.results.length} lifelogs`);

    return lines.join('\n');
  }

  private async bulkSync(args: any): Promise<CallToolResult> {
    // Try to create sync service if not available
    if (!this.syncService && this.fileManager && this.options.enableVectorStore) {
      await this.createSyncService();
    }

    if (!this.syncService) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Sync service is not available.\n\nTo enable sync:\n1. Set LIMITLESS_ENABLE_SYNC=true\n2. Set LIMITLESS_ENABLE_VECTOR=true\n3. Restart the server',
          },
        ],
      };
    }

    // Check if sync is already running
    const progress = this.syncService.getProgress();
    if (progress.phase !== 'idle') {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Sync already in progress!\n\nPhase: ${progress.phase}\nDownloaded: ${progress.totalDownloaded}\nVectorized: ${progress.totalVectorized}`,
          },
        ],
      };
    }

    const { days = 365, clearExisting = false } = args;

    const lines = [
      '🔄 Starting Bulk Historical Sync\n',
      `📅 Syncing ${days} days of history`,
      `🗑️ Clear existing: ${clearExisting ? 'Yes' : 'No'}`,
      '',
    ];

    try {
      // Clear existing data if requested
      if (clearExisting) {
        lines.push('⚠️ Clear existing data is not supported in V2.');
        lines.push('To clear data, manually delete the ./data directory and restart.\n');
      }

      // Calculate start date
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      lines.push(`Starting bulk sync from ${startDate.toLocaleDateString()}...`);
      lines.push('This may take several minutes depending on the amount of data.\n');

      // V3 sync service improvements
      lines.push('⚠️ Bulk sync must be run from command line:\n');
      lines.push('npm run sync:all');
      lines.push('\nImproved in V3:');
      lines.push('• Downloads ALL historical data (no 365-day limit)');
      lines.push('• Saves checkpoint after EVERY batch');
      lines.push('• Never re-downloads data once saved locally');
      lines.push('• Respectful 2-second delays between API requests');
      lines.push('• Resumes exactly where it left off if interrupted');
      lines.push('• Can rebuild embeddings from local data anytime');
      lines.push('\nOptions:');
      lines.push('• --years=10  (how far back to go)');
      lines.push('• --batch=50  (days per batch)');
      lines.push('• --delay=2000  (ms between requests)');

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n'),
          },
        ],
      };
    } catch (error) {
      lines.push(
        `\n❌ Bulk sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n'),
          },
        ],
        isError: true,
      };
    }
  }

  async stop(): Promise<void> {
    if (this.syncService) {
      await this.syncService.stop();
    }

    if (this.searchHandler) {
      await this.searchHandler.stop();
    }

    logger.info('Enhanced tool handlers stopped');
  }
}
