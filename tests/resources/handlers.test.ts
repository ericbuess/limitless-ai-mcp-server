import { ResourceHandlers } from '../../src/resources/handlers';
import { ResourceManager } from '../../src/resources/manager';
import {
  ListResourcesRequest,
  ListResourceTemplatesRequest,
  ReadResourceRequest,
} from '@modelcontextprotocol/sdk/types.js';

// Mock the ResourceManager
jest.mock('../../src/resources/manager');

describe('ResourceHandlers', () => {
  let resourceHandlers: ResourceHandlers;
  let mockManager: any;

  beforeEach(() => {
    mockManager = {
      listResources: jest.fn(),
      readResource: jest.fn(),
      isValidUri: jest.fn(),
    };

    // Add static method mock
    (ResourceManager as any).RESOURCE_TEMPLATES = [
      {
        uriTemplate: 'lifelog://{date}',
        name: 'Lifelogs by Date',
        description: 'Access lifelogs from a specific date (YYYY-MM-DD)',
        mimeType: 'application/json',
      },
      {
        uriTemplate: 'lifelog://{date}/{id}',
        name: 'Specific Lifelog',
        description: 'Access a specific lifelog by date and ID',
        mimeType: 'application/json',
      },
    ];

    resourceHandlers = new ResourceHandlers(mockManager);
    jest.clearAllMocks();
  });

  describe('handleListResources', () => {
    it('should list resources without cursor', async () => {
      const mockResources = [
        {
          uri: 'lifelog://recent',
          name: 'Recent Recordings',
          description: 'Browse your most recent recordings',
          mimeType: 'application/json',
        },
        {
          uri: 'lifelog://2024-01-15',
          name: 'Recordings from 2024-01-15',
          description: 'Browse recordings from January 15, 2024',
          mimeType: 'application/json',
        },
      ];

      mockManager.listResources.mockResolvedValueOnce(mockResources);

      const request: ListResourcesRequest = {
        method: 'resources/list',
        params: {},
      };

      const result = await resourceHandlers.handleListResources(request);

      expect(mockManager.listResources).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({
        resources: mockResources,
      });
    });

    it('should list resources with cursor', async () => {
      const mockResources = [
        {
          uri: 'lifelog://2024-01-16',
          name: 'Recordings from 2024-01-16',
          description: 'Browse recordings from January 16, 2024',
          mimeType: 'application/json',
        },
      ];

      mockManager.listResources.mockResolvedValueOnce(mockResources);

      const request: ListResourcesRequest = {
        method: 'resources/list',
        params: {
          baseUri: 'page-2',
        },
      };

      const result = await resourceHandlers.handleListResources(request);

      expect(mockManager.listResources).toHaveBeenCalledWith('page-2');
      expect(result).toEqual({
        resources: mockResources,
      });
    });

    it('should handle empty resource list', async () => {
      mockManager.listResources.mockResolvedValueOnce([]);

      const request: ListResourcesRequest = {
        method: 'resources/list',
        params: {},
      };

      const result = await resourceHandlers.handleListResources(request);

      expect(result).toEqual({
        resources: [],
      });
    });

    it('should handle errors from manager', async () => {
      mockManager.listResources.mockRejectedValueOnce(new Error('Manager error'));

      const request: ListResourcesRequest = {
        method: 'resources/list',
        params: {},
      };

      await expect(resourceHandlers.handleListResources(request)).rejects.toThrow('Manager error');
    });
  });

  describe('handleListResourceTemplates', () => {
    it('should list resource templates', async () => {
      const request: ListResourceTemplatesRequest = {
        method: 'resources/templates/list',
        params: {},
      };

      const result = await resourceHandlers.handleListResourceTemplates(request);

      expect(result).toEqual({
        resourceTemplates: (ResourceManager as any).RESOURCE_TEMPLATES,
      });
    });

    it('should handle resource templates', async () => {
      const request: ListResourceTemplatesRequest = {
        method: 'resources/templates/list',
        params: {},
      };

      const result = await resourceHandlers.handleListResourceTemplates(request);

      expect(result.resourceTemplates).toBeDefined();
      expect(result.resourceTemplates.length).toBeGreaterThan(0);
    });

    it('should handle error when templates are missing', async () => {
      // Temporarily remove templates
      const originalTemplates = (ResourceManager as any).RESOURCE_TEMPLATES;
      (ResourceManager as any).RESOURCE_TEMPLATES = undefined;

      const request: ListResourceTemplatesRequest = {
        method: 'resources/templates/list',
        params: {},
      };

      // Should throw error when templates are undefined
      await expect(resourceHandlers.handleListResourceTemplates(request)).rejects.toThrow();

      // Restore templates
      (ResourceManager as any).RESOURCE_TEMPLATES = originalTemplates;
    });
  });

  describe('handleReadResource', () => {
    it('should read resource successfully', async () => {
      const mockLifelogs = [
        {
          id: '1',
          title: 'Recent Recording',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z',
        },
      ];

      mockManager.isValidUri.mockReturnValueOnce(true);
      mockManager.readResource.mockResolvedValueOnce(mockLifelogs);

      const request: ReadResourceRequest = {
        method: 'resources/read',
        params: {
          uri: 'lifelog://recent',
        },
      };

      const result = await resourceHandlers.handleReadResource(request);

      expect(mockManager.isValidUri).toHaveBeenCalledWith('lifelog://recent');
      expect(mockManager.readResource).toHaveBeenCalledWith('lifelog://recent');
      expect(result.contents).toBeDefined();
      expect(result.contents[0].uri).toBe('lifelog://recent');
      expect(result.contents[0].mimeType).toBe('text/plain');
      expect(result.contents[0].text).toContain('Recent Recording');
    });

    it('should handle date-specific resource', async () => {
      const mockLifelogs = [
        {
          id: '2',
          title: 'Meeting on Jan 15',
          startTime: '2024-01-15T14:00:00Z',
          endTime: '2024-01-15T15:00:00Z',
        },
      ];

      mockManager.isValidUri.mockReturnValueOnce(true);
      mockManager.readResource.mockResolvedValueOnce(mockLifelogs);

      const request: ReadResourceRequest = {
        method: 'resources/read',
        params: {
          uri: 'lifelog://2024-01-15',
        },
      };

      const result = await resourceHandlers.handleReadResource(request);

      expect(mockManager.readResource).toHaveBeenCalledWith('lifelog://2024-01-15');
      expect(result.contents[0].text).toContain('Meeting on Jan 15');
    });

    it('should handle specific lifelog resource', async () => {
      const mockLifelog = {
        id: 'abc123',
        title: 'Specific Recording',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        markdown: 'Full content here',
      };

      mockManager.isValidUri.mockReturnValueOnce(true);
      mockManager.readResource.mockResolvedValueOnce(mockLifelog);

      const request: ReadResourceRequest = {
        method: 'resources/read',
        params: {
          uri: 'lifelog://2024-01-15/abc123',
        },
      };

      const result = await resourceHandlers.handleReadResource(request);

      expect(mockManager.readResource).toHaveBeenCalledWith('lifelog://2024-01-15/abc123');
      expect(result.contents[0].text).toContain('Full content here');
    });

    it('should handle resource not found', async () => {
      mockManager.isValidUri.mockReturnValueOnce(true);
      mockManager.readResource.mockResolvedValueOnce(null);

      const request: ReadResourceRequest = {
        method: 'resources/read',
        params: {
          uri: 'lifelog://nonexistent',
        },
      };

      await expect(resourceHandlers.handleReadResource(request)).rejects.toThrow(
        'Resource not found'
      );
    });

    it('should handle invalid URI', async () => {
      mockManager.isValidUri.mockReturnValueOnce(false);

      const request: ReadResourceRequest = {
        method: 'resources/read',
        params: {
          uri: 'invalid://uri',
        },
      };

      await expect(resourceHandlers.handleReadResource(request)).rejects.toThrow(
        'Invalid resource URI: invalid://uri'
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle pagination flow', async () => {
      // First page
      mockManager.listResources.mockResolvedValueOnce([
        {
          uri: 'lifelog://2024-01-15',
          name: 'Recordings from 2024-01-15',
          description: 'Browse recordings from January 15, 2024',
          mimeType: 'application/json',
        },
      ]);

      const firstRequest: ListResourcesRequest = {
        method: 'resources/list',
        params: {},
      };

      const firstResult = await resourceHandlers.handleListResources(firstRequest);
      expect(firstResult.resources).toHaveLength(1);

      // Second page
      mockManager.listResources.mockResolvedValueOnce([
        {
          uri: 'lifelog://2024-01-16',
          name: 'Recordings from 2024-01-16',
          description: 'Browse recordings from January 16, 2024',
          mimeType: 'application/json',
        },
      ]);

      const secondRequest: ListResourcesRequest = {
        method: 'resources/list',
        params: {
          cursor: 'page-2',
        },
      };

      const secondResult = await resourceHandlers.handleListResources(secondRequest);
      expect(secondResult.resources).toHaveLength(1);
    });

    it('should handle template-based resource creation', async () => {
      const templateRequest: ListResourceTemplatesRequest = {
        method: 'resources/templates/list',
        params: {},
      };

      const templateResult = await resourceHandlers.handleListResourceTemplates(templateRequest);
      expect(templateResult.resourceTemplates).toHaveLength(2);

      // Use template to read resource
      const mockLifelogs: any[] = [];

      mockManager.isValidUri.mockReturnValueOnce(true);
      mockManager.readResource.mockResolvedValueOnce(mockLifelogs);

      const readRequest: ReadResourceRequest = {
        method: 'resources/read',
        params: {
          uri: 'lifelog://2024-01-20',
        },
      };

      const readResult = await resourceHandlers.handleReadResource(readRequest);
      expect(readResult.contents[0].uri).toBe('lifelog://2024-01-20');
    });
  });

  describe('handleSubscribeResource', () => {
    it('should log info about not implemented feature', async () => {
      const writtenOutput: string[] = [];
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation((data: string | Uint8Array) => {
          if (typeof data === 'string') {
            writtenOutput.push(data);
          }
          return true;
        });

      await resourceHandlers.handleSubscribeResource({ test: 'data' });

      expect(writtenOutput.length).toBeGreaterThan(0);
      expect(writtenOutput[0]).toContain('[INFO]');
      expect(writtenOutput[0]).toContain('Resource subscription not yet implemented');
      stderrSpy.mockRestore();
    });
  });

  describe('handleUnsubscribeResource', () => {
    it('should log info about not implemented feature', async () => {
      const writtenOutput: string[] = [];
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation((data: string | Uint8Array) => {
          if (typeof data === 'string') {
            writtenOutput.push(data);
          }
          return true;
        });

      await resourceHandlers.handleUnsubscribeResource({ test: 'data' });

      expect(writtenOutput.length).toBeGreaterThan(0);
      expect(writtenOutput[0]).toContain('[INFO]');
      expect(writtenOutput[0]).toContain('Resource unsubscription not yet implemented');
      stderrSpy.mockRestore();
    });
  });
});
