#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LimitlessClient } from './core/limitless-client';
import { ToolHandlers } from './tools/handlers';
import { toolDefinitions } from './tools/definitions';
import { logger } from './utils/logger';

// Server metadata
const SERVER_INFO = {
  name: 'limitless-ai-mcp-server',
  version: '1.0.0',
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

  // Create MCP server
  const server = new Server(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
    },
    {
      capabilities: {
        tools: {},
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

