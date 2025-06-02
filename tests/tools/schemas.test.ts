import {
  getLifelogByIdSchema,
  listLifelogsByDateSchema,
  listLifelogsByRangeSchema,
  listRecentLifelogsSchema,
  searchLifelogsSchema,
} from '../../src/tools/schemas';

describe('Tool Schemas', () => {
  describe('getLifelogByIdSchema', () => {
    it('should validate correct input', () => {
      const input = {
        lifelog_id: 'test-123',
        includeMarkdown: true,
        includeHeadings: false,
      };

      const result = getLifelogByIdSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it('should require lifelog_id', () => {
      const input = {
        includeMarkdown: true,
      };

      const result = getLifelogByIdSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should use default values for optional fields', () => {
      const input = {
        lifelog_id: 'test-123',
      };

      const result = getLifelogByIdSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includeMarkdown).toBe(true);
        expect(result.data.includeHeadings).toBe(true);
      }
    });
  });

  describe('listLifelogsByDateSchema', () => {
    it('should validate correct date format', () => {
      const input = {
        date: '2024-01-15',
        limit: 50,
        direction: 'asc' as const,
        timezone: 'America/New_York',
      };

      const result = listLifelogsByDateSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const input = {
        date: '01-15-2024', // Wrong format
      };

      const result = listLifelogsByDateSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should enforce limit constraints', () => {
      const input = {
        date: '2024-01-15',
        limit: 150, // Over max
      };

      const result = listLifelogsByDateSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate direction enum', () => {
      const validInput = {
        date: '2024-01-15',
        direction: 'desc' as const,
      };

      const result = listLifelogsByDateSchema.safeParse(validInput);
      expect(result.success).toBe(true);

      const invalidInput = {
        date: '2024-01-15',
        direction: 'invalid',
      };

      const invalidResult = listLifelogsByDateSchema.safeParse(invalidInput);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('listLifelogsByRangeSchema', () => {
    it('should validate date range', () => {
      const input = {
        start: '2024-01-10',
        end: '2024-01-15',
        limit: 30,
      };

      const result = listLifelogsByRangeSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require both start and end', () => {
      const inputMissingEnd = {
        start: '2024-01-10',
      };

      const result1 = listLifelogsByRangeSchema.safeParse(inputMissingEnd);
      expect(result1.success).toBe(false);

      const inputMissingStart = {
        end: '2024-01-15',
      };

      const result2 = listLifelogsByRangeSchema.safeParse(inputMissingStart);
      expect(result2.success).toBe(false);
    });
  });

  describe('listRecentLifelogsSchema', () => {
    it('should validate with defaults', () => {
      const input = {};

      const result = listRecentLifelogsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.includeMarkdown).toBe(true);
        expect(result.data.includeHeadings).toBe(true);
      }
    });

    it('should accept all optional parameters', () => {
      const input = {
        limit: 25,
        timezone: 'UTC',
        includeMarkdown: true,
        includeHeadings: true,
      };

      const result = listRecentLifelogsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });
  });

  describe('searchLifelogsSchema', () => {
    it('should validate search parameters', () => {
      const input = {
        search_term: 'meeting',
        fetch_limit: 50,
        limit: 10,
        direction: 'desc' as const,
      };

      const result = searchLifelogsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require search_term', () => {
      const input = {
        fetch_limit: 50,
      };

      const result = searchLifelogsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should use correct defaults', () => {
      const input = {
        search_term: 'project',
      };

      const result = searchLifelogsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fetch_limit).toBe(20);
        expect(result.data.includeMarkdown).toBe(true);
        expect(result.data.includeHeadings).toBe(true);
      }
    });

    it('should validate fetch_limit range', () => {
      const input = {
        search_term: 'test',
        fetch_limit: 200, // Over max
      };

      const result = searchLifelogsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
