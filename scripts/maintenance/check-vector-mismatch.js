#!/usr/bin/env node

/**
 * Simple check for vector dimension mismatch
 */

import { connect } from '@lancedb/lancedb';

async function main() {
  const dbPath = './data/lancedb';
  const collectionName = 'limitless-lifelogs';

  console.log('=== Checking Vector Dimension ===\n');

  try {
    const db = await connect(dbPath);
    const tables = await db.tableNames();

    if (!tables.includes(collectionName)) {
      console.log('❌ No vector database found.');
      return;
    }

    const table = await db.openTable(collectionName);
    const count = await table.countRows();
    console.log(`📊 Table has ${count} rows`);

    // Get a sample row
    const sample = await table.limit(1).toArray();
    if (sample.length > 0) {
      const vectorDim = sample[0].vector?.length || 0;
      console.log(`📏 Vector dimension: ${vectorDim}`);

      // Check metadata
      const metadata = JSON.parse(sample[0].metadata || '{}');
      console.log(`📝 Sample metadata:`, Object.keys(metadata));

      // Common dimensions
      if (vectorDim === 768) {
        console.log(`✅ Using Ollama embeddings (nomic-embed-text)`);
      } else if (vectorDim === 384) {
        console.log(`✅ Using Transformer embeddings (all-MiniLM-L6-v2)`);
      } else if (vectorDim === 1536) {
        console.log(`✅ Using OpenAI embeddings`);
      } else {
        console.log(`⚠️  Unknown embedding dimension`);
      }

      // Check if we have recent Ollama fallback
      console.log('\n🔍 Checking current system status...');
      console.log('   - Current system expects: 384 dimensions (Transformer fallback)');
      console.log(`   - Database has: ${vectorDim} dimensions`);

      if (vectorDim !== 384) {
        console.log('\n⚠️  DIMENSION MISMATCH!');
        console.log('   This will cause "No vector column found" errors.');
        console.log('\n💡 Solutions:');
        console.log('   1. Start Ollama: ollama serve');
        console.log('   2. Pull the model: ollama pull nomic-embed-text');
        console.log('   3. Or rebuild DB: npm run db:rebuild');
      } else {
        console.log('\n✅ No dimension mismatch detected.');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
