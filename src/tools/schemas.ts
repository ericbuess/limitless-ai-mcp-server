import { z } from 'zod';

// Common schemas
const includeOptionsSchema = z.object({
  includeMarkdown: z.boolean().default(true).describe('Include markdown content in the response.'),
  includeHeadings: z.boolean().default(true).describe('Include headings content in the response.'),
});

const paginationOptionsSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe(
      'Maximum number of lifelogs to return (Max: 100). Fetches in batches from the API if needed.'
    ),
  direction: z
    .enum(['asc', 'desc'])
    .optional()
    .describe("Sort order ('asc' for oldest first, 'desc' for newest first)."),
  timezone: z
    .string()
    .optional()
    .describe("IANA timezone for date/time parameters (defaults to server's local timezone)."),
});

// Tool schemas
export const getLifelogByIdSchema = z
  .object({
    lifelog_id: z.string().describe('The unique identifier of the lifelog to retrieve.'),
  })
  .merge(includeOptionsSchema);

export const listLifelogsByDateSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('The date to retrieve lifelogs for, in YYYY-MM-DD format.'),
  })
  .merge(includeOptionsSchema)
  .merge(paginationOptionsSchema);

export const listLifelogsByRangeSchema = z
  .object({
    start: z.string().describe('Start datetime filter (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS).'),
    end: z.string().describe('End datetime filter (YYYY-MM-DD or YYYY-MM-DD HH:mm:SS).'),
  })
  .merge(includeOptionsSchema)
  .merge(paginationOptionsSchema);

export const listRecentLifelogsSchema = z
  .object({
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .default(10)
      .describe('Number of recent lifelogs to retrieve (Max: 100). Defaults to 10.'),
    timezone: z
      .string()
      .optional()
      .describe("IANA timezone for date/time parameters (defaults to server's local timezone)."),
  })
  .merge(includeOptionsSchema);

export const searchLifelogsSchema = z
  .object({
    search_term: z.string().describe('The text to search for within lifelog titles and content.'),
    fetch_limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .default(20)
      .describe(
        'How many *recent* lifelogs to fetch from the API to search within (Default: 20, Max: 100). This defines the scope of the search, NOT the number of results returned.'
      ),
  })
  .merge(includeOptionsSchema)
  .merge(paginationOptionsSchema);

// Export types
export type GetLifelogByIdParams = z.infer<typeof getLifelogByIdSchema>;
export type ListLifelogsByDateParams = z.infer<typeof listLifelogsByDateSchema>;
export type ListLifelogsByRangeParams = z.infer<typeof listLifelogsByRangeSchema>;
export type ListRecentLifelogsParams = z.infer<typeof listRecentLifelogsSchema>;
export type SearchLifelogsParams = z.infer<typeof searchLifelogsSchema>;
