import { LanceDBStore } from '../../dist/vector-store/lancedb-store.js';
import { LimitlessClient } from '../../dist/core/limitless-client.js';

// Set API key
process.env.LIMITLESS_API_KEY = 'sk-a740f4f7-fb38-4a20-8286-43549ab21157';

async function search(query, options = {}) {
  const { limit = 5, showContent = true } = options;

  console.log(`\nSearching for: "${query}"\n`);

  try {
    // Initialize vector store
    const vectorStore = new LanceDBStore({
      path: './data/lancedb',
      collectionName: 'limitless-lifelogs',
    });
    await vectorStore.initialize();

    // Perform search
    const results = await vectorStore.searchByText(query, {
      topK: limit,
      includeMetadata: true,
      includeContent: showContent,
    });

    if (results.length === 0) {
      console.log('No results found.');
      return;
    }

    console.log(`Found ${results.length} results:\n`);

    // Display results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      console.log(`${i + 1}. ${result.metadata?.title || 'Untitled'}`);
      console.log(`   Score: ${result.score.toFixed(3)}`);
      console.log(
        `   Date: ${result.metadata?.date ? new Date(result.metadata.date).toLocaleString() : 'Unknown'}`
      );
      console.log(`   ID: ${result.id}`);

      if (showContent && result.content) {
        // Find relevant excerpt around the query terms
        const queryWords = query.toLowerCase().split(' ');
        const contentLower = result.content.toLowerCase();
        let excerpt = '';

        // Find first occurrence of any query word
        let bestIndex = -1;
        for (const word of queryWords) {
          const index = contentLower.indexOf(word);
          if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
            bestIndex = index;
          }
        }

        if (bestIndex !== -1) {
          // Extract context around the match
          const start = Math.max(0, bestIndex - 100);
          const end = Math.min(result.content.length, bestIndex + 200);
          excerpt = '...' + result.content.substring(start, end).trim() + '...';
        } else {
          // No exact match, show beginning
          excerpt = result.content.substring(0, 300).trim() + '...';
        }

        console.log(`   Excerpt: ${excerpt}`);
      }

      console.log();
    }

    // Optionally fetch full content for top result
    if (showContent && results.length > 0 && process.argv.includes('--full')) {
      console.log('--- Full content of top result ---\n');
      const client = new LimitlessClient({ apiKey: process.env.LIMITLESS_API_KEY });
      try {
        const fullLog = await client.getLifelogById(results[0].id);
        console.log(fullLog.content);
      } catch (error) {
        console.log('Could not fetch full content:', error.message);
      }
    }
  } catch (error) {
    console.error('Search error:', error.message);
  }
}

// Get query from command line
const args = process.argv.slice(2);
const query = args.filter((arg) => !arg.startsWith('--')).join(' ');

if (!query) {
  console.log('Usage: node search.js <query> [--limit N] [--full]');
  console.log('\nExamples:');
  console.log('  node search.js "chess game"');
  console.log('  node search.js "meeting about project" --limit 10');
  console.log('  node search.js "how did the game turn out" --full');
  process.exit(1);
}

// Parse options
const limitArg = args.find((arg) => arg.startsWith('--limit'));
const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : 5;

search(query, { limit, showContent: true }).then(() => process.exit(0));
