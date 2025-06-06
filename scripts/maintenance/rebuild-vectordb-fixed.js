import { LanceDBStore } from '../../dist/vector-store/lancedb-store.js';
import { FileManager } from '../../dist/storage/file-manager.js';
import fs from 'fs/promises';
import path from 'path';

async function rebuildVectorDB() {
  console.log('Rebuilding Vector Database with contextual embeddings...\n');

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
    console.log('Initialized fresh LanceDB store with contextual embeddings\n');

    // Initialize file manager
    const fileManager = new FileManager({ baseDir: './data' });
    await fileManager.initialize();

    // Get all lifelog files
    const stats = await fileManager.getStorageStats();
    console.log(`Found ${stats.totalLifelogs} lifelog files to index\n`);

    // Process by date
    const yearPath = './data/lifelogs/2025';
    const months = await fs.readdir(yearPath);
    let totalProcessed = 0;
    let totalErrors = 0;

    for (const month of months.sort()) {
      const monthPath = path.join(yearPath, month);
      const days = await fs.readdir(monthPath);

      for (const day of days.sort()) {
        const dayPath = path.join(monthPath, day);
        const files = await fs.readdir(dayPath);
        const mdFiles = files.filter((f) => f.endsWith('.md'));

        console.log(`Processing 2025/${month}/${day}: ${mdFiles.length} files`);

        const batch = [];
        let skipped = 0;

        for (const file of mdFiles) {
          const id = file.replace('.md', '');
          try {
            // Create a local date to match FileManager's getDatePath logic
            const localDate = new Date(2025, parseInt(month) - 1, parseInt(day));

            const lifelog = await fileManager.loadLifelog(id, localDate);

            if (lifelog) {
              batch.push({
                id: lifelog.id,
                content: lifelog.content || '',
                metadata: {
                  title: lifelog.title,
                  date: lifelog.createdAt,
                  duration: lifelog.duration,
                  headings: lifelog.headings,
                },
              });
            } else {
              skipped++;
            }
          } catch (error) {
            console.error(`  Error loading ${id}:`, error.message);
            totalErrors++;
          }
        }

        if (skipped > 0) {
          console.log(`  Skipped ${skipped} files (no content)`);
        }

        console.log(`  Loaded ${batch.length} lifelogs`);

        // Add batch to vector store if not empty
        if (batch.length > 0) {
          try {
            await vectorStore.addDocuments(batch);
            totalProcessed += batch.length;
            console.log(`  ✓ Indexed ${batch.length} documents with contextual embeddings`);
          } catch (error) {
            console.error('  Error adding to vector store:', error.message);
            totalErrors += batch.length;
          }
        }
      }
    }

    console.log('\n--- Rebuild Complete ---');
    console.log(`Total files found: ${stats.totalLifelogs}`);
    console.log(`Successfully indexed: ${totalProcessed}`);
    console.log(`Errors: ${totalErrors}`);

    // Get final stats
    const dbStats = await vectorStore.getStats();
    console.log(`Documents in vector DB: ${dbStats.documentCount}`);

    // Test search
    console.log('\n--- Testing Search ---');
    const testResults = await vectorStore.searchByText('meeting', { topK: 5 });
    console.log(`Search for "meeting" returned ${testResults.length} results`);

    if (testResults.length > 0) {
      console.log('\nTop result:');
      console.log(`- Score: ${testResults[0].score.toFixed(3)}`);
      console.log(`- Title: ${testResults[0].metadata?.title || 'N/A'}`);
    }

    // Test specific query
    console.log('\n--- Testing Kids Query ---');
    const kidsResults = await vectorStore.searchByText('where did the kids go this afternoon', {
      topK: 5,
    });
    console.log(
      `Search for "where did the kids go this afternoon" returned ${kidsResults.length} results`
    );

    if (kidsResults.length > 0) {
      console.log('\nTop 3 results:');
      kidsResults.slice(0, 3).forEach((result, i) => {
        console.log(
          `${i + 1}. Score: ${result.score.toFixed(3)} - ${result.metadata?.title || 'N/A'}`
        );
      });
    }

    await vectorStore.close();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

rebuildVectorDB().catch(console.error);
