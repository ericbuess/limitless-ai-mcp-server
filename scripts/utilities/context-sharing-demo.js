#!/usr/bin/env node

// Removed LimitlessClient import - search is always local
import { FileManager } from '../../dist/storage/file-manager.js';
import { UnifiedSearchHandler } from '../../dist/search/unified-search.js';
import { logger } from '../../dist/utils/logger.js';

// Get query from command line
const query = process.argv[2] || 'chess game';

async function testContextSharing() {
  try {
    console.log('\n🔍 Testing Parallel Search with Context Sharing\n');
    console.log(`Query: "${query}"\n`);

    // Initialize components - search is always local, no API needed
    const fileManager = new FileManager({ basePath: './data/lifelogs' });

    // Pass null for client since search should never use API
    const searchHandler = new UnifiedSearchHandler(fileManager, {
      enableVectorStore: true,
    });

    await searchHandler.initialize();

    // Run search with parallel execution
    console.log('=== Executing Parallel Search with Inter-Strategy Communication ===\n');

    const result = await searchHandler.search(query, {
      limit: 10,
      enableCache: false,
    });

    // Display results
    console.log(`Found ${result.results.length} results in ${result.performance.totalTime}ms\n`);

    // Show strategy timings
    if (result.strategyTimings) {
      console.log('Strategy Execution Times:');
      for (const [name, time] of Object.entries(result.strategyTimings)) {
        console.log(`  ${name}: ${time}ms`);
      }
      console.log('');
    }

    // Show context insights if available
    if (result.searchContext) {
      console.log('Context Sharing Insights:');
      console.log(`  Hot documents discovered: ${result.searchContext.hotDocumentIds.size}`);
      console.log(`  Dates discovered: ${result.searchContext.discoveredDates.size}`);
      console.log(`  Keywords extracted: ${result.searchContext.relevantKeywords.size}`);

      if (result.searchContext.discoveredDates.size > 0) {
        console.log(
          `  Discovered dates: ${Array.from(result.searchContext.discoveredDates).join(', ')}`
        );
      }
      if (result.searchContext.relevantKeywords.size > 0) {
        console.log(
          `  Relevant keywords: ${Array.from(result.searchContext.relevantKeywords).slice(0, 5).join(', ')}`
        );
      }
      console.log('');
    }

    // Show top results with metadata
    console.log('=== Top Results ===');
    result.results.slice(0, 5).forEach((res, i) => {
      console.log(`\n${i + 1}. Score: ${res.score.toFixed(3)}`);
      console.log(`   ID: ${res.id}`);

      if (res.metadata) {
        if (res.metadata.matchingSources) {
          console.log(`   Found by strategies: ${res.metadata.matchingSources.join(', ')}`);
        }
        if (res.metadata.isHotDocument) {
          console.log(`   🔥 Hot document (high-value)`);
        }
        if (res.metadata.consensusScore) {
          console.log(`   Consensus score: ${(res.metadata.consensusScore * 100).toFixed(0)}%`);
        }
      }

      if (res.highlights?.length > 0) {
        console.log(`   Highlight: "${res.highlights[0].substring(0, 100)}..."`);
      }
    });

    // Show documents found by multiple strategies
    console.log('\n=== Consensus Documents ===');
    const consensusDocs = result.results.filter((r) => r.metadata?.matchingSources?.length > 1);

    if (consensusDocs.length > 0) {
      console.log(`${consensusDocs.length} documents found by multiple strategies:`);
      consensusDocs.slice(0, 3).forEach((doc) => {
        console.log(`  - ${doc.id}: found by ${doc.metadata.matchingSources.join(' + ')}`);
      });
    } else {
      console.log('No consensus documents found');
    }

    // Stop the handler
    await searchHandler.stop();
  } catch (error) {
    console.error('Test failed:', error);
    logger.error('Test error', { error });
    process.exit(1);
  }
}

testContextSharing()
  .then(() => {
    console.log('\n✅ Context sharing test completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
