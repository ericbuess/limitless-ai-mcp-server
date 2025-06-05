import { LanceDBStore } from '../../dist/vector-store/lancedb-store.js';
import { FileManager } from '../../dist/storage/file-manager.js';
import { toPhase2Lifelog } from '../../dist/types/phase2.js';
import fs from 'fs/promises';
import path from 'path';

async function rebuildVectorDB() {
  console.log('Rebuilding Vector Database from scratch...\n');

  try {
    // Remove existing LanceDB
    const lancedbPath = './data/lancedb';
    try {
      await fs.rm(lancedbPath, { recursive: true, force: true });
      console.log('Removed existing LanceDB directory');
    } catch (error) {
      console.log('No existing LanceDB to remove');
    }

    // Initialize fresh vector store
    const vectorStore = new LanceDBStore({
      path: lancedbPath,
      collectionName: 'limitless-lifelogs',
    });
    await vectorStore.initialize();
    console.log('Initialized fresh LanceDB store\n');

    // Initialize file manager
    const fileManager = new FileManager({ baseDir: './data' });
    await fileManager.initialize();

    // Get all lifelog files
    const stats = await fileManager.getStorageStats();
    console.log(`Found ${stats.totalLifelogs} lifelog files to index\n`);

    // Process by date
    const dates = await fs.readdir('./data/lifelogs/2025');
    let totalProcessed = 0;
    let totalErrors = 0;

    for (const month of dates.sort()) {
      const monthPath = path.join('./data/lifelogs/2025', month);
      const days = await fs.readdir(monthPath);

      for (const day of days.sort()) {
        const dayPath = path.join(monthPath, day);
        const files = await fs.readdir(dayPath);
        const mdFiles = files.filter((f) => f.endsWith('.md'));

        console.log(`Processing ${month}/${day}: ${mdFiles.length} files`);

        const batch = [];
        for (const file of mdFiles) {
          const id = file.replace('.md', '');
          try {
            const lifelog = await fileManager.loadLifelog(id, new Date(`2025-${month}-${day}`));

            if (lifelog) {
              batch.push({
                id: lifelog.id,
                content: `${lifelog.title}\n\n${lifelog.content}`,
                metadata: {
                  title: lifelog.title,
                  date: lifelog.createdAt,
                  duration: lifelog.duration,
                  headings: lifelog.headings,
                },
              });
            } else {
              console.log(`  Warning: No lifelog loaded for ${id}`);
            }
          } catch (error) {
            console.error(`  Error loading ${id}:`, error.message);
            totalErrors++;
          }
        }

        console.log(`  Batch size: ${batch.length}`);

        // Add batch to vector store
        if (batch.length > 0) {
          console.log(`  Adding batch of ${batch.length} documents...`);
          try {
            await vectorStore.addDocuments(batch);
            totalProcessed += batch.length;
            console.log(`  ✓ Added ${batch.length} documents`);
          } catch (error) {
            console.error(`  ✗ Failed to add batch:`, error);
            totalErrors += batch.length;
          }
        }
      }
    }

    // Get final stats
    const finalStats = await vectorStore.getStats();

    console.log('\n--- Rebuild Complete ---');
    console.log(`Total files found: ${stats.totalLifelogs}`);
    console.log(`Successfully indexed: ${totalProcessed}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Documents in vector DB: ${finalStats.documentCount}`);

    // Test search
    console.log('\n--- Testing Search ---');
    const results = await vectorStore.searchByText('meeting', { topK: 3 });
    console.log(`Search for "meeting" returned ${results.length} results`);
  } catch (error) {
    console.error('Fatal error:', error);
  }

  process.exit(0);
}

rebuildVectorDB().catch(console.error);
