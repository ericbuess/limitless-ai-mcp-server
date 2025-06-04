import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { LimitlessClient } from '../core/limitless-client.js';
import { FileManager } from '../storage/file-manager.js';
import { UnifiedSearchHandler } from '../search/unified-search.js';
import { SyncService } from '../vector-store/sync-service.js';
import { ChromaVectorStore } from '../vector-store/chroma-manager.js';
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
  private syncService: SyncService | null = null;
  private options: EnhancedHandlerOptions;
  private isInitialized: boolean = false;

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

    // Initialize sync service if enabled
    if (this.options.enableSync && this.options.enableVectorStore) {
      const vectorStore = new ChromaVectorStore({
        collectionName: 'limitless-lifelogs',
        persistPath: process.env.CHROMA_PATH || 'http://localhost:8000',
      });

      this.syncService = new SyncService(this.client, this.fileManager, vectorStore, {
        enableVectorStore: true,
        enableFileStorage: true,
        pollInterval: 60000, // 1 minute
      });
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info('Initializing enhanced tool handlers', this.options);

    if (this.searchHandler) {
      await this.searchHandler.initialize();
    }

    if (this.syncService) {
      await this.syncService.start();
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
      throw new Error('Sync service not available.');
    }

    const status = this.syncService.getStatus();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
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
