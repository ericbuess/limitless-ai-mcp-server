#!/usr/bin/env node

import { FileManager } from '../dist/storage/file-manager.js';
import { LanceDBStore } from '../dist/vector-store/lancedb-store.js';
import { SemanticChunker } from '../dist/search/semantic-chunker.js';
import { logger } from '../dist/utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

async function rebuildWithChunking() {
  console.log('🔄 Rebuilding Vector DB with Semantic Chunking\n');

  // Initialize components
  const fileManager = new FileManager({ baseDir: './data' });
  await fileManager.initialize();

  const chunker = new SemanticChunker({
    chunkSize: 5, // 5 sentences per chunk
    overlap: 2, // 2 sentence overlap
    minChunkSize: 100, // Min 100 chars
    maxChunkSize: 1500, // Max 1500 chars
  });

  // Clean existing database
  const lancedbPath = './data/lancedb';
  console.log('Removing existing LanceDB...');
  try {
    await fs.rm(lancedbPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore if doesn't exist
  }

  // Initialize new store
  const vectorStore = new LanceDBStore({
    collectionName: 'limitless-chunks',
    persistPath: lancedbPath,
  });
  await vectorStore.initialize();

  // Load all lifelogs from storage
  const allLifelogs = await fileManager.loadAllLifelogs();
  console.log(`Found ${allLifelogs.length} lifelogs to process\n`);

  let totalChunks = 0;
  let processedFiles = 0;
  const batchSize = 50;
  let currentBatch = [];

  for (let i = 0; i < allLifelogs.length; i++) {
    const lifelog = allLifelogs[i];

    try {
      // Chunk the document
      const chunks = await chunker.chunkDocument(lifelog.content, lifelog.id, {
        title: lifelog.title,
        date: lifelog.createdAt,
        duration: lifelog.metadata?.duration || 0,
        speakers: lifelog.metadata?.speakers || [],
      });

      // Convert chunks to vector documents
      for (const chunk of chunks) {
        currentBatch.push({
          id: chunk.metadata.chunkIndex + '_' + lifelog.id,
          content: chunk.content,
          metadata: {
            ...chunk.metadata,
            parentId: lifelog.id,
            parentTitle: lifelog.title,
            parentDate: lifelog.createdAt,
            entities: chunk.metadata.entities || [],
            foodMentions: chunk.metadata.foodMentions || [],
            temporalContext: chunk.metadata.temporalContext || [],
          },
        });
      }

      totalChunks += chunks.length;
      processedFiles++;

      // Process batch if full
      if (currentBatch.length >= batchSize) {
        await vectorStore.addDocuments(currentBatch);
        console.log(
          `✓ Processed ${processedFiles}/${allLifelogs.length} files (${totalChunks} chunks)`
        );
        currentBatch = [];
      }
    } catch (error) {
      console.error(`Error processing ${lifelog.id}:`, error.message);
    }
  }

  // Process remaining batch
  if (currentBatch.length > 0) {
    await vectorStore.addDocuments(currentBatch);
  }

  console.log('\n✅ Rebuild complete!');
  console.log(`Total files: ${processedFiles}`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`Average chunks per file: ${(totalChunks / processedFiles).toFixed(1)}`);

  // Test the lunch query
  console.log('\n🧪 Testing lunch query...\n');

  const testQueries = [
    'lunch today who ate what',
    'Smoothie King Eric',
    'Chick-fil-A Jordan Asa',
    'what did I eat for lunch June 9',
  ];

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    const results = await vectorStore.searchByText(query, { topK: 5 });

    console.log(`Found ${results.length} results:`);
    results.forEach((result, idx) => {
      console.log(
        `  ${idx + 1}. Score: ${result.score.toFixed(3)} - ${result.metadata?.parentTitle || 'Unknown'}`
      );
      if (result.metadata?.foodMentions?.length > 0) {
        console.log(`     Food: ${result.metadata.foodMentions.join(', ')}`);
      }
    });
    console.log();
  }

  await vectorStore.close();
}

rebuildWithChunking().catch(console.error);
