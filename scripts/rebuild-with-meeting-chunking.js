#!/usr/bin/env node

import { FileManager } from '../dist/storage/file-manager.js';
import { LanceDBStore } from '../dist/vector-store/lancedb-store.js';
import { SemanticChunker } from '../dist/search/semantic-chunker.js';
import { logger } from '../dist/utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

async function rebuildWithMeetingChunking() {
  console.log('🔄 Rebuilding Vector DB with Semantic Chunking + Meeting Summaries\n');

  // Initialize components
  const fileManager = new FileManager({ baseDir: './data' });
  await fileManager.initialize();

  const chunker = new SemanticChunker({
    chunkSize: 5, // 5 sentences per chunk
    overlap: 2, // 2 sentence overlap
    minChunkSize: 100, // Min 100 chars
    maxChunkSize: 1500, // Max 1500 chars
    includeMeetingSummaries: true, // Enable meeting extraction
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
  let meetingFiles = 0;
  let actionItemsFound = 0;
  const batchSize = 50;
  let currentBatch = [];

  for (let i = 0; i < allLifelogs.length; i++) {
    const lifelog = allLifelogs[i];

    try {
      // Chunk the document with meeting extraction
      const chunks = await chunker.chunkDocument(lifelog.content, lifelog.id, {
        title: lifelog.title,
        date: lifelog.createdAt,
        duration: lifelog.metadata?.duration || 0,
      });

      // Track meeting content
      const hasMeetingContent = chunks.some((c) => c.metadata.isMeetingContent);
      if (hasMeetingContent) {
        meetingFiles++;
        const meetingActionItems = chunks
          .filter((c) => c.metadata.actionItems && c.metadata.actionItems.length > 0)
          .reduce((sum, c) => sum + (c.metadata.actionItems?.length || 0), 0);
        actionItemsFound += meetingActionItems;
      }

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
            // Include meeting metadata if present
            isMeetingContent: chunk.metadata.isMeetingContent,
            meetingTopics: chunk.metadata.meetingTopics || [],
            actionItems: chunk.metadata.actionItems || [],
            decisions: chunk.metadata.decisions || [],
            participants: chunk.metadata.participants || [],
          },
        });
      }

      totalChunks += chunks.length;
      processedFiles++;

      // Process batch if full
      if (currentBatch.length >= batchSize) {
        await vectorStore.addDocuments(currentBatch);
        console.log(
          `✓ Processed ${processedFiles}/${allLifelogs.length} files (${totalChunks} chunks, ${meetingFiles} meetings)`
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
  console.log(`Files with meetings: ${meetingFiles}`);
  console.log(`Action items found: ${actionItemsFound}`);
  console.log(`Average chunks per file: ${(totalChunks / processedFiles).toFixed(1)}`);

  // Test queries including meeting-specific ones
  console.log('\n🧪 Testing enhanced queries...\n');

  const testQueries = [
    'lunch today who ate what',
    'action items from project plan',
    'what did we decide in the meeting',
    'Eric B meeting notes',
    'next steps for implementation',
    'who participated in discussions',
  ];

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    const results = await vectorStore.searchByText(query, { topK: 5 });

    console.log(`Found ${results.length} results:`);
    results.forEach((result, idx) => {
      console.log(
        `  ${idx + 1}. Score: ${result.score.toFixed(3)} - ${result.metadata?.parentTitle || 'Unknown'}`
      );

      // Show relevant metadata
      if (result.metadata?.foodMentions?.length > 0) {
        console.log(`     🍔 Food: ${result.metadata.foodMentions.join(', ')}`);
      }
      if (result.metadata?.actionItems?.length > 0) {
        console.log(
          `     ✅ Actions: ${result.metadata.actionItems.map((a) => a.description).join('; ')}`
        );
      }
      if (result.metadata?.meetingTopics?.length > 0) {
        console.log(`     📋 Topics: ${result.metadata.meetingTopics.slice(0, 2).join('; ')}`);
      }
      if (result.metadata?.participants?.length > 0) {
        console.log(`     👥 Participants: ${result.metadata.participants.slice(0, 3).join(', ')}`);
      }
    });
    console.log();
  }

  await vectorStore.close();
}

rebuildWithMeetingChunking().catch(console.error);
