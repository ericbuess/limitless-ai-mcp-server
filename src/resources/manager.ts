import { LimitlessClient } from '../core/limitless-client';
import { Resource, ResourceTemplate } from '../types/mcp';
import { Lifelog } from '../types/limitless';
import { logger } from '../utils/logger';

export class ResourceManager {
  private static readonly RESOURCE_TEMPLATES: ResourceTemplate[] = [
    {
      uriTemplate: 'lifelog://recent',
      name: 'Recent Lifelogs',
      description: 'Access recent lifelog recordings',
      mimeType: 'application/json',
    },
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

  constructor(private client: LimitlessClient) {}

  /**
   * List available resources based on the URI pattern
   */
  async listResources(uri?: string): Promise<Resource[]> {
    logger.debug('Listing resources', { uri });

    if (!uri || uri === 'lifelog://') {
      // Return templates when listing root
      return ResourceManager.RESOURCE_TEMPLATES.map(template => ({
        uri: template.uriTemplate,
        name: template.name,
        description: template.description,
        mimeType: template.mimeType,
      }));
    }

    const resources: Resource[] = [];

    // Handle different URI patterns
    if (uri === 'lifelog://recent') {
      // List recent lifelogs as resources
      const lifelogs = await this.client.listRecentLifelogs({ limit: 20 });
      resources.push(...this.lifelogsToResources(lifelogs));
    } else if (uri.match(/^lifelog:\/\/\d{4}-\d{2}-\d{2}$/)) {
      // List lifelogs for a specific date
      const date = uri.replace('lifelog://', '');
      const lifelogs = await this.client.listLifelogsByDate(date);
      resources.push(...this.lifelogsToResources(lifelogs, date));
    }

    return resources;
  }

  /**
   * Read a specific resource by URI
   */
  async readResource(uri: string): Promise<Lifelog | Lifelog[] | null> {
    logger.debug('Reading resource', { uri });

    // Parse URI patterns
    const recentMatch = uri.match(/^lifelog:\/\/recent$/);
    const dateMatch = uri.match(/^lifelog:\/\/(\d{4}-\d{2}-\d{2})$/);
    const specificMatch = uri.match(/^lifelog:\/\/(\d{4}-\d{2}-\d{2})\/(.+)$/);

    if (recentMatch) {
      // Return recent lifelogs
      return await this.client.listRecentLifelogs({ limit: 10 });
    } else if (dateMatch) {
      // Return all lifelogs for a date
      const date = dateMatch[1];
      return await this.client.listLifelogsByDate(date);
    } else if (specificMatch) {
      // Return specific lifelog
      const [, date, id] = specificMatch;
      
      // First get lifelogs for the date to find the specific one
      const lifelogs = await this.client.listLifelogsByDate(date);
      const lifelog = lifelogs.find(log => log.id === id);
      
      if (!lifelog) {
        logger.warn('Lifelog not found', { uri, date, id });
        return null;
      }
      
      // Get full details
      return await this.client.getLifelogById(id);
    }

    logger.warn('Unknown resource URI pattern', { uri });
    return null;
  }

  /**
   * Get resource templates
   */
  getTemplates(): ResourceTemplate[] {
    return ResourceManager.RESOURCE_TEMPLATES;
  }

  /**
   * Convert lifelogs to resources
   */
  private lifelogsToResources(lifelogs: Lifelog[], datePrefix?: string): Resource[] {
    return lifelogs.map(lifelog => {
      const date = datePrefix || lifelog.startTime.split('T')[0];
      return {
        uri: `lifelog://${date}/${lifelog.id}`,
        name: lifelog.title,
        description: `Lifelog from ${lifelog.startTime} to ${lifelog.endTime}`,
        mimeType: 'application/json',
        metadata: {
          id: lifelog.id,
          startTime: lifelog.startTime,
          endTime: lifelog.endTime,
          hasMarkdown: !!lifelog.markdown,
          contentCount: lifelog.contents?.length || 0,
        },
      };
    });
  }

  /**
   * Validate a resource URI
   */
  isValidUri(uri: string): boolean {
    const patterns = [
      /^lifelog:\/\/$/,
      /^lifelog:\/\/recent$/,
      /^lifelog:\/\/\d{4}-\d{2}-\d{2}$/,
      /^lifelog:\/\/\d{4}-\d{2}-\d{2}\/.+$/,
    ];
    
    return patterns.some(pattern => pattern.test(uri));
  }
}