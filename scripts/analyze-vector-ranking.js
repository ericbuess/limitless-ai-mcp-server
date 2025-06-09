#!/usr/bin/env node

import { LanceDBStore } from '../dist/vector-store/lancedb-store.js';
import { logger } from '../dist/utils/logger.js';

async function analyzeVectorRanking() {
  console.log('🔍 Analyzing Vector Search Ranking\n');

  const store = new LanceDBStore({
    collectionName: 'limitless-lifelogs',
    persistPath: './data/lancedb',
  });

  await store.initialize();

  // Test queries
  const queries = [
    'lunch today who ate what',
    'Eric Smoothie King lunch',
    'Chick-fil-A lunch today',
    'what did I eat for lunch',
    'family different restaurants lunch',
  ];

  const targetId = 'K9G2oUoUqVqj3XmRAwvN'; // The file with the answer

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    console.log('─'.repeat(50));

    const results = await store.searchByText(query, {
      topK: 20,
      includeContent: false,
      includeMetadata: true,
    });

    // Find target document position
    const targetPosition = results.findIndex((r) => r.id === targetId);

    if (targetPosition >= 0) {
      const targetResult = results[targetPosition];
      console.log(`✅ Target document found at position: ${targetPosition + 1}`);
      console.log(`   Score: ${targetResult.score.toFixed(4)}`);
      console.log(`   Title: ${targetResult.metadata?.title || 'Unknown'}`);

      // Show top 3 for comparison
      console.log('\n   Top 3 results:');
      results.slice(0, 3).forEach((r, i) => {
        console.log(
          `   ${i + 1}. Score: ${r.score.toFixed(4)} - ${r.metadata?.title || 'Unknown'}`
        );
      });
    } else {
      console.log(`❌ Target document NOT in top 20 results`);

      // Show what did rank highly
      console.log('\n   Top 3 results instead:');
      results.slice(0, 3).forEach((r, i) => {
        console.log(
          `   ${i + 1}. Score: ${r.score.toFixed(4)} - ${r.metadata?.title || 'Unknown'}`
        );
      });
    }
  }

  // Now test with the actual content to see what the embeddings look like
  console.log('\n\n📊 Direct Content Analysis');
  console.log('═'.repeat(50));

  const testContent = `Take me to Smoothie King in Waco, Texas. 
  We stopped at Chick-fil-A. We thought about getting it to go, but then I just didn't really feel like I wanted to try to eat and drive, so we just ended up going in. The girls needed to go to the bathroom anyway.
  You're going to dip your nuggets in there? Okay, dip your nuggets in there.`;

  console.log('Test content includes:');
  console.log('- "Take me to Smoothie King"');
  console.log('- "We stopped at Chick-fil-A"');
  console.log('- "dip your nuggets"');

  const directResults = await store.searchByText(testContent, {
    topK: 5,
    includeContent: false,
    includeMetadata: true,
  });

  console.log('\nDirect content search results:');
  directResults.forEach((r, i) => {
    console.log(`${i + 1}. Score: ${r.score.toFixed(4)} - ID: ${r.id}`);
    console.log(`   Title: ${r.metadata?.title || 'Unknown'}`);
  });

  await store.close();
}

analyzeVectorRanking().catch(console.error);
