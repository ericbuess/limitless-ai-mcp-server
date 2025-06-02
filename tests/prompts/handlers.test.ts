import { PromptHandlers } from '../../src/prompts/handlers';
import { ListPromptsRequest, GetPromptRequest } from '@modelcontextprotocol/sdk/types.js';

describe('PromptHandlers', () => {
  let promptHandlers: PromptHandlers;

  beforeEach(() => {
    promptHandlers = new PromptHandlers();
  });

  describe('handleListPrompts', () => {
    it('should list all available prompts', async () => {
      const request: ListPromptsRequest = { method: 'prompts/list', params: {} };
      const result = await promptHandlers.handleListPrompts(request);

      expect(result.prompts).toHaveLength(5);

      const promptNames = result.prompts.map((p) => p.name);
      expect(promptNames).toContain('daily-summary');
      expect(promptNames).toContain('action-items');
      expect(promptNames).toContain('key-topics');
      expect(promptNames).toContain('meeting-notes');
      expect(promptNames).toContain('search-insights');

      // Check structure of a prompt
      const dailySummary = result.prompts.find((p) => p.name === 'daily-summary');
      expect(dailySummary).toMatchObject({
        name: 'daily-summary',
        description: 'Summarize all lifelogs from a specific day',
        arguments: expect.arrayContaining([
          {
            name: 'date',
            description: 'The date to summarize (YYYY-MM-DD)',
            required: true,
          },
        ]),
      });
    });
  });

  describe('handleGetPrompt', () => {
    it('should get daily-summary prompt with required arguments', async () => {
      const request: GetPromptRequest = {
        method: 'prompts/get',
        params: {
          name: 'daily-summary',
          arguments: {
            date: '2024-01-15',
          },
        },
      };

      const result = await promptHandlers.handleGetPrompt(request);

      expect(result.description).toBe('Summarize all lifelogs from a specific day');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
      expect(result.messages[0].content.text).toContain('2024-01-15');
      expect(result.messages[0].content.text).toContain('limitless_list_lifelogs_by_date');
    });

    it('should get action-items prompt with format option', async () => {
      const request: GetPromptRequest = {
        method: 'prompts/get',
        params: {
          name: 'action-items',
          arguments: {
            date: 'recent',
            format: 'detailed',
          },
        },
      };

      const result = await promptHandlers.handleGetPrompt(request);

      expect(result.messages[0].content.text).toContain('recent recordings');
      expect(result.messages[0].content.text).toContain('Include full context and quotes');
    });

    it('should get search-insights prompt', async () => {
      const request: GetPromptRequest = {
        method: 'prompts/get',
        params: {
          name: 'search-insights',
          arguments: {
            searchTerm: 'project updates',
            limit: '20',
          },
        },
      };

      const result = await promptHandlers.handleGetPrompt(request);

      expect(result.messages[0].content.text).toContain('project updates');
      expect(result.messages[0].content.text).toContain('limit: 20');
      expect(result.messages[0].content.text).toContain('limitless_search_lifelogs');
    });

    it('should handle meeting-notes with multiple messages', async () => {
      const request: GetPromptRequest = {
        method: 'prompts/get',
        params: {
          name: 'meeting-notes',
          arguments: {
            date: '2024-01-15',
          },
        },
      };

      const result = await promptHandlers.handleGetPrompt(request);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content.text).toContain('2024-01-15');
      expect(result.messages[1].content.text).toContain('Meeting Notes');
    });

    it('should throw error for unknown prompt', async () => {
      const request: GetPromptRequest = {
        method: 'prompts/get',
        params: {
          name: 'unknown-prompt',
          arguments: {},
        },
      };

      await expect(promptHandlers.handleGetPrompt(request)).rejects.toThrow(
        'Unknown prompt: unknown-prompt'
      );
    });

    it('should throw error for missing required arguments', async () => {
      const request: GetPromptRequest = {
        method: 'prompts/get',
        params: {
          name: 'daily-summary',
          arguments: {}, // Missing required 'date' argument
        },
      };

      await expect(promptHandlers.handleGetPrompt(request)).rejects.toThrow(
        'Missing required arguments: date'
      );
    });

    it('should handle optional arguments', async () => {
      const request: GetPromptRequest = {
        method: 'prompts/get',
        params: {
          name: 'daily-summary',
          arguments: {
            date: '2024-01-15',
            timezone: 'America/New_York',
          },
        },
      };

      const result = await promptHandlers.handleGetPrompt(request);

      expect(result.messages[0].content.text).toContain('timezone: America/New_York');
    });

    it('should get key-topics prompt', async () => {
      const request: GetPromptRequest = {
        method: 'prompts/get',
        params: {
          name: 'key-topics',
          arguments: {
            date: '2024-01-15',
          },
        },
      };

      const result = await promptHandlers.handleGetPrompt(request);

      expect(result.messages[0].content.text).toContain('main topics');
      expect(result.messages[0].content.text).toContain('2024-01-15');
    });
  });
});
