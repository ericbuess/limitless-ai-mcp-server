import { getPromptContent } from '../../src/prompts/templates';

describe('Prompt Templates', () => {
  describe('getPromptContent', () => {
    it('should throw error for unknown template', () => {
      expect(() => getPromptContent('unknown-template', {})).toThrow(
        'Unknown prompt template: unknown-template'
      );
    });

    it('should return content for daily-summary', () => {
      const content = getPromptContent('daily-summary', { date: '2024-01-15' });
      expect(content).toHaveLength(1);
      expect(content[0].content.text).toContain('2024-01-15');
      expect(content[0].content.text).toContain('limitless_list_lifelogs_by_date');
    });

    it('should return content for action-items', () => {
      const content = getPromptContent('action-items', { date: 'recent' });
      expect(content).toHaveLength(1);
      expect(content[0].content.text).toContain('recent recordings');
      expect(content[0].content.text).toContain('appropriate limitless tool');
    });

    it('should return content for key-topics', () => {
      const content = getPromptContent('key-topics', { date: '2024-01-15' });
      expect(content).toHaveLength(1);
      expect(content[0].content.text).toContain('main topics');
      expect(content[0].content.text).toContain('2024-01-15');
      expect(content[0].content.text).toContain('appropriate limitless tool');
    });

    it('should return content for meeting-notes', () => {
      const content = getPromptContent('meeting-notes', { date: '2024-01-15' });
      expect(content).toHaveLength(2);
      expect(content[0].content.text).toContain('2024-01-15');
      expect(content[1].content.text).toContain('Meeting Notes');
    });

    it('should return content for search-insights', () => {
      const content = getPromptContent('search-insights', { searchTerm: 'test', limit: '10' });
      expect(content).toHaveLength(1);
      expect(content[0].content.text).toContain('test');
      expect(content[0].content.text).toContain('limit: 10');
      expect(content[0].content.text).toContain('limitless_search_lifelogs');
    });
  });
});
