#!/usr/bin/env node

/**
 * Vector Search Tool - Executable tool for Claude CLI to perform vector searches
 * Usage: vector-search.js --query "search text" [--limit 10] [--threshold 0.7]
 */

import { ChromaClient } from 'chromadb';
import { DefaultEmbeddingFunction } from 'chromadb-default-embed';
import { parseArgs } from 'util';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const { values } = parseArgs({
  options: {
    query: { type: 'string', short: 'q' },
    limit: { type: 'string', short: 'l', default: '10' },
    threshold: { type: 'string', short: 't', default: '0.7' },
    collection: { type: 'string', short: 'c', default: 'limitless-lifelogs' },
    host: { type: 'string', short: 'h', default: 'http://localhost:8000' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help || !values.query) {
  console.log(`
Vector Search Tool - Search lifelogs using semantic similarity

Usage: vector-search.js --query "search text" [options]

Options:
  -q, --query      Search query text (required)
  -l, --limit      Maximum results to return (default: 10)
  -t, --threshold  Minimum similarity threshold 0-1 (default: 0.7)
  -c, --collection Collection name (default: limitless-lifelogs)
  -h, --host       ChromaDB host (default: http://localhost:8000)
  --help           Show this help message

Examples:
  vector-search.js -q "meeting about product roadmap"
  vector-search.js -q "action items" -l 20 -t 0.8
`);
  process.exit(values.help ? 0 : 1);
}

async function performVectorSearch() {
  try {
    // Initialize ChromaDB client
    const client = new ChromaClient({ path: values.host });
    const embedder = new DefaultEmbeddingFunction();

    // Get or create collection
    let collection;
    try {
      collection = await client.getCollection({
        name: values.collection,
        embeddingFunction: embedder,
      });
    } catch (error) {
      // Collection might not exist
      console.error(
        JSON.stringify({
          error: 'Collection not found',
          collection: values.collection,
          message: 'Ensure the vector store has been initialized',
        })
      );
      process.exit(1);
    }

    // Perform search
    const results = await collection.query({
      queryTexts: [values.query],
      nResults: parseInt(values.limit),
    });

    // Format results for Claude
    const formattedResults = {
      query: values.query,
      totalResults: results.ids[0]?.length || 0,
      results: [],
    };

    if (results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const distance = results.distances?.[0]?.[i] || 0;
        const similarity = 1 - distance;

        // Apply threshold
        if (similarity >= parseFloat(values.threshold)) {
          formattedResults.results.push({
            id: results.ids[0][i],
            similarity: similarity.toFixed(3),
            content: results.documents?.[0]?.[i] || '',
            metadata: results.metadatas?.[0]?.[i] || {},
          });
        }
      }
    }

    // Output JSON for Claude to parse
    console.log(JSON.stringify(formattedResults, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: 'Vector search failed',
        message: error.message,
        stack: error.stack,
      })
    );
    process.exit(1);
  }
}

// Execute search
performVectorSearch().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
