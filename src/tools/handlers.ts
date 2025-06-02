import { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { LimitlessClient } from '../core/limitless-client';
import {
  getLifelogByIdSchema,
  listLifelogsByDateSchema,
  listLifelogsByRangeSchema,
  listRecentLifelogsSchema,
  searchLifelogsSchema,
} from './schemas';
import { logger } from '../utils/logger';
import { formatLifelogResponse } from '../utils/format';

export class ToolHandlers {
  constructor(private client: LimitlessClient) {}

  async handleToolCall(request: CallToolRequest): Promise<CallToolResult> {
    const { name, arguments: args } = request.params;
    logger.debug(`Handling tool call: ${name}`, args);

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

  private async searchLifelogs(args: unknown): Promise<CallToolResult> {
    const params = searchLifelogsSchema.parse(args);

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
}

