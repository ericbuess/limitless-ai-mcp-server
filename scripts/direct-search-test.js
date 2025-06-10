#!/usr/bin/env node

import { FileManager } from '../dist/storage/file-manager.js';
import { LanceDBStore } from '../dist/vector-store/lancedb-store.js';

async function main() {
  console.log('🔍 Direct Search Test\n');

  try {
    // Initialize file manager
    const fileManager = new FileManager({ baseDir: './data' });

    // Try to load all lifelogs
    console.log('Loading all lifelogs...');
    const lifelogs = await fileManager.loadAllLifelogs();
    console.log(`✅ Loaded ${lifelogs.length} lifelogs`);

    // Search for lunch
    const lunchLifelogs = lifelogs.filter(
      (l) =>
        l.content.toLowerCase().includes('smoothie king') ||
        l.content.toLowerCase().includes('chick-fil-a')
    );

    console.log(`\n📋 Found ${lunchLifelogs.length} lifelogs with lunch mentions:`);

    for (const lifelog of lunchLifelogs) {
      console.log(`\n- ${lifelog.id}: ${lifelog.title}`);

      // Find relevant lines
      const lines = lifelog.content.split('\n');
      const relevantLines = lines.filter(
        (line) => line.toLowerCase().includes('smoothie') || line.toLowerCase().includes('chick')
      );

      for (const line of relevantLines.slice(0, 2)) {
        console.log(`  > ${line.trim()}`);
      }
    }

    // Now test vector search
    console.log('\n\n🔍 Testing Vector Search...');
    const vectorStore = new LanceDBStore({
      collectionName: 'limitless-lifelogs',
      persistPath: './data/lancedb',
    });

    await vectorStore.initialize();

    const vectorResults = await vectorStore.search('Smoothie King lunch', { limit: 5 });
    console.log(`\n✅ Vector search returned ${vectorResults.length} results`);

    for (const result of vectorResults) {
      console.log(`\n- ${result.id} (Score: ${result.score.toFixed(3)})`);
      console.log(`  ${result.content.substring(0, 100)}...`);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
  }
}

main().catch(console.error);
