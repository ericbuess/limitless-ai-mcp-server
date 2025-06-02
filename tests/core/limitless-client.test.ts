import { LimitlessClient } from '../../src/core/limitless-client';
import { LimitlessAPIError } from '../../src/core/limitless-client';
import { lifelogCache, lifelogArrayCache, searchCache } from '../../src/core/cache';

// Mock dependencies
jest.mock('../../src/core/cache');
jest.mock('../../src/utils/logger');

// Mock global fetch
global.fetch = jest.fn();

describe('LimitlessClient', () => {
  let client: LimitlessClient;
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.com/v1';

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
    client = new LimitlessClient({
      apiKey: mockApiKey,
      baseUrl: mockBaseUrl,
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100,
    });
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(client).toBeDefined();
    });

    it('should use default values when not provided', () => {
      const defaultClient = new LimitlessClient({ apiKey: mockApiKey });
      expect(defaultClient).toBeDefined();
    });

    it('should throw error when API key is missing', () => {
      expect(() => new LimitlessClient({ apiKey: '' })).toThrow('API key is required');
      expect(() => new LimitlessClient({} as any)).toThrow('API key is required');
    });
  });

  describe('makeRequest', () => {
    it('should make successful request with correct headers', async () => {
      const mockResponse = { data: { lifelogs: [] } };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client['makeRequest']('/lifelogs');

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/lifelogs`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': mockApiKey,
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should retry on failure', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { lifelogs: [] } }),
        });

      const result = await client['makeRequest']('/lifelogs');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: { lifelogs: [] } });
    });

    it('should throw LimitlessAPIError on 401', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Unauthorized' }),
      });

      await expect(client['makeRequest']('/lifelogs')).rejects.toThrow(LimitlessAPIError);
    });

    it('should handle timeout', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(
        () => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('The operation was aborted')), 100);
        })
      );

      await expect(client['makeRequest']('/lifelogs')).rejects.toThrow();
    });

    it('should handle AbortError as timeout', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(abortError)
        .mockRejectedValueOnce(abortError);

      await expect(client['makeRequest']('/lifelogs')).rejects.toThrow(LimitlessAPIError);
    });

    it('should handle non-Error objects', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce('string error')
        .mockRejectedValueOnce('string error');

      await expect(client['makeRequest']('/lifelogs')).rejects.toThrow('string error');
    });
  });

  describe('getLifelogById', () => {
    const mockLifelog = {
      id: 'test-id',
      title: 'Test Log',
      startTime: '2024-01-15T10:00:00Z',
      endTime: '2024-01-15T11:00:00Z',
    };

    it('should fetch lifelog by ID', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockLifelog }),
      });

      const result = await client.getLifelogById('test-id');

      expect(result).toEqual(mockLifelog);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lifelogs/test-id'),
        expect.any(Object)
      );
    });

    it('should use cache when available', async () => {
      (lifelogCache.get as jest.Mock).mockReturnValueOnce(mockLifelog);

      const result = await client.getLifelogById('test-id');

      expect(result).toEqual(mockLifelog);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle includeMarkdown option', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockLifelog }),
      });

      await client.getLifelogById('test-id', { includeMarkdown: true });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('includeMarkdown=true'),
        expect.any(Object)
      );
    });

    it('should handle includeHeadings option', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockLifelog }),
      });

      await client.getLifelogById('test-id', { includeHeadings: true });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('includeHeadings=true'),
        expect.any(Object)
      );
    });

    it('should handle API error response', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: { message: 'Resource not found', code: 'NOT_FOUND' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: { message: 'Resource not found', code: 'NOT_FOUND' } }),
        });

      await expect(client.getLifelogById('test-id')).rejects.toThrow(LimitlessAPIError);
    });
  });

  describe('listRecentLifelogs', () => {
    const mockLifelogs = [
      { id: '1', title: 'Log 1', startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z' },
      { id: '2', title: 'Log 2', startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z' },
    ];

    it('should fetch recent lifelogs', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      const result = await client.listRecentLifelogs();

      expect(result).toEqual(mockLifelogs);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lifelogs?'),
        expect.any(Object)
      );
    });

    it('should apply limit option', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      await client.listRecentLifelogs({ limit: 5 });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object)
      );
    });

    it('should handle pagination', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            data: { lifelogs: [mockLifelogs[0]] },
            pagination: { nextCursor: 'cursor1', hasMore: true }
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            data: { lifelogs: [mockLifelogs[1]] },
            pagination: { hasMore: false }
          }),
        });

      const result = await client.listRecentLifelogs({ limit: 2 });

      expect(result).toEqual(mockLifelogs);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use cache for recent lifelogs', async () => {
      (lifelogArrayCache.get as jest.Mock).mockReturnValueOnce(mockLifelogs);

      const result = await client.listRecentLifelogs();

      expect(result).toEqual(mockLifelogs);
      expect(lifelogArrayCache.get).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('listLifelogsByDate', () => {
    const mockLifelogs = [
      { id: '1', title: 'Log 1', startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z' },
    ];

    it('should fetch lifelogs by date', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      const result = await client.listLifelogsByDate('2024-01-15');

      expect(result).toEqual(mockLifelogs);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('date=2024-01-15'),
        expect.any(Object)
      );
    });

    it('should use cache for date queries', async () => {
      (lifelogArrayCache.get as jest.Mock).mockReturnValueOnce(mockLifelogs);

      const result = await client.listLifelogsByDate('2024-01-15');

      expect(result).toEqual(mockLifelogs);
      expect(lifelogArrayCache.get).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should apply timezone option', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      await client.listLifelogsByDate('2024-01-15', { timezone: 'America/New_York' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('timezone=America%2FNew_York'),
        expect.any(Object)
      );
    });

    it('should handle includeHeadings parameter', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      await client.listLifelogsByDate('2024-01-15', { includeHeadings: false });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('includeHeadings=false'),
        expect.any(Object)
      );
    });
  });

  describe('listLifelogsByRange', () => {
    const mockLifelogs = [
      { id: '1', title: 'Log 1', startTime: '2024-01-10T10:00:00Z', endTime: '2024-01-10T11:00:00Z' },
      { id: '2', title: 'Log 2', startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z' },
    ];

    it('should fetch lifelogs by date range', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      const result = await client.listLifelogsByRange({
        start: '2024-01-10',
        end: '2024-01-15',
      });

      expect(result).toEqual(mockLifelogs);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('start=2024-01-10'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('end=2024-01-15'),
        expect.any(Object)
      );
    });

    it('should parse date-time strings correctly', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      await client.listLifelogsByRange({
        start: '2024-01-10 14:30:00',
        end: '2024-01-15 18:45:00',
      });

      // The fetch was called once with both parameters in the URL
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [[url]] = (global.fetch as jest.Mock).mock.calls;
      expect(url).toContain('start=2024-01-10');
      // The date strings will be parsed and may change based on timezone
      expect(url).toMatch(/end=2024-01-1[56]/); // Could be 15 or 16 depending on timezone
    });
  });

  describe('searchLifelogs', () => {
    const mockLifelogs = [
      { id: '1', title: 'Meeting about project', startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z', markdown: 'Discussed project timeline' },
      { id: '2', title: 'Project review', startTime: '2024-01-15T14:00:00Z', endTime: '2024-01-15T15:00:00Z', markdown: 'Reviewed project status' },
    ];

    it('should search lifelogs', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      const result = await client.searchLifelogs({ searchTerm: 'project' });

      expect(result).toEqual(mockLifelogs);
    });

    it('should use search cache', async () => {
      (searchCache.get as jest.Mock).mockReturnValueOnce(mockLifelogs);

      const result = await client.searchLifelogs({ searchTerm: 'project' });

      expect(result).toEqual(mockLifelogs);
      expect(searchCache.get).toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should filter results by search term', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      const result = await client.searchLifelogs({ 
        searchTerm: 'timeline',
        includeMarkdown: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should search in contents array', async () => {
      const logsWithContents = [
        {
          id: '1',
          title: 'Meeting',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
          contents: [
            { type: 'text', content: 'Discussion about budget planning', startTime: '', endTime: '', startOffsetMs: 0, endOffsetMs: 0, children: [] },
          ],
        },
        {
          id: '2',
          title: 'Review',
          startTime: '2024-01-15T14:00:00Z',
          endTime: '2024-01-15T15:00:00Z',
          contents: [
            { type: 'text', content: 'Code review session', startTime: '', endTime: '', startOffsetMs: 0, endOffsetMs: 0, children: [] },
          ],
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: logsWithContents } }),
      });

      const result = await client.searchLifelogs({ 
        searchTerm: 'budget',
        includeMarkdown: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should apply fetch and result limits', async () => {
      const manyLogs = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`,
        title: `Log ${i}`,
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        markdown: i % 2 === 0 ? 'Contains search term' : 'Other content',
      }));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: manyLogs.slice(0, 20) } }),
      });

      const result = await client.searchLifelogs({ 
        searchTerm: 'search',
        fetchLimit: 20,
        limit: 5,
        includeMarkdown: true,
      });

      expect(result).toHaveLength(5);
    });

    it('should handle empty search results', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: [] } }),
      });

      const result = await client.searchLifelogs({ searchTerm: 'nonexistent' });

      expect(result).toEqual([]);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(client.getLifelogById('test-id')).rejects.toThrow('Network error');
    });

    it('should handle malformed JSON response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
        text: async () => 'Invalid response',
      });

      await expect(client.getLifelogById('test-id')).rejects.toThrow();
    });

    it('should handle rate limiting (429)', async () => {
      // Mock all retry attempts
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: async () => ({ message: 'Rate limit exceeded' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: async () => ({ message: 'Rate limit exceeded' }),
        });

      await expect(client.listRecentLifelogs()).rejects.toThrow(LimitlessAPIError);
    });

    it('should handle server errors (500)', async () => {
      // Mock all retry attempts
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ message: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ message: 'Server error' }),
        });

      await expect(client.listRecentLifelogs()).rejects.toThrow(LimitlessAPIError);
    });
  });

  describe('fetchAllLifelogs', () => {
    it('should handle array response format', async () => {
      const mockLifelogs = [{ id: '1', title: 'Log 1' }];
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockLifelogs }),
      });

      const result = await client.listRecentLifelogs();
      expect(result).toEqual(mockLifelogs);
    });

    it('should handle nested lifelogs format', async () => {
      const mockLifelogs = [{ id: '1', title: 'Log 1' }];
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { lifelogs: mockLifelogs } }),
      });

      const result = await client.listRecentLifelogs();
      expect(result).toEqual(mockLifelogs);
    });

    it('should throw on unexpected format', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { unexpected: 'format' } }),
      });

      await expect(client.listRecentLifelogs()).rejects.toThrow('Unexpected API response format');
    });

    it('should handle API error in fetchAllLifelogs', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: { message: 'Server error', code: 'INTERNAL_ERROR' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: { message: 'Server error', code: 'INTERNAL_ERROR' } }),
        });

      await expect(client.listRecentLifelogs()).rejects.toThrow(LimitlessAPIError);
    });
  });
});

describe('LimitlessAPIError', () => {
  it('should create error with status and details', () => {
    const error = new LimitlessAPIError('Not Found', 404, 'NOT_FOUND', 'Resource not found');
    
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.details).toBe('Resource not found');
    expect(error.message).toBe('Not Found');
    expect(error.name).toBe('LimitlessAPIError');
  });
});