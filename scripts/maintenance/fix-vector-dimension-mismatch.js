#!/usr/bin/env node

/**
 * Fix Vector Dimension Mismatch in LanceDB
 *
 * This script handles the case where the database was created with one embedding model
 * (e.g., Ollama with 768 dimensions) but the system is now using a different model
 * (e.g., Transformers with 384 dimensions).
 *
 * Options:
 * 1. Rebuild the entire database with the current embedding model
 * 2. Check and report the mismatch
 * 3. Force a specific embedding provider
 */

import { connect } from '@lancedb/lancedb';
import { FileManager } from '../../dist/storage/file-manager.js';
import ollamaEmbeddings from '../../dist/vector-store/ollama-embeddings.js';
import transformerEmbeddings from '../../dist/vector-store/transformer-embeddings.js';
import { logger } from '../../dist/utils/logger.js';

const { createBestEmbeddingProvider, OllamaEmbeddingProvider } = ollamaEmbeddings;
const { TransformerEmbeddings } = transformerEmbeddings;
import fs from 'fs/promises';
import path from 'path';

async function checkDimensionMismatch() {
  const dbPath = './data/lancedb';
  const collectionName = 'limitless-lifelogs';

  console.log('=== Checking Vector Dimension Mismatch ===\n');

  try {
    // Check current database
    const db = await connect(dbPath);
    const tables = await db.tableNames();

    if (!tables.includes(collectionName)) {
      console.log('❌ No vector database found. Run sync first.');
      return;
    }

    const table = await db.openTable(collectionName);
    const sample = await table.head(1).toArray();

    if (sample.length === 0) {
      console.log('❌ Database is empty.');
      return;
    }

    const dbVectorDim = sample[0].vector?.length || 0;
    console.log(`📊 Database vector dimension: ${dbVectorDim}`);

    // Check available embedding providers
    console.log('\n🔍 Checking available embedding providers...\n');

    // Check Ollama
    try {
      const ollama = new OllamaEmbeddingProvider();
      const testEmbed = await ollama.embedSingle('test');
      console.log(`✅ Ollama (nomic-embed-text): ${testEmbed.length} dimensions`);
    } catch (error) {
      console.log(`❌ Ollama not available: ${error.message}`);
    }

    // Check Transformer
    try {
      const transformer = new TransformerEmbeddings();
      await transformer.initialize();
      console.log(`✅ Transformer (all-MiniLM-L6-v2): ${transformer.getDimension()} dimensions`);
    } catch (error) {
      console.log(`❌ Transformer not available: ${error.message}`);
    }

    // Check best provider
    const bestProvider = await createBestEmbeddingProvider();
    const testEmbed = await bestProvider.embedSingle('test');
    console.log(`\n🎯 Current best provider dimension: ${testEmbed.length}`);

    if (dbVectorDim !== testEmbed.length) {
      console.log(`\n⚠️  DIMENSION MISMATCH DETECTED!`);
      console.log(`   Database: ${dbVectorDim} dimensions`);
      console.log(`   Current:  ${testEmbed.length} dimensions`);
      console.log(`\n   This will cause search failures.`);
      return { mismatch: true, dbDim: dbVectorDim, currentDim: testEmbed.length };
    } else {
      console.log(`\n✅ Dimensions match! No issues detected.`);
      return { mismatch: false, dbDim: dbVectorDim, currentDim: testEmbed.length };
    }
  } catch (error) {
    console.error('Error checking dimensions:', error);
    return { error: error.message };
  }
}

async function rebuildWithCurrentModel(options = {}) {
  const { force = false } = options;

  console.log('\n=== Rebuilding Vector Database ===\n');

  // First check for mismatch
  const check = await checkDimensionMismatch();

  if (!check.mismatch && !force) {
    console.log('No dimension mismatch detected. Use --force to rebuild anyway.');
    return;
  }

  const dbPath = './data/lancedb';
  const backupPath = './data/lancedb.backup';
  const collectionName = 'limitless-lifelogs';

  try {
    // Backup existing database
    console.log('📦 Backing up existing database...');
    await fs.rename(dbPath, backupPath).catch(() => {});

    // Initialize fresh database
    console.log('🔄 Creating new database...');
    const db = await connect(dbPath);

    // Get embedding provider
    const embeddingProvider = await createBestEmbeddingProvider();
    const testEmbed = await embeddingProvider.embedSingle('test');
    console.log(`📏 Using embedding dimension: ${testEmbed.length}`);

    // Load all lifelogs
    console.log('📂 Loading lifelogs...');
    const fileManager = new FileManager({ baseDir: './data' });
    const lifelogs = await fileManager.loadAllLifelogs();
    console.log(`   Found ${lifelogs.length} lifelogs`);

    // Create records with embeddings
    console.log('🔢 Generating embeddings...');
    const records = [];

    for (let i = 0; i < lifelogs.length; i++) {
      const lifelog = lifelogs[i];

      if (i % 10 === 0) {
        process.stdout.write(`\r   Progress: ${i}/${lifelogs.length}`);
      }

      try {
        // Generate embedding for content
        const embedding = await embeddingProvider.embedSingle(lifelog.content);

        records.push({
          id: lifelog.id,
          content: lifelog.content,
          vector: embedding,
          metadata: JSON.stringify({
            title: lifelog.title,
            date: lifelog.createdAt,
            duration: lifelog.duration,
          }),
        });
      } catch (error) {
        console.error(`\nError embedding lifelog ${lifelog.id}:`, error.message);
      }
    }

    console.log(`\n✅ Generated ${records.length} embeddings`);

    // Create table with records
    console.log('💾 Creating new table...');
    await db.createTable(collectionName, records);

    console.log('✅ Database rebuilt successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Total lifelogs: ${lifelogs.length}`);
    console.log(`   - Successfully embedded: ${records.length}`);
    console.log(`   - Vector dimension: ${testEmbed.length}`);
    console.log(`   - Backup saved at: ${backupPath}`);
  } catch (error) {
    console.error('\n❌ Rebuild failed:', error);

    // Try to restore backup
    try {
      await fs.rename(backupPath, dbPath);
      console.log('📦 Restored backup database');
    } catch (restoreError) {
      console.error('Failed to restore backup:', restoreError.message);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  switch (command) {
    case 'check':
      await checkDimensionMismatch();
      break;

    case 'rebuild':
      await rebuildWithCurrentModel({ force: args.includes('--force') });
      break;

    default:
      console.log('Usage:');
      console.log(
        '  node fix-vector-dimension-mismatch.js check     - Check for dimension mismatch'
      );
      console.log(
        '  node fix-vector-dimension-mismatch.js rebuild   - Rebuild if mismatch detected'
      );
      console.log('  node fix-vector-dimension-mismatch.js rebuild --force - Force rebuild');
  }
}

main().catch(console.error);
