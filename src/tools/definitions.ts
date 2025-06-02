import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getLifelogByIdSchema,
  listLifelogsByDateSchema,
  listLifelogsByRangeSchema,
  listRecentLifelogsSchema,
  searchLifelogsSchema,
} from './schemas';

export const toolDefinitions: Tool[] = [
  {
    name: 'limitless_get_lifelog_by_id',
    description: 'Retrieves a single lifelog or Pendant recording by its specific ID.',
    inputSchema: {
      type: 'object',
      properties: getLifelogByIdSchema.shape,
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
      properties: listLifelogsByDateSchema.shape,
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
      properties: listLifelogsByRangeSchema.shape,
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
      properties: listRecentLifelogsSchema.shape,
      additionalProperties: false,
    } as const,
  },
  {
    name: 'limitless_search_lifelogs',
    description:
      "Performs a simple text search for specific keywords/phrases within the title and content of *recent* logs/Pendant recordings. Use ONLY for keywords, NOT for concepts like 'action items' or 'summaries'. Searches only recent logs (limited scope).",
    inputSchema: {
      type: 'object',
      properties: searchLifelogsSchema.shape,
      required: ['search_term'],
      additionalProperties: false,
    } as const,
  },
];
