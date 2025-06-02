import { toolDefinitions } from '../../src/tools/definitions';

describe('Tool Definitions', () => {
  it('should export 5 tool definitions', () => {
    expect(toolDefinitions).toHaveLength(5);
  });

  it('should have correct tool names', () => {
    const toolNames = toolDefinitions.map(tool => tool.name);
    expect(toolNames).toEqual([
      'limitless_get_lifelog_by_id',
      'limitless_list_lifelogs_by_date',
      'limitless_list_lifelogs_by_range',
      'limitless_list_recent_lifelogs',
      'limitless_search_lifelogs',
    ]);
  });

  describe('limitless_get_lifelog_by_id', () => {
    const tool = toolDefinitions[0];

    it('should have correct metadata', () => {
      expect(tool.name).toBe('limitless_get_lifelog_by_id');
      expect(tool.description).toContain('specific ID');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should have correct input schema', () => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('lifelog_id');
      expect(tool.inputSchema.properties).toHaveProperty('includeMarkdown');
      expect(tool.inputSchema.properties).toHaveProperty('includeHeadings');
      expect(tool.inputSchema.required).toEqual(['lifelog_id']);
    });
  });

  describe('limitless_list_lifelogs_by_date', () => {
    const tool = toolDefinitions[1];

    it('should have correct metadata', () => {
      expect(tool.name).toBe('limitless_list_lifelogs_by_date');
      expect(tool.description).toContain('specific date');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should have date property in schema', () => {
      const props = tool.inputSchema.properties as any;
      expect(props).toHaveProperty('date');
      expect(tool.inputSchema.required).toContain('date');
    });
  });

  describe('limitless_list_lifelogs_by_range', () => {
    const tool = toolDefinitions[2];

    it('should have correct metadata', () => {
      expect(tool.name).toBe('limitless_list_lifelogs_by_range');
      expect(tool.description).toContain('date/time range');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should require start and end dates', () => {
      expect(tool.inputSchema.required).toEqual(['start', 'end']);
    });
  });

  describe('limitless_list_recent_lifelogs', () => {
    const tool = toolDefinitions[3];

    it('should have correct metadata', () => {
      expect(tool.name).toBe('limitless_list_recent_lifelogs');
      expect(tool.description).toContain('most recent');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should have no required fields', () => {
      expect(tool.inputSchema.required).toBeUndefined();
    });
  });

  describe('limitless_search_lifelogs', () => {
    const tool = toolDefinitions[4];

    it('should have correct metadata', () => {
      expect(tool.name).toBe('limitless_search_lifelogs');
      expect(tool.description).toContain('keywords');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should require search_term', () => {
      expect(tool.inputSchema.required).toEqual(['search_term']);
    });

    it('should have fetch_limit property', () => {
      const props = tool.inputSchema.properties as any;
      expect(props).toHaveProperty('fetch_limit');
    });
  });

  describe('Common properties', () => {
    it('should have includeMarkdown and includeHeadings for tools that need them', () => {
      const toolsWithIncludeOptions = [
        'limitless_get_lifelog_by_id',
        'limitless_list_lifelogs_by_date',
        'limitless_list_lifelogs_by_range',
        'limitless_list_recent_lifelogs',
        'limitless_search_lifelogs',
      ];
      
      toolDefinitions.forEach(tool => {
        if (toolsWithIncludeOptions.includes(tool.name)) {
          const props = tool.inputSchema.properties as any;
          expect(props).toHaveProperty('includeMarkdown');
          expect(props).toHaveProperty('includeHeadings');
        }
      });
    });

    it('should have direction for list tools', () => {
      const toolsWithDirection = [
        'limitless_list_lifelogs_by_date',
        'limitless_list_lifelogs_by_range',
        'limitless_search_lifelogs',
      ];
      
      toolDefinitions.forEach(tool => {
        if (toolsWithDirection.includes(tool.name)) {
          const props = tool.inputSchema.properties as any;
          expect(props).toHaveProperty('direction');
        }
      });
    });

    it('should have limit for list tools', () => {
      const toolsWithLimit = [
        'limitless_list_lifelogs_by_date',
        'limitless_list_lifelogs_by_range',
        'limitless_list_recent_lifelogs',
        'limitless_search_lifelogs',
      ];
      
      toolDefinitions.forEach(tool => {
        if (toolsWithLimit.includes(tool.name)) {
          const props = tool.inputSchema.properties as any;
          expect(props).toHaveProperty('limit');
        }
      });
    });
  });
});