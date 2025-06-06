#!/usr/bin/env node

/**
 * Debug script to understand why Mimi result isn't ranking high
 */

import { FastPatternMatcher } from '../dist/search/fast-patterns.js';
import { FileManager } from '../dist/storage/file-manager.js';
import { UnifiedSearchHandler } from '../dist/search/unified-search.js';

async function debugMimiSearch() {
  console.log('🔍 Debugging Mimi Search Issue\n');

  const fileManager = new FileManager({
    baseDir: './data',
    enableEmbeddings: true,
    enableMetadata: true,
  });

  // Load all lifelogs
  const lifelogs = await fileManager.loadAllLifelogs();
  console.log(`Total lifelogs: ${lifelogs.length}`);

  // Find the Mimi lifelog
  const mimiLog = lifelogs.find((l) => l.id === 'oz6MHf3hCkfSpkOYSVnZ');
  if (mimiLog) {
    console.log('\n✅ Found Mimi lifelog:');
    console.log(`ID: ${mimiLog.id}`);
    console.log(`Title: ${mimiLog.title}`);
    console.log(`Date: ${mimiLog.createdAt}`);
    console.log(`Content preview: ${mimiLog.content.slice(0, 200)}...`);
  } else {
    console.log('\n❌ Mimi lifelog not found!');
  }

  // Test fast pattern search
  console.log('\n=== Fast Pattern Search ===');
  const matcher = new FastPatternMatcher();
  await matcher.buildIndex(lifelogs);

  const queries = [
    'Mimi house',
    'kids go afternoon',
    'where did the kids go',
    'going to Mimi house',
    'oz6MHf3hCkfSpkOYSVnZ', // Try searching by ID
  ];

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    const results = matcher.search(query, { maxResults: 10 });

    // Find position of Mimi result
    const mimiPosition = results.findIndex((r) => r.lifelog.id === 'oz6MHf3hCkfSpkOYSVnZ');
    if (mimiPosition >= 0) {
      console.log(
        `✅ Mimi result found at position ${mimiPosition + 1} with score ${results[mimiPosition].score.toFixed(3)}`
      );
    } else {
      console.log('❌ Mimi result NOT in top 10');
    }
  }

  // Test unified search with debugging
  console.log('\n=== Unified Search (with debug info) ===');
  const searchHandler = new UnifiedSearchHandler(fileManager, {
    enableVectorStore: true,
    enableClaude: false,
  });
  await searchHandler.initialize();

  const result = await searchHandler.search('where did the kids go this afternoon', {
    strategy: 'parallel',
    limit: 50, // Get more results to see where Mimi ranks
  });

  if (result.results) {
    const mimiPosition = result.results.findIndex((r) => r.lifelog?.id === 'oz6MHf3hCkfSpkOYSVnZ');
    if (mimiPosition >= 0) {
      console.log(`✅ Mimi result found at position ${mimiPosition + 1}`);
      const mimiResult = result.results[mimiPosition];
      console.log(`Score: ${mimiResult.score.toFixed(3)}`);
      console.log(
        `Strategies: ${mimiResult.metadata?.strategies?.join(', ') || mimiResult.metadata?.source}`
      );
    } else {
      console.log('❌ Mimi result NOT in top 50 unified search results');
    }
  }
}

debugMimiSearch().catch(console.error);
