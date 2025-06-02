import { SamplingHandlers } from '../../src/sampling/handlers';
import { LimitlessClient } from '../../src/core/limitless-client';
import { CreateMessageRequest } from '@modelcontextprotocol/sdk/types.js';

// Mock the LimitlessClient
jest.mock('../../src/core/limitless-client');

describe('SamplingHandlers', () => {
  let samplingHandlers: SamplingHandlers;
  let mockClient: jest.Mocked<LimitlessClient>;

  beforeEach(() => {
    mockClient = new LimitlessClient({
      apiKey: 'test-key',
    }) as jest.Mocked<LimitlessClient>;
    
    samplingHandlers = new SamplingHandlers(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCreateMessage', () => {
    it('should handle summarize template', async () => {
      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Summarize: This is a test content to summarize',
              },
            },
          ],
          maxTokens: 1000,
        },
      };

      const result = await samplingHandlers.handleCreateMessage(request);

      expect(result.role).toBe('assistant');
      expect(result.content.type).toBe('text');
      expect(result.content.text).toContain('Summary of Lifelog Content');
      expect(result.model).toBe('mock-model-v1');
    });

    it('should handle extract info template', async () => {
      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Extract dates from: Meeting on January 15th and follow-up on February 20th',
              },
            },
          ],
          maxTokens: 1000,
        },
      };

      const result = await samplingHandlers.handleCreateMessage(request);

      expect(result.content.text).toContain('Extracted Information');
      expect(result.content.text).toContain('Important Dates');
    });

    it('should handle analyze patterns template', async () => {
      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Analyze patterns: Daily standup meetings show consistent participation',
              },
            },
          ],
          maxTokens: 1000,
        },
      };

      const result = await samplingHandlers.handleCreateMessage(request);

      expect(result.content.text).toContain('Pattern Analysis Results');
      expect(result.content.text).toContain('Recurring Topics');
    });

    it('should handle lifelog URI in content', async () => {
      const mockLifelogs = [
        {
          id: 'log1',
          title: 'Test Meeting',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          markdown: 'Meeting content',
        },
      ];

      mockClient.listRecentLifelogs.mockResolvedValue(mockLifelogs);

      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Summarize: lifelog://recent',
              },
            },
          ],
          maxTokens: 1000,
        },
      };

      const result = await samplingHandlers.handleCreateMessage(request);

      expect(mockClient.listRecentLifelogs).toHaveBeenCalledWith({ limit: 5 });
      expect(result.content.text).toContain('Summary of Lifelog Content');
    });

    it('should handle generic requests without templates', async () => {
      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'What is the weather like?',
              },
            },
          ],
          maxTokens: 1000,
        },
      };

      const result = await samplingHandlers.handleCreateMessage(request);

      expect(result.content.text).toContain('I understand you want me to process');
      expect(result.content.text).toContain('What is the weather like?');
    });

    it('should throw error when no user message', async () => {
      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: 'Only assistant message',
              },
            },
          ],
          maxTokens: 1000,
        },
      };

      await expect(samplingHandlers.handleCreateMessage(request)).rejects.toThrow(
        'No user message found in sampling request'
      );
    });

    it('should throw error when no text content', async () => {
      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'user',
              content: {
                type: 'image',
                data: 'base64data',
                mimeType: 'image/png',
              } as any, // Type assertion needed for test
            },
          ],
          maxTokens: 1000,
        },
      };

      await expect(samplingHandlers.handleCreateMessage(request)).rejects.toThrow(
        'No text content found in user message'
      );
    });

    it('should handle model preferences and options', async () => {
      const request: CreateMessageRequest = {
        method: 'sampling/createMessage',
        params: {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Test content',
              },
            },
          ],
          modelPreferences: {
            hints: [{ name: 'gpt-4' }],
            intelligencePriority: 0.9,
          },
          temperature: 0.5,
          maxTokens: 1000,
          systemPrompt: 'You are a helpful assistant',
        },
      };

      const result = await samplingHandlers.handleCreateMessage(request);

      expect(result).toBeDefined();
      expect(result.content.text).toContain('temperature=0.5');
      expect(result.content.text).toContain('maxTokens=1000');
    });
  });
});