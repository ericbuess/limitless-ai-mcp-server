import {
  ListPromptsRequest,
  ListPromptsResult,
  GetPromptRequest,
  GetPromptResult,
} from '@modelcontextprotocol/sdk/types.js';
import { promptTemplates, getPromptContent } from './templates';
import { logger } from '../utils/logger';

export class PromptHandlers {
  /**
   * Handle list prompts request
   */
  async handleListPrompts(_request: ListPromptsRequest): Promise<ListPromptsResult> {
    try {
      logger.debug('Handling list prompts request');

      const prompts = Object.values(promptTemplates).map((template) => ({
        name: template.name,
        description: template.description,
        arguments: template.arguments,
      }));

      return { prompts };
    } catch (error) {
      logger.error('Failed to list prompts', error);
      throw error;
    }
  }

  /**
   * Handle get prompt request
   */
  async handleGetPrompt(request: GetPromptRequest): Promise<GetPromptResult> {
    try {
      const { name, arguments: args = {} } = request.params;
      logger.debug('Handling get prompt request', { name, args });

      const template = promptTemplates[name];
      if (!template) {
        throw new Error(`Unknown prompt: ${name}`);
      }

      // Validate required arguments
      const missingArgs = template.arguments
        ?.filter((arg) => arg.required && !args[arg.name])
        .map((arg) => arg.name);

      if (missingArgs && missingArgs.length > 0) {
        throw new Error(`Missing required arguments: ${missingArgs.join(', ')}`);
      }

      // Get the prompt content
      const messages = getPromptContent(name, args as Record<string, string>);

      return {
        description: template.description,
        messages,
      };
    } catch (error) {
      logger.error('Failed to get prompt', error);
      throw error;
    }
  }
}
