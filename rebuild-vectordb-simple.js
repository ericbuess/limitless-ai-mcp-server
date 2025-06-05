import { LanceDBStore } from './dist/vector-store/lancedb-store.js';
import fs from 'fs/promises';
import path from 'path';

async function parseLifelogFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // Extract ID from the content
  const idLine = lines.find((l) => l.startsWith('**ID:**'));
  const id = idLine ? idLine.replace('**ID:**', '').trim() : path.basename(filePath, '.md');

  // Extract title (first # line)
  const titleLine = lines.find((l) => l.startsWith('# '));
  const title = titleLine ? titleLine.replace('# ', '').trim() : 'Untitled';

  // Extract date
  const dateLine = lines.find((l) => l.startsWith('**Date:**'));
  const dateStr = dateLine ? dateLine.replace('**Date:**', '').trim() : new Date().toISOString();

  // Extract duration
  const durationLine = lines.find((l) => l.startsWith('**Duration:**'));
  const durationStr = durationLine ? durationLine.replace('**Duration:**', '').trim() : '0 minutes';
  const durationMatch = durationStr.match(/(\d+)/);
  const duration = durationMatch ? parseInt(durationMatch[1]) * 60 : 0;

  return {
    id,
    title,
    content,
    createdAt: new Date(dateStr).toISOString(),
    duration,
    headings: [],
  };
}

async function rebuildVectorDB() {
  console.log('Rebuilding Vector Database (Simple Method)...\n');

  try {
    // Remove existing LanceDB
    const lancedbPath = './data/lancedb';
    await fs.rm(lancedbPath, { recursive: true, force: true }).catch(() => {});

    // Initialize fresh vector store
    const vectorStore = new LanceDBStore({
      path: lancedbPath,
      collectionName: 'limitless-lifelogs',
    });
    await vectorStore.initialize();
    console.log('Initialized fresh LanceDB store\n');

    // Find all MD files
    let allFiles = [];
    const baseDir = './data/lifelogs/2025';
    const months = await fs.readdir(baseDir);

    for (const month of months.sort()) {
      const monthPath = path.join(baseDir, month);
      const days = await fs.readdir(monthPath);

      for (const day of days.sort()) {
        const dayPath = path.join(monthPath, day);
        const files = await fs.readdir(dayPath);
        const mdFiles = files.filter((f) => f.endsWith('.md'));

        for (const file of mdFiles) {
          allFiles.push(path.join(dayPath, file));
        }
      }
    }

    console.log(`Found ${allFiles.length} lifelog files\n`);

    // Process in batches of 25
    const batchSize = 25;
    let totalProcessed = 0;

    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batchFiles = allFiles.slice(i, i + batchSize);
      const batch = [];

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allFiles.length / batchSize)}...`
      );

      for (const filePath of batchFiles) {
        try {
          const lifelog = await parseLifelogFile(filePath);

          batch.push({
            id: lifelog.id,
            content: `${lifelog.title}\\n\\n${lifelog.content}`,
            metadata: {
              title: lifelog.title,
              date: lifelog.createdAt,
              duration: lifelog.duration,
              filePath: filePath,
            },
          });
        } catch (error) {
          console.error(`Error processing ${filePath}:`, error.message);
        }
      }

      if (batch.length > 0) {
        console.log(`  Adding ${batch.length} documents to vector store...`);
        await vectorStore.addDocuments(batch);
        totalProcessed += batch.length;
        console.log(`  ✓ Successfully added ${batch.length} documents`);
      }
    }

    // Get final stats
    const stats = await vectorStore.getStats();

    console.log('\\n--- Rebuild Complete ---');
    console.log(`Total files found: ${allFiles.length}`);
    console.log(`Successfully indexed: ${totalProcessed}`);
    console.log(`Documents in vector DB: ${stats.documentCount}`);

    // Test search
    console.log('\\n--- Testing Search ---');
    const results = await vectorStore.searchByText('meeting', { topK: 3 });
    console.log(`Search for "meeting" returned ${results.length} results`);
    if (results.length > 0) {
      console.log('First result:', {
        id: results[0].id,
        score: results[0].score,
        title: results[0].metadata?.title,
      });
    }
  } catch (error) {
    console.error('Fatal error:', error);
  }

  process.exit(0);
}

rebuildVectorDB().catch(console.error);
