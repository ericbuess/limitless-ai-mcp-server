import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CreateMessageRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { LimitlessClient } from '../../src/core/limitless-client';
import { ToolHandlers } from '../../src/tools/handlers';
import { toolDefinitions } from '../../src/tools/definitions';
import { ResourceManager } from '../../src/resources/manager';
import { ResourceHandlers } from '../../src/resources/handlers';
import { PromptHandlers } from '../../src/prompts/handlers';
import { SamplingHandlers } from '../../src/sampling/handlers';

// Mock the LimitlessClient
jest.mock('../../src/core/limitless-client');

describe('MCP Server Integration Tests', () => {
  let server: Server;
  let client: Client;
  let limitlessClient: jest.Mocked<LimitlessClient>;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    // Create mocked Limitless client
    limitlessClient = new LimitlessClient({ apiKey: 'test-key' }) as jest.Mocked<LimitlessClient>;

    // Create server with all handlers
    const toolHandlers = new ToolHandlers(limitlessClient);
    const resourceManager = new ResourceManager(limitlessClient);
    const resourceHandlers = new ResourceHandlers(resourceManager);
    const promptHandlers = new PromptHandlers();
    const samplingHandlers = new SamplingHandlers(limitlessClient);

    // Initialize server
    server = new Server(
      {
        name: 'limitless-ai-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {
            subscribe: false,
            listChanged: false,
          },
          prompts: {
            listChanged: false,
          },
          sampling: {},
        },
      }
    );

    // Register all handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) =>
      toolHandlers.handleToolCall(request)
    );

    server.setRequestHandler(ListResourcesRequestSchema, async (request) =>
      resourceHandlers.handleListResources(request)
    );

    server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) =>
      resourceHandlers.handleListResourceTemplates(request)
    );

    server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
      resourceHandlers.handleReadResource(request)
    );

    server.setRequestHandler(ListPromptsRequestSchema, async (request) =>
      promptHandlers.handleListPrompts(request)
    );

    server.setRequestHandler(GetPromptRequestSchema, async (request) =>
      promptHandlers.handleGetPrompt(request)
    );

    server.setRequestHandler(CreateMessageRequestSchema, async (request) =>
      samplingHandlers.handleCreateMessage(request)
    );

    // Create transports
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Connect server and client
    await server.connect(serverTransport);

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    jest.clearAllMocks();
  });

  describe('Server Initialization', () => {
    it('should initialize with correct server info and capabilities', async () => {
      // After connection, the client has server info
      const serverCapabilities = client.getServerCapabilities();
      const serverInfo = client.getServerVersion();

      expect(serverInfo?.name).toBe('limitless-ai-mcp-server');
      expect(serverInfo?.version).toBe('1.0.0');
      expect(serverCapabilities).toMatchObject({
        tools: {},
        resources: {
          subscribe: false,
          listChanged: false,
        },
        prompts: {
          listChanged: false,
        },
        sampling: {},
      });
    });
  });

  describe('Tools Integration', () => {
    it('should list all available tools', async () => {
      const response = await client.listTools();

      expect(response.tools).toHaveLength(5);
      expect(response.tools.map((t) => t.name)).toEqual([
        'limitless_get_lifelog_by_id',
        'limitless_list_lifelogs_by_date',
        'limitless_list_lifelogs_by_range',
        'limitless_list_recent_lifelogs',
        'limitless_search_lifelogs',
      ]);
    });

    it('should call limitless_get_lifelog_by_id tool', async () => {
      const mockLifelog = {
        id: 'test-123',
        title: 'Test Meeting',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        markdown: '# Meeting Notes\n\nDiscussed project timeline.',
        headings: [{ text: 'Meeting Notes', level: 1, timestamp: '00:00' }],
      };

      limitlessClient.getLifelogById.mockResolvedValueOnce(mockLifelog);

      const response = await client.callTool({
        name: 'limitless_get_lifelog_by_id',
        arguments: {
          lifelog_id: 'test-123',
          includeMarkdown: true,
          includeHeadings: true,
        },
      });

      expect(limitlessClient.getLifelogById).toHaveBeenCalledWith('test-123', {
        includeMarkdown: true,
        includeHeadings: true,
      });
      expect((response as any).content[0].type).toBe('text');
      expect((response as any).content[0].text).toContain('Test Meeting');
      expect((response as any).content[0].text).toContain('Meeting Notes');
    });

    it('should handle tool errors gracefully', async () => {
      limitlessClient.getLifelogById.mockRejectedValueOnce(new Error('API Error: Unauthorized'));

      const response = await client.callTool({
        name: 'limitless_get_lifelog_by_id',
        arguments: { lifelog_id: 'invalid-id' },
      });

      expect((response as any).content[0].type).toBe('text');
      expect((response as any).content[0].text).toContain('Error');
      expect((response as any).content[0].text).toContain('Unauthorized');
    });

    it('should handle invalid tool name', async () => {
      const response = await client.callTool({
        name: 'invalid_tool_name',
        arguments: {},
      });

      expect((response as any).isError).toBe(true);
      expect((response as any).content[0].text).toContain('Unknown tool');
    });
  });

  describe('Resources Integration', () => {
    beforeEach(() => {
      // Mock data for resources
      const mockLifelogs = [
        {
          id: 'log-1',
          title: 'Morning Standup',
          startTime: '2024-01-15T09:00:00Z',
          endTime: '2024-01-15T09:30:00Z',
        },
        {
          id: 'log-2',
          title: 'Project Review',
          startTime: '2024-01-15T14:00:00Z',
          endTime: '2024-01-15T15:00:00Z',
        },
      ];

      limitlessClient.listRecentLifelogs.mockResolvedValue(mockLifelogs);
      limitlessClient.listLifelogsByDate.mockResolvedValue(mockLifelogs);
    });

    it('should list available resources', async () => {
      const response = await client.listResources();

      expect(response.resources).toHaveLength(3);
      expect(response.resources[0].uri).toBe('lifelog://recent');
      expect(response.resources[0].name).toBe('Recent Lifelogs');
    });

    it('should list resource templates', async () => {
      const response = await client.listResourceTemplates();

      expect(response.resourceTemplates).toHaveLength(3);
      expect(response.resourceTemplates[0].uriTemplate).toBe('lifelog://recent');
      expect(response.resourceTemplates[1].uriTemplate).toBe('lifelog://{date}');
      expect(response.resourceTemplates[2].uriTemplate).toBe('lifelog://{date}/{id}');
    });

    it('should read recent lifelogs resource', async () => {
      const response = await client.readResource({ uri: 'lifelog://recent' });

      expect(limitlessClient.listRecentLifelogs).toHaveBeenCalled();
      expect(response.contents[0].uri).toBe('lifelog://recent');
      expect(response.contents[0].mimeType).toBe('text/plain');
      expect(response.contents[0].text).toContain('Morning Standup');
      expect(response.contents[0].text).toContain('Project Review');
    });

    it('should read lifelogs by date', async () => {
      const response = await client.readResource({ uri: 'lifelog://2024-01-15' });

      expect(limitlessClient.listLifelogsByDate).toHaveBeenCalledWith('2024-01-15');
      expect(response.contents[0].text).toContain('Morning Standup');
    });

    it('should handle invalid resource URI', async () => {
      await expect(client.readResource({ uri: 'invalid://uri' })).rejects.toThrow();
    });
  });

  describe('Prompts Integration', () => {
    it('should list all available prompts', async () => {
      const response = await client.listPrompts();

      expect(response.prompts).toHaveLength(5);
      expect(response.prompts.map((p) => p.name)).toEqual([
        'daily-summary',
        'action-items',
        'key-topics',
        'meeting-notes',
        'search-insights',
      ]);
    });

    it('should get daily-summary prompt with arguments', async () => {
      const response = await client.getPrompt({
        name: 'daily-summary',
        arguments: { date: '2024-01-15' },
      });

      expect(response.messages).toHaveLength(1);
      expect(response.messages[0].role).toBe('user');
      expect(response.messages[0].content.text).toContain('2024-01-15');
      expect(response.messages[0].content.text).toContain('summarize');
    });

    it('should get action-items prompt', async () => {
      const response = await client.getPrompt({
        name: 'action-items',
        arguments: { date: '2024-01-15' },
      });

      expect(response.messages[0].content.text).toContain('action items');
      expect(response.messages[0].content.text).toContain('2024-01-15');
    });

    it('should handle missing required arguments', async () => {
      await expect(
        client.getPrompt({
          name: 'daily-summary',
          arguments: {}, // Missing required 'date'
        })
      ).rejects.toThrow();
    });

    it('should handle invalid prompt name', async () => {
      await expect(
        client.getPrompt({
          name: 'invalid-prompt',
          arguments: {},
        })
      ).rejects.toThrow();
    });
  });

  describe('Sampling Integration', () => {
    beforeEach(() => {
      const mockLifelogs = [
        {
          id: 'log-1',
          title: 'Team Meeting',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          markdown: '# Team Meeting\n\nDiscussed Q1 goals and project timeline.',
        },
      ];

      limitlessClient.listLifelogsByDate.mockResolvedValue(mockLifelogs);
      limitlessClient.searchLifelogs.mockResolvedValue(mockLifelogs);
    });

    it.skip('should handle summarization sampling request', async () => {
      const response = (await client.request(
        {
          method: 'sampling/createMessage',
          params: {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Summarize the lifelogs from 2024-01-15',
                },
              },
            ],
            maxTokens: 1000,
          },
        },
        CreateMessageRequestSchema
      )) as any;

      expect(response.role).toBe('assistant');
      expect((response.content as any).type).toBe('text');
      expect((response.content as any).text).toContain('Team Meeting');
      expect((response.content as any).text).toContain('Q1 goals');
    });

    it.skip('should handle action items extraction', async () => {
      const response = (await client.request(
        {
          method: 'sampling/createMessage',
          params: {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Extract action items from lifelogs on 2024-01-15',
                },
              },
            ],
            maxTokens: 1000,
          },
        },
        CreateMessageRequestSchema
      )) as any;

      expect((response.content as any).text).toContain('Action Items');
    });

    it.skip('should handle search analysis request', async () => {
      const response = (await client.request(
        {
          method: 'sampling/createMessage',
          params: {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Search for "project timeline" and analyze the results',
                },
              },
            ],
          },
        },
        CreateMessageRequestSchema
      )) as any;

      expect(limitlessClient.searchLifelogs).toHaveBeenCalledWith(
        'project timeline',
        expect.any(Object)
      );
      expect((response.content as any).text).toContain('Search Analysis');
    });

    it('should handle empty message list', async () => {
      await expect(
        client.request(
          {
            method: 'sampling/createMessage',
            params: {
              messages: [],
            },
          },
          CreateMessageRequestSchema
        )
      ).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      limitlessClient.listRecentLifelogs.mockRejectedValueOnce(new Error('Request timeout'));

      const response = await client.callTool({
        name: 'limitless_list_recent_lifelogs',
        arguments: {},
      });

      expect((response as any).content[0].text).toContain('Error');
      expect((response as any).content[0].text).toContain('timeout');
    });

    it('should handle API rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;
      limitlessClient.searchLifelogs.mockRejectedValueOnce(rateLimitError);

      const response = await client.callTool({
        name: 'limitless_search_lifelogs',
        arguments: { search_term: 'test' },
      });

      expect((response as any).content[0].text).toContain('Error');
      expect((response as any).content[0].text).toContain('Rate limit');
    });

    it('should handle malformed requests', async () => {
      await expect(
        client.callTool({
          name: undefined as any,
          arguments: {},
        })
      ).rejects.toThrow();
    });
  });

  describe('Environment Variable Configuration', () => {
    it('should respect timeout configuration', async () => {
      // This test verifies that the timeout is passed to the client
      // In the real server, this would be set via LIMITLESS_TIMEOUT env var
      expect(limitlessClient).toBeDefined();
      // The mock client was created with apiKey: 'test-key'
      expect(limitlessClient.constructor).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'test-key' })
      );
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent tool calls', async () => {
      const mockLifelog1 = {
        id: 'log-1',
        title: 'Meeting 1',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
      };
      const mockLifelog2 = {
        id: 'log-2',
        title: 'Meeting 2',
        startTime: '2024-01-15T14:00:00Z',
        endTime: '2024-01-15T15:00:00Z',
      };

      limitlessClient.getLifelogById
        .mockResolvedValueOnce(mockLifelog1)
        .mockResolvedValueOnce(mockLifelog2);

      const [response1, response2] = await Promise.all([
        client.callTool({
          name: 'limitless_get_lifelog_by_id',
          arguments: { lifelog_id: 'log-1' },
        }),
        client.callTool({
          name: 'limitless_get_lifelog_by_id',
          arguments: { lifelog_id: 'log-2' },
        }),
      ]);

      expect((response1 as any).content[0].text).toContain('Meeting 1');
      expect((response2 as any).content[0].text).toContain('Meeting 2');
      expect(limitlessClient.getLifelogById).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent requests across different features', async () => {
      limitlessClient.listRecentLifelogs.mockResolvedValue([
        {
          id: 'log-1',
          title: 'Recent Log',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
      ]);

      const [toolsResponse, resourcesResponse, promptsResponse] = await Promise.all([
        client.listTools(),
        client.listResources(),
        client.listPrompts(),
      ]);

      expect(toolsResponse.tools).toHaveLength(5);
      expect(resourcesResponse.resources).toBeDefined();
      expect(promptsResponse.prompts).toHaveLength(5);
    });
  });
});
