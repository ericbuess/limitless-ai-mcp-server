import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const phase2Tools: Tool[] = [
  {
    name: 'limitless_advanced_search',
    description: 'Advanced search with intelligent query routing and multiple strategies',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        strategy: {
          type: 'string',
          enum: ['auto', 'fast', 'vector', 'hybrid', 'claude'],
          default: 'auto',
          description:
            'Search strategy to use. Auto selects the best strategy based on query analysis',
        },
        limit: {
          type: 'number',
          default: 20,
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of results to return',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'limitless_semantic_search',
    description: 'Search using semantic similarity with vector embeddings',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query for semantic matching',
        },
        limit: {
          type: 'number',
          default: 20,
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of results to return',
        },
        threshold: {
          type: 'number',
          default: 0.7,
          minimum: 0,
          maximum: 1,
          description: 'Minimum similarity threshold (0-1)',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'limitless_analyze_lifelogs',
    description: 'Analyze lifelogs using Claude for insights, summaries, and action items',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The analysis query or topic',
        },
        analysisType: {
          type: 'string',
          enum: ['summary', 'action-items', 'topics', 'trends', 'insights'],
          default: 'summary',
          description: 'Type of analysis to perform',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'limitless_sync_status',
    description: 'Get the status of the background sync service',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'limitless_bulk_sync',
    description: 'Manually trigger a bulk sync of historical lifelogs',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          default: 365,
          minimum: 1,
          maximum: 730,
          description: 'Number of days of history to sync',
        },
        clearExisting: {
          type: 'boolean',
          default: false,
          description: 'Clear existing data before syncing',
        },
      },
      additionalProperties: false,
    },
  },
];

export const phase2ToolDescriptions = {
  limitless_advanced_search: `
Advanced search capabilities with intelligent query routing:
- Automatically classifies queries and selects optimal search strategy
- Supports fast pattern matching (<100ms), semantic search, and Claude-powered analysis
- Learns from usage patterns to improve performance over time
- Returns rich results with highlights, insights, and action items

Strategies:
- auto: Intelligent routing based on query analysis
- fast: Pattern matching for simple keywords and dates
- vector: Semantic similarity search using embeddings
- hybrid: Combines fast and vector search
- claude: Complex analytical queries using Claude CLI
`,

  limitless_semantic_search: `
Semantic search using vector embeddings:
- Finds conceptually similar content, not just keyword matches
- Uses local embeddings for privacy and speed
- Configurable similarity threshold
- Ideal for finding related discussions or themes
`,

  limitless_analyze_lifelogs: `
AI-powered analysis of lifelogs:
- summary: Comprehensive summary of selected lifelogs
- action-items: Extract all tasks and commitments
- topics: Identify main discussion topics
- trends: Analyze patterns over time
- insights: Generate insights and recommendations
`,

  limitless_sync_status: `
Monitor the background sync service:
- Shows sync status and last sync time
- Reports total synced lifelogs
- Displays any sync errors
- Useful for troubleshooting
`,

  limitless_bulk_sync: `
Manually trigger bulk sync of historical data:
- Downloads all lifelogs for specified number of days
- Processes in parallel batches for speed
- Shows progress as batches complete
- Optionally clears existing data first
- Use this to populate local database initially
`,
};
