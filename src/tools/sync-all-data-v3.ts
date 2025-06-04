#!/usr/bin/env node

/**
 * Interactive tool to sync all Limitless data to local storage
 *
 * This tool downloads ALL lifelogs from the API and saves them locally.
 * Once downloaded, data is never fetched from the API again.
 */

import { LimitlessClient } from '../core/limitless-client.js';
import { FileManager } from '../storage/file-manager.js';
import { SyncServiceV3 } from '../vector-store/sync-service-v3.js';
import * as readline from 'readline';

// Check for API key
const apiKey = process.env.LIMITLESS_API_KEY;
if (!apiKey) {
  console.error('❌ Error: LIMITLESS_API_KEY environment variable is required');
  console.error('\nUsage:');
  console.error('  export LIMITLESS_API_KEY="your-api-key"');
  console.error('  npm run sync:all');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const downloadOnly = args.includes('--download-only');
const yearsBack = parseInt(args.find((arg) => arg.startsWith('--years='))?.split('=')[1] || '10');
const batchSize = parseInt(args.find((arg) => arg.startsWith('--batch='))?.split('=')[1] || '50');
const apiDelay = parseInt(args.find((arg) => arg.startsWith('--delay='))?.split('=')[1] || '2000');

console.log('🔄 Limitless Data Sync Tool v3\n');
console.log('This tool will download ALL your Limitless data locally.');
console.log('Once downloaded, data will never be fetched from the API again.\n');

console.log('Configuration:');
console.log(`  - Mode: ${downloadOnly ? 'Download only' : 'Download + Vectorize'}`);
console.log(`  - Years to sync: ${yearsBack}`);
console.log(`  - Batch size: ${batchSize} days`);
console.log(`  - API delay: ${apiDelay}ms between requests`);
console.log(`  - Data directory: ./data\n`);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
};

async function main() {
  try {
    // Confirm with user
    const confirm = await question('Do you want to continue? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('\nSync cancelled.');
      process.exit(0);
    }

    console.log('\n📥 Starting sync process...\n');

    // Initialize components
    const client = new LimitlessClient({ apiKey: apiKey! });
    const fileManager = new FileManager({
      baseDir: './data',
      enableEmbeddings: true,
      enableMetadata: true,
    });

    let vectorStore = null;
    if (!downloadOnly) {
      // Initialize vector store
      const { LanceDBStore } = await import('../vector-store/lancedb-store.js');
      vectorStore = new LanceDBStore({
        collectionName: 'limitless-lifelogs',
        persistPath: './data/lancedb',
      });
    }

    // Create sync service
    const syncService = new SyncServiceV3(client, fileManager, vectorStore, {
      downloadOnly,
      apiDelayMs: apiDelay,
      batchSize,
      checkpointInterval: 1, // Save after every batch
      maxYearsBack: yearsBack,
    });

    // Set up progress monitoring
    const progressInterval = setInterval(() => {
      const progress = syncService.getProgress();
      const phase = progress.phase;

      if (phase === 'download') {
        console.log(`\n📊 Download Progress:`);
        console.log(`  Current date: ${progress.currentDate}`);
        console.log(`  Total downloaded: ${progress.totalDownloaded} lifelogs`);
        console.log(`  Processed batches: ${progress.processedBatches.size}`);
        console.log(`  Storage size: ${(progress.storageSize / 1024 / 1024).toFixed(2)} MB`);

        if (progress.oldestDate && progress.newestDate) {
          console.log(`  Date range: ${progress.oldestDate} to ${progress.newestDate}`);
        }

        if (progress.errors.length > 0) {
          console.log(`  ⚠️ Errors: ${progress.errors.length}`);
        }
      } else if (phase === 'vectorize') {
        console.log(`\n🔮 Vectorization Progress:`);
        console.log(`  Current date: ${progress.currentDate}`);
        console.log(`  Total vectorized: ${progress.totalVectorized} lifelogs`);
      }
    }, 10000); // Update every 10 seconds

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n\n⚠️ Stopping sync (progress saved)...');
      syncService.stop();
      clearInterval(progressInterval);

      setTimeout(() => {
        console.log('✅ Sync stopped. Run again to resume from checkpoint.');
        process.exit(0);
      }, 2000);
    });

    // Start sync
    await syncService.start();

    clearInterval(progressInterval);

    // Final summary
    const finalProgress = syncService.getProgress();
    console.log('\n✅ Sync Complete!\n');
    console.log('Summary:');
    console.log(`  - Total downloaded: ${finalProgress.totalDownloaded} lifelogs`);

    if (!downloadOnly) {
      console.log(`  - Total vectorized: ${finalProgress.totalVectorized} lifelogs`);
    }

    console.log(`  - Storage size: ${(finalProgress.storageSize / 1024 / 1024).toFixed(2)} MB`);

    if (finalProgress.oldestDate && finalProgress.newestDate) {
      console.log(`  - Date range: ${finalProgress.oldestDate} to ${finalProgress.newestDate}`);
    }

    if (finalProgress.errors.length > 0) {
      console.log(`\n⚠️ Errors encountered: ${finalProgress.errors.length}`);
      console.log('Check logs for details.');
    }

    console.log('\n🎉 All data is now stored locally!');
    console.log('You can rebuild embeddings anytime with: npm run sync:rebuild');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the sync
main().catch(console.error);
