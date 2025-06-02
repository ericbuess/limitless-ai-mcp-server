/**
 * Example: Advanced Search Patterns
 *
 * This example demonstrates complex search patterns and strategies
 * for finding specific information in your Limitless recordings.
 */

import { LimitlessClient } from '../src/core/limitless-client';
import { Lifelog } from '../src/types/limitless';

async function main() {
  // Initialize the client
  const client = new LimitlessClient({
    apiKey: process.env.LIMITLESS_API_KEY!,
    timeout: 120000,
  });

  try {
    // Strategy 1: Multi-keyword Search
    console.log('=== Strategy 1: Multi-keyword Search ===');
    const keywords = ['budget', 'planning', 'Q1'];
    const multiKeywordResults: Lifelog[] = [];

    for (const keyword of keywords) {
      const results = await client.searchLifelogs({
        searchTerm: keyword,
        fetchLimit: 50,
        limit: 10,
      });
      multiKeywordResults.push(...results);
    }

    // Deduplicate results
    const uniqueResults = Array.from(
      new Map(multiKeywordResults.map((log) => [log.id, log])).values()
    );
    console.log(`Found ${uniqueResults.length} unique recordings across all keywords`);

    // Strategy 2: Date-bounded Search
    console.log('\n=== Strategy 2: Date-bounded Search ===');
    // First get recordings from specific date range
    const dateRangeResults = await client.listLifelogsByRange({
      start: '2024-01-10',
      end: '2024-01-15',
      includeMarkdown: true,
    });

    // Then search within those results locally
    const searchTerm = 'milestone';
    const filteredResults = dateRangeResults.filter(
      (log) =>
        log.title?.toLowerCase().includes(searchTerm) ||
        log.markdown?.toLowerCase().includes(searchTerm)
    );
    console.log(`Found ${filteredResults.length} recordings about "${searchTerm}" in date range`);

    // Strategy 3: Contextual Search
    console.log('\n=== Strategy 3: Contextual Search ===');
    // Search for a main topic
    const mainTopic = 'product launch';
    const mainResults = await client.searchLifelogs({
      searchTerm: mainTopic,
      fetchLimit: 30,
      includeMarkdown: true,
    });

    // Extract related keywords from results
    const relatedKeywords = new Set<string>();
    mainResults.forEach((log) => {
      // Simple keyword extraction (in production, use NLP)
      const words = log.markdown?.toLowerCase().split(/\s+/) || [];
      words.forEach((word) => {
        if (word.length > 5 && !word.includes(mainTopic)) {
          relatedKeywords.add(word);
        }
      });
    });

    console.log(`Found ${relatedKeywords.size} related keywords`);
    console.log('Sample related keywords:', Array.from(relatedKeywords).slice(0, 10));

    // Strategy 4: Time-based Pattern Search
    console.log('\n=== Strategy 4: Time-based Pattern Search ===');
    // Look for weekly patterns (e.g., Monday meetings)
    const mondays = [];
    const today = new Date();

    // Get last 4 Mondays
    for (let i = 0; i < 4; i++) {
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - i * 7);
      mondays.push(monday.toISOString().split('T')[0]);
    }

    console.log('Checking Monday patterns:');
    for (const monday of mondays) {
      const logs = await client.listLifelogsByDate(monday);
      console.log(`  ${monday}: ${logs.length} recordings`);
    }

    // Strategy 5: Phrase and Proximity Search
    console.log('\n=== Strategy 5: Phrase Search ===');
    // Search for exact phrases
    const phrases = ['next steps', 'action item', 'follow up', 'by end of'];

    const phraseResults: { phrase: string; count: number; logs: Lifelog[] }[] = [];

    for (const phrase of phrases) {
      const results = await client.searchLifelogs({
        searchTerm: phrase,
        fetchLimit: 100,
        limit: 20,
      });
      phraseResults.push({
        phrase,
        count: results.length,
        logs: results,
      });
    }

    console.log('Phrase search results:');
    phraseResults.forEach(({ phrase, count }) => {
      console.log(`  "${phrase}": ${count} occurrences`);
    });

    // Strategy 6: Negative Search (Exclusion)
    console.log('\n=== Strategy 6: Exclusion Search ===');
    // Get all recent logs
    const allRecent = await client.listRecentLifelogs({
      limit: 50,
      includeMarkdown: true,
    });

    // Filter out certain topics
    const excludeTerms = ['personal', 'private', 'confidential'];
    const publicLogs = allRecent.filter((log) => {
      const content = (log.title + ' ' + log.markdown).toLowerCase();
      return !excludeTerms.some((term) => content.includes(term));
    });

    console.log(`Total logs: ${allRecent.length}`);
    console.log(`Public logs (excluding private terms): ${publicLogs.length}`);

    // Strategy 7: Smart Search with Ranking
    console.log('\n=== Strategy 7: Relevance Ranking ===');
    const searchQuery = 'project deadline';
    const searchWords = searchQuery.split(' ');

    const rankedResults = await client.searchLifelogs({
      searchTerm: searchQuery,
      fetchLimit: 50,
      includeMarkdown: true,
    });

    // Score results based on relevance
    const scoredResults = rankedResults.map((log) => {
      let score = 0;
      const content = (log.title + ' ' + log.markdown).toLowerCase();

      // Exact phrase match
      if (content.includes(searchQuery)) score += 10;

      // Individual word matches
      searchWords.forEach((word) => {
        const matches = (content.match(new RegExp(word, 'gi')) || []).length;
        score += matches * 2;
      });

      // Title matches weighted higher
      if (log.title?.toLowerCase().includes(searchQuery)) score += 20;

      return { log, score };
    });

    // Sort by score
    scoredResults.sort((a, b) => b.score - a.score);

    console.log('Top 5 most relevant results:');
    scoredResults.slice(0, 5).forEach(({ log, score }, index) => {
      console.log(`  ${index + 1}. ${log.title} (score: ${score})`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
main().catch(console.error);
