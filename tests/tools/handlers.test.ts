import { ToolHandlers } from '../../src/tools/handlers';
import { LimitlessClient } from '../../src/core/limitless-client';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

// Mock the client
jest.mock('../../src/core/limitless-client');

describe('ToolHandlers', () => {
  let toolHandlers: ToolHandlers;
  let mockClient: jest.Mocked<LimitlessClient>;

  beforeEach(() => {
    mockClient = new LimitlessClient({ apiKey: 'test' }) as jest.Mocked<LimitlessClient>;
    toolHandlers = new ToolHandlers(mockClient);
    jest.clearAllMocks();
  });

  describe('handleToolCall', () => {
    it('should handle limitless_get_lifelog_by_id', async () => {
      const mockLifelog = {
        id: 'test-id',
        title: 'Test Log',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        markdown: 'Test content',
      };

      mockClient.getLifelogById.mockResolvedValueOnce(mockLifelog);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_get_lifelog_by_id',
          arguments: {
            lifelog_id: 'test-id',
            includeMarkdown: true,
            includeHeadings: true,
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);

      expect(mockClient.getLifelogById).toHaveBeenCalledWith('test-id', {
        includeMarkdown: true,
        includeHeadings: true,
      });
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Test Log');
    });

    it('should handle limitless_list_lifelogs_by_date', async () => {
      const mockLifelogs = [
        {
          id: '1',
          title: 'Log 1',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
        {
          id: '2',
          title: 'Log 2',
          startTime: '2024-01-15T14:00:00Z',
          endTime: '2024-01-15T15:00:00Z',
        },
      ];

      mockClient.listLifelogsByDate.mockResolvedValueOnce(mockLifelogs);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_list_lifelogs_by_date',
          arguments: {
            date: '2024-01-15',
            limit: 10,
            direction: 'desc',
            timezone: 'UTC',
            includeMarkdown: false,
            includeHeadings: false,
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);

      expect(mockClient.listLifelogsByDate).toHaveBeenCalledWith('2024-01-15', {
        limit: 10,
        direction: 'desc',
        timezone: 'UTC',
        includeMarkdown: false,
        includeHeadings: false,
      });
      expect(result.content[0].text).toContain('2 lifelogs');
      expect(result.content[0].text).toContain('Log 1');
      expect(result.content[0].text).toContain('Log 2');
    });

    it('should handle limitless_list_lifelogs_by_range', async () => {
      const mockLifelogs = [
        {
          id: '1',
          title: 'Log 1',
          startTime: '2024-01-10T10:00:00Z',
          endTime: '2024-01-10T11:00:00Z',
        },
      ];

      mockClient.listLifelogsByRange.mockResolvedValueOnce(mockLifelogs);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_list_lifelogs_by_range',
          arguments: {
            start: '2024-01-10',
            end: '2024-01-15',
            limit: 50,
            direction: 'asc',
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);

      expect(mockClient.listLifelogsByRange).toHaveBeenCalledWith({
        start: '2024-01-10',
        end: '2024-01-15',
        limit: 50,
        direction: 'asc',
        includeMarkdown: true,
        includeHeadings: true,
        timezone: undefined,
      });
      expect(result.content[0].text).toContain('1 lifelog');
    });

    it('should handle limitless_list_recent_lifelogs', async () => {
      const mockLifelogs = [
        {
          id: '1',
          title: 'Recent Log',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
      ];

      mockClient.listRecentLifelogs.mockResolvedValueOnce(mockLifelogs);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_list_recent_lifelogs',
          arguments: {
            limit: 5,
            timezone: 'America/New_York',
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);

      expect(mockClient.listRecentLifelogs).toHaveBeenCalledWith({
        limit: 5,
        timezone: 'America/New_York',
        includeMarkdown: true,
        includeHeadings: true,
      });
      expect(result.content[0].text).toContain('Recent Log');
    });

    it('should handle limitless_search_lifelogs', async () => {
      const mockLifelogs = [
        {
          id: '1',
          title: 'Meeting about project',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          markdown: 'Discussed project timeline',
        },
      ];

      mockClient.searchLifelogs.mockResolvedValueOnce(mockLifelogs);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_search_lifelogs',
          arguments: {
            search_term: 'project',
            fetch_limit: 30,
            limit: 10,
            includeMarkdown: true,
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);

      expect(mockClient.searchLifelogs).toHaveBeenCalledWith({
        searchTerm: 'project',
        fetchLimit: 30,
        limit: 10,
        includeMarkdown: true,
        includeHeadings: true,
        direction: undefined,
        timezone: undefined,
      });
      expect(result.content[0].text).toContain('Meeting about project');
      expect(result.content[0].text).toContain('Discussed project timeline');
    });

    it('should handle unknown tool', async () => {
      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      };

      const result = await toolHandlers.handleToolCall(request);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: unknown_tool');
    });

    it('should handle empty results', async () => {
      mockClient.listRecentLifelogs.mockResolvedValueOnce([]);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_list_recent_lifelogs',
          arguments: {},
        },
      };

      const result = await toolHandlers.handleToolCall(request);

      expect(result.content[0].text).toBe('No lifelogs found');
    });

    it('should handle errors gracefully', async () => {
      mockClient.getLifelogById.mockRejectedValueOnce(new Error('API error'));

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_get_lifelog_by_id',
          arguments: {
            lifelog_id: 'test-id',
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('API error');
    });

    it('should handle non-Error objects thrown', async () => {
      mockClient.getLifelogById.mockRejectedValueOnce('String error');

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_get_lifelog_by_id',
          arguments: {
            lifelog_id: 'test-id',
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown error occurred');
    });

    it('should format lifelog with all fields', async () => {
      const mockLifelog = {
        id: 'test-id',
        title: 'Complete Log',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        markdown: 'Full content here',
        contents: [
          {
            type: 'heading1' as const,
            content: 'Main Topic',
            startTime: '2024-01-15T10:05:00Z',
            endTime: '2024-01-15T10:10:00Z',
            startOffsetMs: 300000,
            endOffsetMs: 600000,
            children: [],
          },
        ],
      };

      mockClient.getLifelogById.mockResolvedValueOnce(mockLifelog);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_get_lifelog_by_id',
          arguments: {
            lifelog_id: 'test-id',
            includeMarkdown: true,
            includeHeadings: true,
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);
      const text = result.content[0].text;

      expect(text).toContain('Complete Log');
      expect(text).toContain('ID: test-id');
      expect(text).toContain('Duration: 1h');
      expect(text).toContain('Full content here');
      expect(text).toContain('Main Topic');
    });

    it('should handle date parsing edge cases', async () => {
      const mockLifelogs = [
        {
          id: '1',
          title: 'Log with datetime',
          startTime: '2024-01-15T14:30:00Z',
          endTime: '2024-01-15T15:30:00Z',
        },
      ];

      mockClient.listLifelogsByRange.mockResolvedValueOnce(mockLifelogs);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'limitless_list_lifelogs_by_range',
          arguments: {
            start: '2024-01-15 10:00:00',
            end: '2024-01-15 18:00:00',
          },
        },
      };

      const result = await toolHandlers.handleToolCall(request);

      expect(mockClient.listLifelogsByRange).toHaveBeenCalledWith({
        start: '2024-01-15 10:00:00',
        end: '2024-01-15 18:00:00',
        limit: undefined,
        direction: undefined,
        timezone: undefined,
        includeMarkdown: true,
        includeHeadings: true,
      });
      expect(result.content[0].text).toContain('Log with datetime');
    });
  });
});
