import { LanceDBStore } from './dist/vector-store/lancedb-store.js';
import { FileManager } from './dist/storage/file-manager.js';
import fs from 'fs/promises';

async function checkVectorDB() {
  console.log('Checking Vector Database Status...\n');

  // Initialize stores
  const vectorStore = new LanceDBStore({
    path: './data/lancedb',
    collectionName: 'limitless-lifelogs',
  });
  await vectorStore.initialize();

  const fileManager = new FileManager({ baseDir: './data' });
  await fileManager.initialize();

  // Get all document IDs from vector store
  const allDocIds = await vectorStore.listDocumentIds();
  console.log(`Documents in vector DB: ${allDocIds.length}`);

  // Get all MD files
  const stats = await fileManager.getStorageStats();
  console.log(`MD files on disk: ${stats.totalLifelogs}`);

  // Check for duplicates
  const idMap = new Map();
  let duplicates = 0;

  for (const id of allDocIds) {
    if (idMap.has(id)) {
      duplicates++;
      console.log(`Duplicate found: ${id}`);
    } else {
      idMap.set(id, true);
    }
  }

  console.log(`\nDuplicates in vector DB: ${duplicates}`);
  console.log(`Unique documents: ${idMap.size}`);
  console.log(`Missing from vector DB: ${stats.totalLifelogs - idMap.size}`);

  // Find missing IDs
  if (stats.totalLifelogs > idMap.size) {
    console.log('\nChecking which files are missing from vector DB...');

    // Get all file IDs
    const allFiles = await fs.readdir('./data/lifelogs/2025/06/04');
    const mdFiles = allFiles.filter((f) => f.endsWith('.md'));

    let missing = 0;
    for (const file of mdFiles) {
      const id = file.replace('.md', '');
      if (!idMap.has(id)) {
        console.log(`Missing: ${id}`);
        missing++;
        if (missing >= 5) {
          console.log('... (showing first 5 missing)');
          break;
        }
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total MD files: ${stats.totalLifelogs}`);
  console.log(`Vector DB docs: ${allDocIds.length}`);
  console.log(`Unique in DB: ${idMap.size}`);
  console.log(`Duplicates: ${duplicates}`);
  console.log(`Missing: ${stats.totalLifelogs - idMap.size}`);

  process.exit(0);
}

checkVectorDB().catch(console.error);
