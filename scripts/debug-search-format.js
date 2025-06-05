#!/usr/bin/env node

import { UnifiedSearchHandler } from '../dist/search/unified-search.js';
import { FileManager } from '../dist/storage/file-manager.js';

async function debugSearchFormat() {
  const fileManager = new FileManager({ baseDir: './data' });
  const searchHandler = new UnifiedSearchHandler(fileManager, {
    enableVectorStore: true,
    enableClaude: false,
  });

  await searchHandler.initialize();

  console.log('🔍 Debugging search result format...\n');

  const result = await searchHandler.search('smoothie king');

  console.log('Full result structure:');
  console.log(JSON.stringify(result, null, 2));

  if (result.results && result.results.length > 0) {
    console.log('\nFirst result details:');
    console.log(JSON.stringify(result.results[0], null, 2));
  }
}

debugSearchFormat().catch(console.error);
