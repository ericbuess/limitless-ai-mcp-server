#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
import { LimitlessClient } from './core/limitless-client';
import { ToolHandlers } from './tools/handlers';
import { toolDefinitions } from './tools/definitions';
import { ResourceManager } from './resources/manager';
import { ResourceHandlers } from './resources/handlers';
import { PromptHandlers } from './prompts/handlers';
import { SamplingHandlers } from './sampling/handlers';
import { logger } from './utils/logger';

// Server metadata
const SERVER_INFO = {
  name: 'limitless-ai-mcp-server',
  version: '0.0.1',
  description: 'MCP server for integrating Limitless AI Pendant recordings with AI assistants',
};

// Environment variable names
const API_KEY_ENV = 'LIMITLESS_API_KEY';
const BASE_URL_ENV = 'LIMITLESS_BASE_URL';
const TIMEOUT_ENV = 'LIMITLESS_TIMEOUT';

async function main() {
  // Get configuration from environment
  const apiKey = process.env[API_KEY_ENV];
  if (!apiKey) {
    logger.error(`Missing required environment variable: ${API_KEY_ENV}`);
    process.exit(1);
  }

  const baseUrl = process.env[BASE_URL_ENV];
  const timeout = process.env[TIMEOUT_ENV] ? parseInt(process.env[TIMEOUT_ENV], 10) : undefined;

  // Initialize client
  const client = new LimitlessClient({
    apiKey,
    baseUrl,
    timeout,
  });

  const toolHandlers = new ToolHandlers(client);
  const resourceManager = new ResourceManager(client);
  const resourceHandlers = new ResourceHandlers(resourceManager);
  const promptHandlers = new PromptHandlers();
  const samplingHandlers = new SamplingHandlers(client);

  // Create MCP server with discovery support
  // The Server class automatically handles the initialize request
  // and responds with server info and capabilities
  const server = new Server(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
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

  // Register handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('Listing available tools');
    return {
      tools: toolDefinitions,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    logger.debug(`Tool call received: ${request.params.name}`);
    return toolHandlers.handleToolCall(request);
  });

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    logger.debug('Listing resources');
    return resourceHandlers.handleListResources(request);
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) => {
    logger.debug('Listing resource templates');
    return resourceHandlers.handleListResourceTemplates(request);
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    logger.debug(`Reading resource: ${request.params.uri}`);
    return resourceHandlers.handleReadResource(request);
  });

  // Register prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    logger.debug('Listing prompts');
    return promptHandlers.handleListPrompts(request);
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    logger.debug(`Getting prompt: ${request.params.name}`);
    return promptHandlers.handleGetPrompt(request);
  });

  // Register sampling handler
  server.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    logger.debug('Handling sampling request');
    return samplingHandlers.handleCreateMessage(request);
  });

  // Error handling
  server.onerror = (error) => {
    logger.error('Server error:', error);
  };

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start server
  const transport = new StdioServerTransport();
  logger.info(`Starting ${SERVER_INFO.name} v${SERVER_INFO.version}`);

  await server.connect(transport);
  logger.info('Server connected and ready');
}

// Run the server
main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
