#!/usr/bin/env node

/**
 * Unified Search Tool - A standalone executable that Claude can call
 * This bridges Claude's headless mode with our UnifiedSearchHandler
 */

import { UnifiedSearchHandler } from '../dist/search/unified-search.js';
import { FileManager } from '../dist/storage/file-manager.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: unified-search-tool.js <query>');
    process.exit(1);
  }

  const query = args.join(' ');

  try {
    // Initialize search components
    const fileManager = new FileManager({ baseDir: './data' });
    const searchHandler = new UnifiedSearchHandler(fileManager, {
      enableVectorStore: true,
      enableClaude: false,
    });

    await searchHandler.initialize();

    // Perform search
    const results = await searchHandler.search(query);

    // Format results for Claude to parse
    const formattedResults = {
      query: query,
      resultCount: results.results.length,
      results: results.results.slice(0, 10).map((r) => ({
        file: `data/lifelogs/${r.id}.md`,
        content: (r.lifelog?.content || '').slice(0, 500),
        date: r.lifelog?.createdAt || r.lifelog?.startTime || 'Unknown',
        title: r.lifelog?.title || 'Untitled',
        score: r.score,
        highlights: r.highlights?.slice(0, 3) || [],
      })),
    };

    // Output as JSON for Claude to parse
    console.log(JSON.stringify(formattedResults, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error.message,
        query: query,
      })
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
