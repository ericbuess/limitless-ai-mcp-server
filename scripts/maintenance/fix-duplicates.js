import { LanceDBStore } from './dist/vector-store/lancedb-store.js';
import fs from 'fs/promises';
import path from 'path';

async function fixDuplicates() {
  console.log('=== Fixing Vector DB Duplicates ===\n');

  try {
    // 1. Clear the existing LanceDB
    console.log('Step 1: Clearing existing LanceDB...');
    const lancedbPath = './data/lancedb';
    await fs.rm(lancedbPath, { recursive: true, force: true }).catch(() => {});
    console.log('✓ LanceDB cleared\n');

    // 2. Create a fresh vector store instance
    console.log('Step 2: Initializing fresh LanceDB...');
    const vectorStore = new LanceDBStore({
      path: lancedbPath,
      collectionName: 'limitless-lifelogs',
    });
    await vectorStore.initialize();
    console.log('✓ Fresh LanceDB initialized\n');

    // 3. Find all MD files
    console.log('Step 3: Finding all lifelog files...');
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
          allFiles.push({
            path: path.join(dayPath, file),
            id: file.replace('.md', ''),
          });
        }
      }
    }

    console.log(`Found ${allFiles.length} lifelog files\n`);

    // 4. Process files in batches and add to vector store
    console.log('Step 4: Adding files to vector store...');
    const batchSize = 25;
    let totalProcessed = 0;

    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batchFiles = allFiles.slice(i, i + batchSize);
      const batch = [];

      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allFiles.length / batchSize)}...`
      );

      for (const fileInfo of batchFiles) {
        try {
          // Read the file
          const content = await fs.readFile(fileInfo.path, 'utf-8');
          const lines = content.split('\n');

          // Extract metadata
          const titleLine = lines.find((l) => l.startsWith('# '));
          const title = titleLine ? titleLine.replace('# ', '').trim() : 'Untitled';

          const dateLine = lines.find((l) => l.startsWith('**Date:**'));
          const dateStr = dateLine
            ? dateLine.replace('**Date:**', '').trim()
            : new Date().toISOString();

          const durationLine = lines.find((l) => l.startsWith('**Duration:**'));
          const durationStr = durationLine
            ? durationLine.replace('**Duration:**', '').trim()
            : '0 minutes';
          const durationMatch = durationStr.match(/(\d+)/);
          const duration = durationMatch ? parseInt(durationMatch[1]) * 60 : 0;

          batch.push({
            id: fileInfo.id,
            content: `${title}\n\n${content}`,
            metadata: {
              title: title,
              date: new Date(dateStr).toISOString(),
              duration: duration,
              filePath: fileInfo.path,
            },
          });
        } catch (error) {
          console.error(`Error processing ${fileInfo.path}:`, error.message);
        }
      }

      if (batch.length > 0) {
        await vectorStore.addDocuments(batch);
        totalProcessed += batch.length;
        console.log(`  ✓ Added ${batch.length} documents (total: ${totalProcessed})`);
      }
    }

    // 5. Verify final state
    console.log('\nStep 5: Verifying final state...');
    const stats = await vectorStore.getStats();
    console.log(`Files found: ${allFiles.length}`);
    console.log(`Documents indexed: ${totalProcessed}`);
    console.log(`Documents in vector DB: ${stats.documentCount}`);
    console.log(`Duplicates prevented: ${allFiles.length - stats.documentCount}`);

    // 6. Test search
    console.log('\nStep 6: Testing search functionality...');
    const testQueries = ['meeting', 'discussion', 'project', 'today'];

    for (const query of testQueries) {
      const results = await vectorStore.searchByText(query, { topK: 3 });
      console.log(`\nSearch for "${query}": ${results.length} results`);
      if (results.length > 0) {
        console.log(
          `  Best match: ${results[0].metadata?.title} (score: ${results[0].score.toFixed(3)})`
        );
      }
    }

    console.log('\n✅ Duplicate fix complete!');
  } catch (error) {
    console.error('Fatal error:', error);
    console.error('Stack:', error.stack);
  }

  process.exit(0);
}

fixDuplicates().catch(console.error);
