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
import { LimitlessClient } from './core/limitless-client.js';
import { EnhancedToolHandlers } from './tools/enhanced-handlers.js';
import { toolDefinitions } from './tools/definitions.js';
import { phase2Tools } from './tools/phase2-definitions.js';
import { ResourceManager } from './resources/manager.js';
import { ResourceHandlers } from './resources/handlers.js';
import { PromptHandlers } from './prompts/handlers.js';
import { SamplingHandlers } from './sampling/handlers.js';
import { logger } from './utils/logger.js';

// Server metadata
const SERVER_INFO = {
  name: 'limitless-ai-mcp-server',
  version: '0.2.0', // Phase 2 version
  description: 'MCP server for Limitless AI with intelligent search (Phase 2)',
};

// Environment variable names
const API_KEY_ENV = 'LIMITLESS_API_KEY';
const BASE_URL_ENV = 'LIMITLESS_BASE_URL';
const TIMEOUT_ENV = 'LIMITLESS_TIMEOUT';
const ENABLE_VECTOR_ENV = 'LIMITLESS_ENABLE_VECTOR';
const ENABLE_CLAUDE_ENV = 'LIMITLESS_ENABLE_CLAUDE';
const ENABLE_SYNC_ENV = 'LIMITLESS_ENABLE_SYNC';
const DATA_DIR_ENV = 'LIMITLESS_DATA_DIR';

async function main() {
  // Get configuration from environment
  const apiKey = process.env[API_KEY_ENV];

  // Check if we're in local-only mode (no API key but local data exists)
  const isLocalOnlyMode = !apiKey && process.env.LOCAL_ONLY_MODE === 'true';

  if (!apiKey && !isLocalOnlyMode) {
    logger.error(
      `Missing required environment variable: ${API_KEY_ENV}. To use local-only mode, set LOCAL_ONLY_MODE=true`
    );
    process.exit(1);
  }

  const baseUrl = process.env[BASE_URL_ENV];
  const timeout = process.env[TIMEOUT_ENV] ? parseInt(process.env[TIMEOUT_ENV], 10) : undefined;

  // Phase 2 configuration (always enabled now)
  // TEMPORARY: Hardcode vector store enablement due to MCP env var passing issue
  const enableVector = process.env[ENABLE_VECTOR_ENV] === 'true' || true; // Always enable for now
  const enableClaude = process.env[ENABLE_CLAUDE_ENV] === 'true';
  const enableSync = process.env[ENABLE_SYNC_ENV] === 'true' && !isLocalOnlyMode; // Disable sync in local-only mode
  const dataDir = process.env[DATA_DIR_ENV] || './data';

  // TEMPORARY: Force simple vector store mode
  // Always use LanceDB for vector store

  logger.info('Server configuration', {
    mode: isLocalOnlyMode ? 'local-only' : 'full',
    vectorStoreEnabled: enableVector,
    claudeEnabled: enableClaude,
    syncEnabled: enableSync,
    dataDir,
  });

  // Initialize client (empty API key is allowed for local-only mode)
  const client = new LimitlessClient({
    apiKey: apiKey || '',
    baseUrl,
    timeout,
  });

  // Initialize enhanced handlers with Phase 2 features
  const toolHandlers = new EnhancedToolHandlers(client, {
    enablePhase2: true,
    enableVectorStore: enableVector,
    enableClaude: enableClaude,
    enableSync: enableSync,
    dataDir,
  });

  // Initialize handlers
  await toolHandlers.initialize();

  // Combine all available tools
  const availableTools = [...toolDefinitions, ...phase2Tools];

  const resourceManager = new ResourceManager(client);
  const resourceHandlers = new ResourceHandlers(resourceManager);
  const promptHandlers = new PromptHandlers();
  const samplingHandlers = new SamplingHandlers(client);

  // Create MCP server with discovery support
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
    logger.debug('Listing available tools', { count: availableTools.length });
    return {
      tools: availableTools,
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

  // Cleanup handlers
  const cleanup = async () => {
    logger.info('Shutting down server...');
    await toolHandlers.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

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

  logger.info('Phase 2 features:', {
    vectorStore: enableVector,
    claude: enableClaude,
    sync: enableSync,
  });

  await server.connect(transport);
  logger.info('Server connected and ready');
}

// Run the server
main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
