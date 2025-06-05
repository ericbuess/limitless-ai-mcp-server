#!/usr/bin/env node

import { UnifiedSearchHandler } from '../../dist/search/unified-search.js';
// Removed LimitlessClient import - search is always local
import { FileManager } from '../../dist/storage/file-manager.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Extract a content window around the first match of query terms
 */
function extractContentWindow(content, query, windowSize = 150) {
  if (!content) return '';

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const contentLower = content.toLowerCase();

  // Find the best match position
  let bestIndex = -1;
  let matchedWord = '';

  for (const word of queryWords) {
    const index = contentLower.indexOf(word);
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      matchedWord = word;
    }
  }

  if (bestIndex === -1) {
    // No match found, return beginning of content
    return content.substring(0, windowSize * 2) + '...';
  }

  // Extract window around match
  const start = Math.max(0, bestIndex - windowSize);
  const end = Math.min(content.length, bestIndex + matchedWord.length + windowSize);

  let window = content.substring(start, end);

  // Add ellipsis if needed
  if (start > 0) window = '...' + window;
  if (end < content.length) window = window + '...';

  // Highlight the matched word
  const regex = new RegExp(`\\b(${queryWords.join('|')})\\b`, 'gi');
  window = window.replace(regex, `${colors.yellow}$1${colors.reset}`);

  return window;
}

async function search(query, options = {}) {
  const { limit = 10, showContent = true, strategy = 'auto' } = options;

  console.log(`\n${colors.cyan}Searching for: "${query}"${colors.reset}\n`);

  try {
    // Initialize components - search is always local, no API needed
    const fileManager = new FileManager({
      baseDir: './data',
      createIfMissing: false,
    });

    // Search should never use API
    const searchHandler = new UnifiedSearchHandler(fileManager, {
      enableVectorStore: true, // Enable vector store for better search
      enableClaude: false,
    });

    console.log('Initializing search handler...');
    await searchHandler.initialize();

    // Perform search using unified handler
    const result = await searchHandler.search(query, {
      strategy: strategy,
      limit: limit,
      includeContent: true,
      includeMetadata: true,
      enableQueryExpansion: true, // Enable for better results
    });

    if (result.results.length === 0) {
      console.log('No results found.');
      await searchHandler.stop();
      return;
    }

    console.log(
      `${colors.green}Found ${result.results.length} results${colors.reset} (${result.strategy} strategy, ${result.performance.searchTime}ms):\n`
    );

    // Display results
    for (let i = 0; i < result.results.length; i++) {
      const item = result.results[i];
      const lifelog = item.lifelog;

      console.log(`${colors.bright}${i + 1}. ${lifelog?.title || 'Untitled'}${colors.reset}`);
      console.log(`   Score: ${colors.yellow}${item.score.toFixed(3)}${colors.reset}`);
      console.log(
        `   Date: ${lifelog?.recordedAt ? new Date(lifelog.recordedAt).toLocaleString() : 'Unknown'}`
      );
      console.log(`   ID: ${colors.gray}${item.id}${colors.reset}`);

      if (showContent && lifelog?.content) {
        // Show content window around matches
        const contentWindow = extractContentWindow(lifelog.content, query, 150);
        console.log(`   ${colors.blue}Context:${colors.reset} ${contentWindow}`);
      }

      // Show highlights if available
      if (item.highlights && item.highlights.length > 0) {
        console.log(`   ${colors.blue}Highlights:${colors.reset}`);
        item.highlights.slice(0, 3).forEach((highlight) => {
          console.log(`     - ${highlight.trim()}`);
        });
      }

      console.log();
    }

    await searchHandler.stop();
  } catch (error) {
    console.error(`${colors.bright}Search error:${colors.reset}`, error.message);
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const queryArgs = [];
const options = {};

// Separate query from options
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=');
    if (key === 'limit') {
      options.limit = parseInt(value) || 10;
    } else if (key === 'strategy') {
      options.strategy = value;
    } else if (key === 'no-content') {
      options.showContent = false;
    }
  } else {
    queryArgs.push(arg);
  }
}

if (queryArgs.length === 0) {
  console.log(
    'Usage: search.js <query> [--limit=10] [--strategy=auto|fast|vector|hybrid] [--no-content]'
  );
  console.log('\nExamples:');
  console.log('  search.js "what did we eat for dinner yesterday"');
  console.log('  search.js doordash --limit=5');
  console.log('  search.js "meeting with Sarah" --strategy=fast');
  process.exit(1);
}

const query = queryArgs.join(' ');
search(query, options);
