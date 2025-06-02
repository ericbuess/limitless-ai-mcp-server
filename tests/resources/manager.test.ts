import { ResourceManager } from '../../src/resources/manager';
import { LimitlessClient } from '../../src/core/limitless-client';
import { Lifelog } from '../../src/types/limitless';

// Mock the LimitlessClient
jest.mock('../../src/core/limitless-client');

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  let mockClient: jest.Mocked<LimitlessClient>;

  beforeEach(() => {
    mockClient = new LimitlessClient({
      apiKey: 'test-key',
    }) as jest.Mocked<LimitlessClient>;
    
    resourceManager = new ResourceManager(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listResources', () => {
    it('should return resource templates when listing root', async () => {
      const resources = await resourceManager.listResources('lifelog://');

      expect(resources).toHaveLength(3);
      expect(resources[0]).toEqual({
        uri: 'lifelog://recent',
        name: 'Recent Lifelogs',
        description: 'Access recent lifelog recordings',
        mimeType: 'application/json',
      });
    });

    it('should list recent lifelogs as resources', async () => {
      const mockLifelogs: Lifelog[] = [
        {
          id: 'log1',
          title: 'Meeting 1',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T11:00:00Z',
          markdown: 'Test content',
        },
      ];

      mockClient.listRecentLifelogs.mockResolvedValue(mockLifelogs);

      const resources = await resourceManager.listResources('lifelog://recent');

      expect(mockClient.listRecentLifelogs).toHaveBeenCalledWith({ limit: 20 });
      expect(resources).toHaveLength(1);
      expect(resources[0]).toMatchObject({
        uri: 'lifelog://2024-01-01/log1',
        name: 'Meeting 1',
        mimeType: 'application/json',
      });
    });

    it('should list lifelogs for a specific date', async () => {
      const mockLifelogs: Lifelog[] = [
        {
          id: 'log2',
          title: 'Daily Standup',
          startTime: '2024-01-15T09:00:00Z',
          endTime: '2024-01-15T09:30:00Z',
        },
      ];

      mockClient.listLifelogsByDate.mockResolvedValue(mockLifelogs);

      const resources = await resourceManager.listResources('lifelog://2024-01-15');

      expect(mockClient.listLifelogsByDate).toHaveBeenCalledWith('2024-01-15');
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('lifelog://2024-01-15/log2');
    });
  });

  describe('readResource', () => {
    it('should read recent lifelogs', async () => {
      const mockLifelogs: Lifelog[] = [
        {
          id: 'log1',
          title: 'Meeting 1',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T11:00:00Z',
        },
      ];

      mockClient.listRecentLifelogs.mockResolvedValue(mockLifelogs);

      const result = await resourceManager.readResource('lifelog://recent');

      expect(mockClient.listRecentLifelogs).toHaveBeenCalledWith({ limit: 10 });
      expect(result).toEqual(mockLifelogs);
    });

    it('should read all lifelogs for a date', async () => {
      const mockLifelogs: Lifelog[] = [
        {
          id: 'log2',
          title: 'Daily Standup',
          startTime: '2024-01-15T09:00:00Z',
          endTime: '2024-01-15T09:30:00Z',
        },
      ];

      mockClient.listLifelogsByDate.mockResolvedValue(mockLifelogs);

      const result = await resourceManager.readResource('lifelog://2024-01-15');

      expect(mockClient.listLifelogsByDate).toHaveBeenCalledWith('2024-01-15');
      expect(result).toEqual(mockLifelogs);
    });

    it('should read a specific lifelog by date and ID', async () => {
      const mockLifelogs: Lifelog[] = [
        {
          id: 'log3',
          title: 'Project Review',
          startTime: '2024-01-20T14:00:00Z',
          endTime: '2024-01-20T15:00:00Z',
        },
      ];

      const detailedLog: Lifelog = {
        ...mockLifelogs[0],
        markdown: 'Detailed content',
        contents: [
          {
            type: 'heading1',
            content: 'Project Status',
            startTime: '2024-01-20T14:00:00Z',
            endTime: '2024-01-20T14:01:00Z',
            startOffsetMs: 0,
            endOffsetMs: 60000,
            children: [],
          },
        ],
      };

      mockClient.listLifelogsByDate.mockResolvedValue(mockLifelogs);
      mockClient.getLifelogById.mockResolvedValue(detailedLog);

      const result = await resourceManager.readResource('lifelog://2024-01-20/log3');

      expect(mockClient.listLifelogsByDate).toHaveBeenCalledWith('2024-01-20');
      expect(mockClient.getLifelogById).toHaveBeenCalledWith('log3');
      expect(result).toEqual(detailedLog);
    });

    it('should return null for unknown URI patterns', async () => {
      const result = await resourceManager.readResource('unknown://resource');

      expect(result).toBeNull();
    });

    it('should return null when specific lifelog not found', async () => {
      mockClient.listLifelogsByDate.mockResolvedValue([]);

      const result = await resourceManager.readResource('lifelog://2024-01-20/nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('isValidUri', () => {
    it('should validate correct URI patterns', () => {
      expect(resourceManager.isValidUri('lifelog://')).toBe(true);
      expect(resourceManager.isValidUri('lifelog://recent')).toBe(true);
      expect(resourceManager.isValidUri('lifelog://2024-01-15')).toBe(true);
      expect(resourceManager.isValidUri('lifelog://2024-01-15/abc123')).toBe(true);
    });

    it('should reject invalid URI patterns', () => {
      expect(resourceManager.isValidUri('http://example.com')).toBe(false);
      expect(resourceManager.isValidUri('lifelog://invalid-date')).toBe(false);
      expect(resourceManager.isValidUri('lifelog')).toBe(false);
      expect(resourceManager.isValidUri('')).toBe(false);
    });
  });

  describe('getTemplates', () => {
    it('should return resource templates', () => {
      const templates = resourceManager.getTemplates();

      expect(templates).toHaveLength(3);
      expect(templates[0].uriTemplate).toBe('lifelog://recent');
      expect(templates[1].uriTemplate).toBe('lifelog://{date}');
      expect(templates[2].uriTemplate).toBe('lifelog://{date}/{id}');
    });
  });
});