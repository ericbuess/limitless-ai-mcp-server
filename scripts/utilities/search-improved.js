#!/usr/bin/env node

import { UnifiedSearchHandler } from '../../dist/search/unified-search.js';
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
  red: '\x1b[31m',
};

/**
 * Extract multiple content windows around ALL matches of query terms
 */
function extractAllContentWindows(content, query, windowSize = 200) {
  if (!content) return [];

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const contentLower = content.toLowerCase();

  const windows = [];
  const foundMatches = new Set();

  // Find ALL matches for each query word
  for (const word of queryWords) {
    let searchIndex = 0;
    while (searchIndex < contentLower.length) {
      const index = contentLower.indexOf(word, searchIndex);
      if (index === -1) break;

      // Check if we already have a window near this position
      let alreadyCovered = false;
      for (const existingMatch of foundMatches) {
        if (Math.abs(index - existingMatch) < windowSize) {
          alreadyCovered = true;
          break;
        }
      }

      if (!alreadyCovered) {
        foundMatches.add(index);

        // Extract window around match
        const start = Math.max(0, index - windowSize);
        const end = Math.min(content.length, index + word.length + windowSize);

        let window = content.substring(start, end);

        // Add ellipsis if needed
        if (start > 0) window = '...' + window;
        if (end < content.length) window = window + '...';

        // Highlight ALL matched words in this window
        const regex = new RegExp(`\\b(${queryWords.join('|')})\\b`, 'gi');
        window = window.replace(regex, `${colors.yellow}$1${colors.reset}`);

        windows.push({
          position: index,
          matchedWord: word,
          window: window,
        });
      }

      searchIndex = index + 1;
    }
  }

  return windows.sort((a, b) => a.position - b.position);
}

async function searchImproved(query, options = {}) {
  const {
    limit = 50, // Increased default limit
    showAllContent = false,
    strategy = 'hybrid', // Default to hybrid for better results
    debug = true,
  } = options;

  console.log(`\n${colors.cyan}Enhanced Search for: "${query}"${colors.reset}\n`);

  try {
    // Initialize components
    const fileManager = new FileManager({
      baseDir: './data',
      createIfMissing: false,
    });

    const searchHandler = new UnifiedSearchHandler(fileManager, {
      enableVectorStore: true,
      enableClaude: false,
    });

    console.log('Initializing search handler...');
    const initStart = Date.now();
    await searchHandler.initialize();
    console.log(`Initialization took ${Date.now() - initStart}ms\n`);

    // Perform search with all strategies
    console.log(`Using ${colors.bright}${strategy}${colors.reset} strategy with limit ${limit}...`);
    const searchStart = Date.now();

    const result = await searchHandler.search(query, {
      strategy: strategy,
      limit: limit,
      includeContent: true,
      includeMetadata: true,
      enableQueryExpansion: true,
      enableCache: false, // Disable cache for testing
    });

    const searchTime = Date.now() - searchStart;

    if (result.results.length === 0) {
      console.log(`${colors.red}No results found.${colors.reset}`);
      await searchHandler.stop();
      return;
    }

    console.log(
      `${colors.green}Found ${result.results.length} results${colors.reset} in ${searchTime}ms\n`
    );

    // Group results by score ranges for better understanding
    const scoreRanges = {
      high: result.results.filter((r) => r.score >= 0.7),
      medium: result.results.filter((r) => r.score >= 0.4 && r.score < 0.7),
      low: result.results.filter((r) => r.score < 0.4),
    };

    console.log(`Score distribution:`);
    console.log(`  ${colors.green}High (≥0.7):${colors.reset} ${scoreRanges.high.length} results`);
    console.log(
      `  ${colors.yellow}Medium (0.4-0.7):${colors.reset} ${scoreRanges.medium.length} results`
    );
    console.log(`  ${colors.red}Low (<0.4):${colors.reset} ${scoreRanges.low.length} results\n`);

    // Display results with better formatting
    for (let i = 0; i < result.results.length; i++) {
      const item = result.results[i];
      const lifelog = item.lifelog;

      // Determine score color
      let scoreColor = colors.red;
      if (item.score >= 0.7) scoreColor = colors.green;
      else if (item.score >= 0.4) scoreColor = colors.yellow;

      console.log(`${colors.bright}${i + 1}. ${lifelog?.title || 'Untitled'}${colors.reset}`);
      console.log(`   Score: ${scoreColor}${item.score.toFixed(3)}${colors.reset}`);

      // Fix date display - use createdAt instead of recordedAt
      const dateStr = lifelog?.createdAt || lifelog?.recordedAt;
      console.log(
        `   Date: ${dateStr ? new Date(dateStr).toLocaleString() : colors.red + 'Unknown' + colors.reset}`
      );
      console.log(`   ID: ${colors.gray}${item.id}${colors.reset}`);

      // Show which strategies found this result
      if (debug && item.metadata?.strategies) {
        console.log(
          `   Found by: ${colors.cyan}${item.metadata.strategies.join(', ')}${colors.reset}`
        );
      }

      if (lifelog?.content) {
        // Show ALL content windows with matches
        const windows = extractAllContentWindows(lifelog.content, query);

        if (windows.length > 0) {
          console.log(`   ${colors.blue}Matches (${windows.length} found):${colors.reset}`);
          windows.forEach((w, idx) => {
            console.log(`     ${idx + 1}. [pos ${w.position}, word: "${w.matchedWord}"]`);
            console.log(`        ${w.window}`);
          });
        } else if (showAllContent) {
          // Show beginning of content if no direct matches (semantic/vector match)
          console.log(`   ${colors.blue}Content preview (semantic match):${colors.reset}`);
          const preview = lifelog.content.substring(0, 400);
          console.log(`     ${preview}${lifelog.content.length > 400 ? '...' : ''}`);
        }
      }

      // Show highlights if available
      if (item.highlights && item.highlights.length > 0) {
        console.log(`   ${colors.blue}System highlights:${colors.reset}`);
        item.highlights.forEach((highlight) => {
          console.log(`     - ${highlight.trim()}`);
        });
      }

      // Show metadata if available
      if (debug && item.metadata) {
        const relevantMeta = Object.entries(item.metadata)
          .filter(([k, v]) => k !== 'strategies' && v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${v}`);
        if (relevantMeta.length > 0) {
          console.log(`   ${colors.gray}Metadata: ${relevantMeta.join(', ')}${colors.reset}`);
        }
      }

      console.log();
    }

    // Summary for AI ranking
    console.log(`\n${colors.bright}Summary for AI Ranking:${colors.reset}`);
    console.log(`Total results: ${result.results.length}`);
    console.log(`Search query: "${query}"`);
    console.log(`Strategy used: ${result.strategy}`);
    console.log(`Performance: ${result.performance.searchTime}ms`);

    await searchHandler.stop();
  } catch (error) {
    console.error(`${colors.bright}${colors.red}Search error:${colors.reset}`, error.message);
    if (process.env.DEBUG || options.debug) {
      console.error(error.stack);
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
      options.limit = parseInt(value) || 50;
    } else if (key === 'strategy') {
      options.strategy = value;
    } else if (key === 'show-all') {
      options.showAllContent = true;
    } else if (key === 'debug') {
      options.debug = value !== 'false';
    }
  } else {
    queryArgs.push(arg);
  }
}

if (queryArgs.length === 0) {
  console.log('Usage: search-improved.js <query> [options]');
  console.log('\nOptions:');
  console.log('  --limit=50         Number of results (default: 50)');
  console.log('  --strategy=hybrid  Search strategy: auto|fast|vector|hybrid (default: hybrid)');
  console.log('  --show-all         Show content preview for all results');
  console.log('  --debug=true       Show debug information (default: true)');
  console.log('\nExamples:');
  console.log('  search-improved.js "lunch today Switch Mario Kart"');
  console.log('  search-improved.js "David chess Metroid" --limit=100');
  console.log('  search-improved.js "what games did we discuss" --strategy=vector --show-all');
  process.exit(1);
}

const query = queryArgs.join(' ');
searchImproved(query, options);
