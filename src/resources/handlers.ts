import {
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ReadResourceRequest,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import { ResourceManager } from './manager';
import { logger } from '../utils/logger';
import { formatLifelogResponse } from '../utils/format';

export class ResourceHandlers {
  constructor(private resourceManager: ResourceManager) {}

  /**
   * Handle list resources request
   */
  async handleListResources(request: ListResourcesRequest): Promise<ListResourcesResult> {
    try {
      const baseUri = typeof request.params?.baseUri === 'string' ? request.params.baseUri : undefined;
      logger.debug('Handling list resources request', { baseUri });

      const resources = await this.resourceManager.listResources(baseUri);

      return {
        resources: resources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
      };
    } catch (error) {
      logger.error('Failed to list resources', error);
      throw error;
    }
  }

  /**
   * Handle list resource templates request
   */
  async handleListResourceTemplates(
    _request: ListResourceTemplatesRequest
  ): Promise<ListResourceTemplatesResult> {
    try {
      logger.debug('Handling list resource templates request');

      const templates = this.resourceManager.getTemplates();

      return {
        resourceTemplates: templates.map(template => ({
          uriTemplate: template.uriTemplate,
          name: template.name,
          description: template.description,
          mimeType: template.mimeType,
        })),
      };
    } catch (error) {
      logger.error('Failed to list resource templates', error);
      throw error;
    }
  }

  /**
   * Handle read resource request
   */
  async handleReadResource(request: ReadResourceRequest): Promise<ReadResourceResult> {
    try {
      const { uri } = request.params;
      logger.debug('Handling read resource request', { uri });

      if (!this.resourceManager.isValidUri(uri)) {
        throw new Error(`Invalid resource URI: ${uri}`);
      }

      const resource = await this.resourceManager.readResource(uri);

      if (!resource) {
        throw new Error(`Resource not found: ${uri}`);
      }

      // Format the response based on the resource type
      const lifelogs = Array.isArray(resource) ? resource : [resource];
      const formattedContent = formatLifelogResponse(lifelogs, {
        includeMarkdown: true,
        includeHeadings: true,
      });

      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: formattedContent,
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to read resource', error);
      throw error;
    }
  }

  /**
   * Handle resource subscription (if needed in future)
   */
  async handleSubscribeResource(request: unknown): Promise<void> {
    // Placeholder for future implementation
    logger.info('Resource subscription not yet implemented', request);
  }

  /**
   * Handle resource unsubscription (if needed in future)
   */
  async handleUnsubscribeResource(request: unknown): Promise<void> {
    // Placeholder for future implementation
    logger.info('Resource unsubscription not yet implemented', request);
  }
}