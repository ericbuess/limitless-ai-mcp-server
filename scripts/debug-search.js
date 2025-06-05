#!/usr/bin/env node

import { FileManager } from '../dist/storage/file-manager.js';
import { UnifiedSearchHandler } from '../dist/search/unified-search.js';
import { logger } from '../dist/utils/logger.js';

async function debugSearch() {
  const query = process.argv[2] || 'metroid prime 4';
  console.log(`\nDebug searching for: "${query}"\n`);

  // Initialize file manager and search handler
  const fileManager = new FileManager({ baseDir: './data' });
  await fileManager.initialize();

  // List all lifelogs and check for our target file
  const allLifelogs = await fileManager.loadAllLifelogs();
  console.log(`Total lifelogs loaded: ${allLifelogs.length}`);

  // Check if our specific file is in the list
  const targetId = 'MlRjjYrTbAPQn9qL1WXB';
  const targetLifelog = allLifelogs.find((l) => l.id === targetId);
  if (targetLifelog) {
    console.log(`\nFound target lifelog ${targetId}:`);
    console.log(`- Title: ${targetLifelog.title}`);
    console.log(`- Date: ${targetLifelog.createdAt}`);
    console.log(`- Content preview: ${targetLifelog.content.substring(0, 200)}...`);
    console.log(
      `- Contains "Metroid Prime 4": ${targetLifelog.content.includes('Metroid Prime 4')}`
    );
  } else {
    console.log(`\nTarget lifelog ${targetId} NOT FOUND in loaded lifelogs!`);

    // Try to load it directly
    const date = new Date('2025-06-05');
    const directLoad = await fileManager.loadLifelog(targetId, date);
    if (directLoad) {
      console.log(`\nDirect load successful:`);
      console.log(`- Title: ${directLoad.title}`);
      console.log(`- Date: ${directLoad.createdAt}`);
      console.log(`- Content preview: ${directLoad.content.substring(0, 200)}...`);
    } else {
      console.log(`\nDirect load also failed!`);
    }
  }

  // Check lifelogs from June 5
  const june5Lifelogs = allLifelogs.filter((l) => {
    const date = new Date(l.createdAt);
    return date.getMonth() === 5 && date.getDate() === 5 && date.getFullYear() === 2025;
  });
  console.log(`\nLifelogs from June 5, 2025: ${june5Lifelogs.length}`);

  // Now run the search
  console.log('\nRunning search...');
  const searchHandler = new UnifiedSearchHandler(fileManager, {
    enableVectorStore: true,
    enableClaude: false,
  });

  await searchHandler.initialize();

  const results = await searchHandler.search(query, {
    strategy: 'parallel',
    limit: 50,
  });

  console.log(`\nSearch returned ${results.results.length} results`);

  // Check if our target is in the results
  const targetInResults = results.results.find((r) => r.id === targetId);
  if (targetInResults) {
    console.log(`\nTarget lifelog found in results with score: ${targetInResults.score}`);
  } else {
    console.log(`\nTarget lifelog NOT in search results!`);
  }
}

debugSearch().catch(console.error);
