import { CreateMessageRequest, CreateMessageResult } from '@modelcontextprotocol/sdk/types.js';
import { LimitlessClient } from '../core/limitless-client';
import { logger } from '../utils/logger';
import { samplingTemplates, buildSamplingPrompt } from './templates';
import { formatLifelogResponse } from '../utils/format';

export class SamplingHandlers {
  constructor(private client: LimitlessClient) {}

  /**
   * Handle sampling create message request
   * Note: This is a mock implementation since we don't have actual LLM integration
   * In a real implementation, this would call an LLM API
   */
  async handleCreateMessage(request: CreateMessageRequest): Promise<CreateMessageResult> {
    try {
      const { messages, modelPreferences, systemPrompt, temperature, maxTokens, metadata } =
        request.params;

      logger.debug('Handling sampling request', {
        messageCount: messages.length,
        modelPreferences,
        metadata,
      });

      // Extract the user's request from messages
      const lastUserMessage = messages.filter((msg) => msg.role === 'user').pop();

      if (!lastUserMessage) {
        throw new Error('No user message found in sampling request');
      }

      // Extract text content from the message
      let textContent = '';

      if (
        typeof lastUserMessage.content === 'object' &&
        lastUserMessage.content !== null &&
        'type' in lastUserMessage.content &&
        lastUserMessage.content.type === 'text' &&
        'text' in lastUserMessage.content
      ) {
        textContent = String(lastUserMessage.content.text);
      }

      if (!textContent) {
        throw new Error('No text content found in user message');
      }

      // Check if this matches a template
      const templateMatch = this.matchTemplate(textContent);

      if (templateMatch) {
        // Process with template
        return this.processWithTemplate(templateMatch.template, templateMatch.variables, {
          temperature,
          maxTokens,
          modelPreferences,
        });
      }

      // Generic processing for non-template requests
      return this.processGenericRequest(textContent, {
        systemPrompt,
        temperature,
        maxTokens,
        modelPreferences,
      });
    } catch (error) {
      logger.error('Sampling request failed', error);
      throw error;
    }
  }

  private matchTemplate(
    text: string
  ): { template: string; variables: Record<string, string> } | null {
    // Simple pattern matching for demonstration
    // In a real implementation, this would be more sophisticated

    if (text.toLowerCase().includes('summarize')) {
      // Extract content to summarize
      const contentMatch = text.match(/summarize[:\s]+(.+)/i);
      if (contentMatch) {
        return {
          template: 'summarize',
          variables: { content: contentMatch[1] },
        };
      }
    }

    if (text.toLowerCase().includes('extract')) {
      // Extract info type and content
      const match = text.match(/extract\s+(\w+)\s+from[:\s]+(.+)/i);
      if (match) {
        return {
          template: 'extractInfo',
          variables: {
            infoType: match[1],
            content: match[2],
          },
        };
      }
    }

    if (text.toLowerCase().includes('analyze patterns')) {
      const contentMatch = text.match(/analyze patterns[:\s]+(.+)/i);
      if (contentMatch) {
        return {
          template: 'analyzePatterns',
          variables: { content: contentMatch[1] },
        };
      }
    }

    return null;
  }

  private async processWithTemplate(
    templateName: string,
    variables: Record<string, string>,
    _options: {
      temperature?: number;
      maxTokens?: number;
      modelPreferences?: unknown;
    }
  ): Promise<CreateMessageResult> {
    const template = samplingTemplates[templateName];
    if (!template) {
      throw new Error(`Unknown sampling template: ${templateName}`);
    }

    // Check if we need to fetch lifelog data
    if (variables.content && variables.content.startsWith('lifelog://')) {
      // Fetch the actual lifelog data
      const lifelogData = await this.fetchLifelogData(variables.content);
      variables.content = lifelogData;
    }

    const prompt = buildSamplingPrompt(template, variables);

    // Mock response generation
    // In a real implementation, this would call an LLM API
    const mockResponse = this.generateMockResponse(templateName, prompt);

    return {
      role: 'assistant',
      content: {
        type: 'text',
        text: mockResponse,
      },
      model: 'mock-model-v1',
      stopReason: 'endTurn',
    };
  }

  private async processGenericRequest(
    text: string,
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      modelPreferences?: unknown;
    }
  ): Promise<CreateMessageResult> {
    // Check if the request mentions lifelog URIs
    const uriMatch = text.match(/lifelog:\/\/[^\s]+/);
    if (uriMatch) {
      const lifelogData = await this.fetchLifelogData(uriMatch[0]);
      text = text.replace(uriMatch[0], lifelogData);
    }

    // Mock generic response
    const response = `I understand you want me to process: "${text}". In a real implementation, this would be sent to an LLM for processing with the following options: temperature=${options.temperature || 0.7}, maxTokens=${options.maxTokens || 1000}.`;

    return {
      role: 'assistant',
      content: {
        type: 'text',
        text: response,
      },
      model: 'mock-model-v1',
      stopReason: 'endTurn',
    };
  }

  private async fetchLifelogData(uri: string): Promise<string> {
    try {
      // Parse the URI to determine what to fetch
      if (uri === 'lifelog://recent') {
        const logs = await this.client.listRecentLifelogs({ limit: 5 });
        return formatLifelogResponse(logs, { includeMarkdown: true, includeHeadings: true });
      }

      const dateMatch = uri.match(/lifelog:\/\/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const logs = await this.client.listLifelogsByDate(dateMatch[1]);
        return formatLifelogResponse(logs, { includeMarkdown: true, includeHeadings: true });
      }

      const idMatch = uri.match(/lifelog:\/\/[^/]+\/(.+)/);
      if (idMatch) {
        const log = await this.client.getLifelogById(idMatch[1]);
        return formatLifelogResponse([log], { includeMarkdown: true, includeHeadings: true });
      }

      return `Unable to fetch data for URI: ${uri}`;
    } catch (error) {
      logger.error('Failed to fetch lifelog data for sampling', { uri, error });
      return `Error fetching lifelog data: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private generateMockResponse(templateName: string, prompt: string): string {
    // Mock responses based on template type
    switch (templateName) {
      case 'summarize':
        return `**Summary of Lifelog Content**

Based on the provided lifelog data, here are the key points:

1. **Main Topics**: The discussion covered project updates, team coordination, and upcoming deadlines.

2. **Key Decisions**: The team agreed to prioritize the API integration and postpone the UI redesign.

3. **Action Items**: 
   - Complete API documentation by Friday
   - Schedule follow-up meeting for next week
   - Review budget allocations

4. **Duration**: Approximately 45 minutes of recorded content.

This summary captures the essential information from your lifelog.`;

      case 'extractInfo':
        return `**Extracted Information**

Based on the analysis of the lifelog content:

- **Requested Information Type**: ${prompt.includes('dates') ? 'Important Dates' : 'Key Information'}
- **Extracted Data**:
  1. Meeting scheduled for January 20th at 2 PM
  2. Project deadline: February 15th
  3. Quarterly review: March 1st

The information has been extracted and organized for easy reference.`;

      case 'analyzePatterns':
        return `**Pattern Analysis Results**

After analyzing the lifelog data, I've identified the following patterns:

1. **Recurring Topics**:
   - Project status updates (mentioned 8 times)
   - Resource allocation (mentioned 5 times)
   - Client feedback (mentioned 4 times)

2. **Time Patterns**:
   - Most meetings occur between 10 AM - 12 PM
   - Friday afternoons have fewer recordings
   - Average discussion length: 30-45 minutes

3. **Key Relationships**:
   - Frequent collaboration with engineering team
   - Regular check-ins with project management
   - Client interactions primarily on Tuesdays

4. **Notable Changes**:
   - Increased focus on technical debt over the past week
   - Shift from planning to execution phase`;

      default:
        return `Processed your request using the ${templateName} template. In a real implementation, this would provide detailed analysis based on the actual lifelog content.`;
    }
  }
}
