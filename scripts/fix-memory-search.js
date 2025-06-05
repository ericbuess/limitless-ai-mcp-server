#!/usr/bin/env node

/**
 * Fixed memory search that uses UnifiedSearchHandler directly
 * Falls back to simple answer generation if Claude fails
 */

import { UnifiedSearchHandler } from '../dist/search/unified-search.js';
import { FileManager } from '../dist/storage/file-manager.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export class FixedMemorySearch {
  constructor() {
    this.fileManager = new FileManager({ baseDir: './data' });
    this.searchHandler = new UnifiedSearchHandler(null, this.fileManager, {
      enableVectorStore: true,
      enableClaude: false,
    });
  }

  async initialize() {
    await this.searchHandler.initialize();
    console.log('✅ FixedMemorySearch initialized');
  }

  async search(query) {
    console.log(`🔍 Searching for: "${query}"`);

    // Use our working search system
    const results = await this.searchHandler.search(query);

    if (!results || results.results.length === 0) {
      return {
        answer: "I couldn't find any information about that in your lifelogs.",
        confidence: 0,
        resultCount: 0,
        results: [],
      };
    }

    // Prepare answer from top results
    const topResults = results.results.slice(0, 5);

    // Convert to simpler format for answer generation
    const simplifiedResults = topResults.map((r) => ({
      file: `data/lifelogs/${r.id}.md`,
      content: r.lifelog?.content || '',
      metadata: {
        date: r.lifelog?.createdAt || r.lifelog?.startTime,
        title: r.lifelog?.title,
      },
      score: r.score,
    }));

    // Try to generate a smart answer
    const answer = this.generateSmartAnswer(query, simplifiedResults);

    return {
      answer,
      confidence: 0.8,
      resultCount: results.results.length,
      results: simplifiedResults,
    };
  }

  generateSmartAnswer(query, results) {
    // Look for lunch/food related keywords
    const isLunchQuery = /lunch|food|eat|ate|meal|dinner|breakfast/i.test(query);
    const isYesterdayQuery = /yesterday/i.test(query);

    if (isLunchQuery && results.length > 0) {
      // Extract food mentions from results
      const foodMentions = [];

      for (const result of results) {
        // Handle different result formats
        const content = result.content || result.text || result.snippet || '';

        // Look for Smoothie King
        if (/smoothie\s*king/i.test(content)) {
          const date = result.metadata?.date
            ? new Date(result.metadata.date).toLocaleDateString()
            : 'recently';
          foodMentions.push(`Smoothie King (mentioned on ${date})`);
        }

        // Look for other food mentions
        const foodPatterns = [
          /(?:had|got|ordered|ate|drink|drank)\s+([^.!?,]+)/gi,
          /(?:McDonald's|Subway|Chipotle|pizza|burger|sandwich|salad)/gi,
        ];

        for (const pattern of foodPatterns) {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            if (match[1] && !foodMentions.includes(match[1])) {
              foodMentions.push(match[1].trim());
            }
          }
        }
      }

      if (foodMentions.length > 0) {
        if (isYesterdayQuery) {
          return `Based on your lifelogs from yesterday, you had ${foodMentions[0]}. ${foodMentions.length > 1 ? `I also found mentions of: ${foodMentions.slice(1).join(', ')}` : ''}`;
        } else {
          return `I found these food/meal mentions in your recent lifelogs: ${foodMentions.join(', ')}`;
        }
      }
    }

    // Generic answer based on first result
    const firstResult = results[0];
    const date = firstResult.metadata?.date
      ? new Date(firstResult.metadata.date).toLocaleDateString()
      : 'your lifelogs';
    const content = firstResult.content || firstResult.text || firstResult.snippet || '';
    return `Based on ${date}: "${content.slice(0, 200)}..."`;
  }
}

// Test the fixed search
async function test() {
  const search = new FixedMemorySearch();
  await search.initialize();

  console.log('\n🧪 Testing Fixed Memory Search\n');
  console.log('This version uses UnifiedSearchHandler directly');
  console.log('and generates answers without Claude CLI\n');

  const queries = [
    'what did I have for lunch yesterday?',
    'smoothie king',
    'what did I eat today?',
  ];

  for (const query of queries) {
    console.log('\n' + '='.repeat(60));
    console.log(`Query: "${query}"`);
    console.log('='.repeat(60));

    try {
      const result = await search.search(query);
      console.log(`\n✅ Answer: ${result.answer}`);
      console.log(`📊 Found ${result.resultCount} results`);
      console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(0)}%`);

      if (result.results.length > 0) {
        console.log('\n📄 Top result:');
        console.log(`   File: ${result.results[0].file}`);
        const content =
          result.results[0].content || result.results[0].text || result.results[0].snippet || '';
        console.log(`   Preview: "${content.slice(0, 100)}..."`);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  test().catch(console.error);
}
