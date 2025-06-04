#!/usr/bin/env node

/**
 * Example: Using Phase 2 Intelligent Search Features
 *
 * This example demonstrates the advanced search capabilities introduced in Phase 2,
 * including semantic search, Claude-powered analysis, and intelligent query routing.
 *
 * Prerequisites:
 * - Set LIMITLESS_API_KEY environment variable
 * - Enable Phase 2 features: LIMITLESS_ENABLE_PHASE2=true
 * - Optional: ChromaDB running on localhost:8000 for vector search
 * - Optional: Claude CLI installed and authenticated for advanced analysis
 */

import { LimitlessClient } from '../src/core/limitless-client.js';
import { FileManager } from '../src/storage/file-manager.js';
import { UnifiedSearchHandler } from '../src/search/unified-search.js';
import { SyncService } from '../src/vector-store/sync-service.js';
import { ChromaVectorStore } from '../src/vector-store/chroma-manager.js';

async function main() {
  // Check for API key
  const apiKey = process.env.LIMITLESS_API_KEY;
  if (!apiKey) {
    console.error('Please set LIMITLESS_API_KEY environment variable');
    process.exit(1);
  }

  // Initialize components
  const client = new LimitlessClient({ apiKey });
  const fileManager = new FileManager({
    baseDir: './data',
    enableEmbeddings: true,
    enableMetadata: true,
  });

  const searchHandler = new UnifiedSearchHandler(client, fileManager, {
    enableVectorStore: true,
    enableClaude: true,
  });

  console.log('🚀 Phase 2 Search Examples\n');

  try {
    // Initialize the search handler
    await searchHandler.initialize();

    // Example 1: Automatic strategy selection
    console.log('1️⃣ Automatic Strategy Selection');
    console.log('Query: "meeting yesterday"');

    const autoResult = await searchHandler.search('meeting yesterday', {
      strategy: 'auto',
      limit: 5,
    });

    console.log(`Strategy used: ${autoResult.strategy}`);
    console.log(`Response time: ${autoResult.performance.totalTime}ms`);
    console.log(`Results found: ${autoResult.results.length}\n`);

    // Example 2: Semantic search
    console.log('2️⃣ Semantic Search');
    console.log('Query: "discussions about product roadmap"');

    const semanticResult = await searchHandler.search('discussions about product roadmap', {
      strategy: 'vector',
      limit: 5,
      scoreThreshold: 0.7,
    });

    console.log(`Similar content found: ${semanticResult.results.length}`);
    semanticResult.results.slice(0, 3).forEach((result, index) => {
      console.log(`  ${index + 1}. Score: ${result.score.toFixed(3)} - ID: ${result.id}`);
    });
    console.log();

    // Example 3: Fast pattern search
    console.log('3️⃣ Fast Pattern Search');
    console.log('Query: "action item"');

    const fastResult = await searchHandler.search('action item', {
      strategy: 'fast',
      limit: 10,
    });

    console.log(`Response time: ${fastResult.performance.totalTime}ms`);
    console.log(`Matches found: ${fastResult.results.length}`);

    if (fastResult.results[0]?.highlights) {
      console.log('Sample highlight:', fastResult.results[0].highlights[0]);
    }
    console.log();

    // Example 4: Hybrid search
    console.log('4️⃣ Hybrid Search (Fast + Vector)');
    console.log('Query: "budget planning"');

    const hybridResult = await searchHandler.search('budget planning', {
      strategy: 'hybrid',
      limit: 10,
    });

    console.log(`Combined results: ${hybridResult.results.length}`);
    console.log(`Response time: ${hybridResult.performance.totalTime}ms\n`);

    // Example 5: Claude-powered analysis (if available)
    if (process.env.LIMITLESS_ENABLE_CLAUDE === 'true') {
      console.log('5️⃣ Claude-Powered Analysis');
      console.log('Query: "What were the main decisions made this week?"');

      const claudeResult = await searchHandler.search(
        'What were the main decisions made this week?',
        {
          strategy: 'claude',
          limit: 20,
        }
      );

      if (claudeResult.insights) {
        console.log('Insights:', claudeResult.insights);
      }

      if (claudeResult.actionItems && claudeResult.actionItems.length > 0) {
        console.log('\nAction Items:');
        claudeResult.actionItems.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item}`);
        });
      }
    }

    // Example 6: Performance comparison
    console.log('\n6️⃣ Performance Comparison');
    const testQuery = 'project status';

    const strategies = ['fast', 'vector', 'hybrid'] as const;
    const timings: Record<string, number> = {};

    for (const strategy of strategies) {
      const result = await searchHandler.search(testQuery, {
        strategy,
        limit: 10,
        enableCache: false, // Disable cache for fair comparison
      });
      timings[strategy] = result.performance.searchTime;
    }

    console.log('Search times by strategy:');
    Object.entries(timings).forEach(([strategy, time]) => {
      console.log(`  ${strategy}: ${time}ms`);
    });

    // Get performance statistics
    const stats = searchHandler.getPerformanceStats();
    console.log('\n📊 Performance Statistics:');
    console.log('Cache stats:', stats.cacheStats);
    console.log('Query router stats:', stats.queryRouterStats);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    await searchHandler.stop();
  }
}

// Sync service example
async function syncExample() {
  console.log('\n🔄 Sync Service Example\n');

  const apiKey = process.env.LIMITLESS_API_KEY!;
  const client = new LimitlessClient({ apiKey });

  const fileManager = new FileManager({
    baseDir: './data',
    enableEmbeddings: true,
    enableMetadata: true,
  });

  const vectorStore = new ChromaVectorStore({
    collectionName: 'limitless-lifelogs',
    persistPath: 'http://localhost:8000',
  });

  const syncService = new SyncService(client, fileManager, vectorStore, {
    pollInterval: 60000, // 1 minute
    enableVectorStore: true,
    enableFileStorage: true,
  });

  try {
    // Start sync service
    await syncService.start();
    console.log('Sync service started');

    // Check status
    const status = syncService.getStatus();
    console.log('Sync status:', status);

    // Wait a bit to see it in action
    console.log('\nWaiting 10 seconds to demonstrate sync...');
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Check status again
    const newStatus = syncService.getStatus();
    console.log('Updated sync status:', newStatus);
  } finally {
    // Stop sync service
    await syncService.stop();
    console.log('\nSync service stopped');
  }
}

// Run examples
(async () => {
  await main();

  // Uncomment to run sync example
  // await syncExample();
})();
