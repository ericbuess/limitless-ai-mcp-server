#!/usr/bin/env node

// Removed LimitlessClient import - search is always local
import { FileManager } from '../../dist/storage/file-manager.js';
import { UnifiedSearchHandler } from '../../dist/search/unified-search.js';
import { logger } from '../../dist/utils/logger.js';

// Get query from command line
const query = process.argv[2];
if (!query) {
  console.error('Usage: node test-parallel-search.js "your search query"');
  process.exit(1);
}

async function testParallelSearch() {
  try {
    console.log('\n🔍 Testing Parallel Search System\n');
    console.log(`Query: "${query}"\n`);

    // Initialize components - search is always local, no API needed
    const fileManager = new FileManager({ basePath: './data/lifelogs' });

    // Pass null for client since search should never use API
    const searchHandler = new UnifiedSearchHandler(fileManager, {
      enableVectorStore: true,
      enableClaude: false, // Disable Claude for this test
    });

    await searchHandler.initialize();

    // Test 1: Sequential strategies (old approach)
    console.log('=== Sequential Search (Old Approach) ===');
    const strategies = ['fast', 'vector'];
    const sequentialStart = Date.now();
    const sequentialResults = [];

    for (const strategy of strategies) {
      const start = Date.now();
      const result = await searchHandler.search(query, {
        strategy,
        limit: 5,
        enableCache: false, // Disable cache for fair comparison
      });
      const time = Date.now() - start;

      console.log(`${strategy}: ${result.results.length} results in ${time}ms`);
      sequentialResults.push({ strategy, time, results: result.results });
    }

    const sequentialTotal = Date.now() - sequentialStart;
    console.log(`Total sequential time: ${sequentialTotal}ms\n`);

    // Test 2: Parallel search (new approach)
    console.log('=== Parallel Search (New Approach) ===');
    const parallelStart = Date.now();

    const parallelResult = await searchHandler.search(query, {
      strategy: 'parallel',
      limit: 5,
      enableCache: false,
    });

    const parallelTime = Date.now() - parallelStart;
    console.log(`Parallel: ${parallelResult.results.length} results in ${parallelTime}ms`);

    // Show timing breakdown if available
    if (parallelResult.strategyTimings) {
      console.log('\nStrategy Timings:');
      for (const [name, time] of Object.entries(parallelResult.strategyTimings)) {
        console.log(`  ${name}: ${time}ms`);
      }
    }

    if (parallelResult.failedStrategies?.length > 0) {
      console.log(`\nFailed strategies: ${parallelResult.failedStrategies.join(', ')}`);
    }

    // Performance comparison
    console.log('\n=== Performance Comparison ===');
    const speedup = (sequentialTotal / parallelTime).toFixed(2);
    console.log(`Sequential: ${sequentialTotal}ms`);
    console.log(`Parallel: ${parallelTime}ms`);
    console.log(`Speedup: ${speedup}x faster\n`);

    // Show top results
    console.log('=== Top Results ===');
    parallelResult.results.slice(0, 3).forEach((result, i) => {
      console.log(`\n${i + 1}. Score: ${result.score.toFixed(3)}`);
      console.log(`   ID: ${result.id}`);
      if (result.metadata?.matchingSources) {
        console.log(`   Sources: ${result.metadata.matchingSources.join(', ')}`);
      }
      if (result.highlights?.length > 0) {
        console.log(`   Highlight: "${result.highlights[0]}"`);
      }
    });

    // Stop the handler
    await searchHandler.stop();
  } catch (error) {
    console.error('Test failed:', error);
    logger.error('Test error', { error });
    process.exit(1);
  }
}

testParallelSearch()
  .then(() => {
    console.log('\n✅ Parallel search test completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
