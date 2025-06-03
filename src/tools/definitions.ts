import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const toolDefinitions: Tool[] = [
  {
    name: 'limitless_get_lifelog_by_id',
    description: 'Retrieves a single lifelog or Pendant recording by its specific ID.',
    inputSchema: {
      type: 'object',
      properties: {
        lifelog_id: {
          type: 'string',
          description: 'The unique identifier of the lifelog to retrieve.',
        },
        includeMarkdown: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include markdown content in the response.',
        },
        includeHeadings: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include headings content in the response.',
        },
      },
      required: ['lifelog_id'],
      additionalProperties: false,
    } as const,
  },
  {
    name: 'limitless_list_lifelogs_by_date',
    description:
      'Lists logs/recordings for a specific date. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'The date to retrieve lifelogs for, in YYYY-MM-DD format.',
        },
        limit: {
          type: ['number', 'string'],
          minimum: 1,
          maximum: 100,
          description:
            'Maximum number of lifelogs to return (Max: 100). Fetches in batches from the API if needed.',
        },
        direction: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: "Sort order ('asc' for oldest first, 'desc' for newest first).",
        },
        timezone: {
          type: 'string',
          description:
            "IANA timezone for date/time parameters (defaults to server's local timezone).",
        },
        includeMarkdown: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include markdown content in the response.',
        },
        includeHeadings: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include headings content in the response.',
        },
      },
      required: ['date'],
      additionalProperties: false,
    } as const,
  },
  {
    name: 'limitless_list_lifelogs_by_range',
    description:
      'Lists logs/recordings within a date/time range. Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          description: 'Start datetime filter (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS).',
        },
        end: {
          type: 'string',
          description: 'End datetime filter (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS).',
        },
        limit: {
          type: ['number', 'string'],
          minimum: 1,
          maximum: 100,
          description:
            'Maximum number of lifelogs to return (Max: 100). Fetches in batches from the API if needed.',
        },
        direction: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: "Sort order ('asc' for oldest first, 'desc' for newest first).",
        },
        timezone: {
          type: 'string',
          description:
            "IANA timezone for date/time parameters (defaults to server's local timezone).",
        },
        includeMarkdown: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include markdown content in the response.',
        },
        includeHeadings: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include headings content in the response.',
        },
      },
      required: ['start', 'end'],
      additionalProperties: false,
    } as const,
  },
  {
    name: 'limitless_list_recent_lifelogs',
    description:
      'Lists the most recent logs/recordings (sorted newest first). Best for getting raw log data which you can then analyze for summaries, action items, topics, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: ['number', 'string'],
          default: 10,
          minimum: 1,
          maximum: 100,
          description: 'Number of recent lifelogs to retrieve (Max: 100). Defaults to 10.',
        },
        timezone: {
          type: 'string',
          description:
            "IANA timezone for date/time parameters (defaults to server's local timezone).",
        },
        includeMarkdown: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include markdown content in the response.',
        },
        includeHeadings: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include headings content in the response.',
        },
      },
      additionalProperties: false,
    } as const,
  },
  {
    name: 'limitless_search_lifelogs',
    description:
      "Performs a simple text search for specific keywords/phrases within the title and content of *recent* logs/Pendant recordings. Use ONLY for keywords, NOT for concepts like 'action items' or 'summaries'. Searches only recent logs (limited scope).",
    inputSchema: {
      type: 'object',
      properties: {
        search_term: {
          type: 'string',
          description: 'The text to search for within lifelog titles and content.',
        },
        fetch_limit: {
          type: ['number', 'string'],
          default: 20,
          minimum: 1,
          maximum: 100,
          description:
            'How many *recent* lifelogs to fetch from the API to search within (Default: 20, Max: 100). This defines the scope of the search, NOT the number of results returned.',
        },
        limit: {
          type: ['number', 'string'],
          minimum: 1,
          maximum: 100,
          description:
            'Maximum number of lifelogs to return (Max: 100). Fetches in batches from the API if needed.',
        },
        direction: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: "Sort order ('asc' for oldest first, 'desc' for newest first).",
        },
        timezone: {
          type: 'string',
          description:
            "IANA timezone for date/time parameters (defaults to server's local timezone).",
        },
        includeMarkdown: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include markdown content in the response.',
        },
        includeHeadings: {
          type: ['boolean', 'string'],
          default: true,
          description: 'Include headings content in the response.',
        },
      },
      required: ['search_term'],
      additionalProperties: false,
    } as const,
  },
];
