#!/usr/bin/env node

/**
 * Analyze Results Tool - Merge and rank search results from multiple sources
 * Usage: analyze-results.js --vector-results file.json --text-results file.json [options]
 */

import { readFileSync } from 'fs';
import { parseArgs } from 'util';

// Parse command line arguments
const { values } = parseArgs({
  options: {
    vectorResults: { type: 'string', short: 'v' },
    textResults: { type: 'string', short: 't' },
    strategy: { type: 'string', short: 's', default: 'weighted' },
    vectorWeight: { type: 'string', default: '0.6' },
    textWeight: { type: 'string', default: '0.4' },
    limit: { type: 'string', short: 'l', default: '20' },
    dedup: { type: 'boolean', default: true },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`
Analyze Results Tool - Merge and rank search results

Usage: analyze-results.js [options]

Options:
  -v, --vectorResults   Path to vector search results JSON
  -t, --textResults     Path to text search results JSON
  -s, --strategy        Ranking strategy: weighted, vector-first, text-first (default: weighted)
  --vectorWeight        Weight for vector results 0-1 (default: 0.6)
  --textWeight          Weight for text results 0-1 (default: 0.4)
  -l, --limit           Maximum results to return (default: 20)
  --dedup               Deduplicate results (default: true)
  --help                Show this help message

Strategies:
  weighted      - Combine scores using weights
  vector-first  - Prioritize vector results, fall back to text
  text-first    - Prioritize text results, fall back to vector

Examples:
  analyze-results.js -v vector.json -t text.json
  analyze-results.js -v vector.json -t text.json -s vector-first
  analyze-results.js -v vector.json -t text.json --vectorWeight 0.8 --textWeight 0.2

Input Format:
  Reads results from stdin if no files specified
  Can also pipe results: echo '{}' | analyze-results.js
`);
  process.exit(0);
}

function readResults(source) {
  if (source === '-' || !source) {
    // Read from stdin
    const stdin = readFileSync(0, 'utf8');
    return JSON.parse(stdin);
  } else {
    // Read from file
    const content = readFileSync(source, 'utf8');
    return JSON.parse(content);
  }
}

function normalizeVectorResult(result) {
  return {
    id: result.id,
    score: parseFloat(result.similarity || result.score || 0),
    type: 'vector',
    content: result.content || '',
    metadata: result.metadata || {},
  };
}

function normalizeTextResult(result, index, total) {
  // Calculate score based on position (earlier = higher score)
  const positionScore = 1 - index / total;

  return {
    id: result.id,
    score: positionScore,
    type: 'text',
    content: result.text || '',
    metadata: {
      file: result.file,
      line: result.line,
    },
  };
}

function mergeResults(vectorResults, textResults, options) {
  const { strategy, vectorWeight, textWeight, dedup } = options;
  const vWeight = parseFloat(vectorWeight);
  const tWeight = parseFloat(textWeight);

  // Normalize results
  const normalizedVector = (vectorResults.results || []).map(normalizeVectorResult);
  const normalizedText = (textResults.results || []).map((r, i, arr) =>
    normalizeTextResult(r, i, arr.length)
  );

  // Create a map to track results by ID
  const resultMap = new Map();

  // Process based on strategy
  switch (strategy) {
    case 'vector-first':
      // Add all vector results first
      normalizedVector.forEach((result) => {
        resultMap.set(result.id, result);
      });
      // Add text results only if not already present
      normalizedText.forEach((result) => {
        if (!resultMap.has(result.id)) {
          resultMap.set(result.id, result);
        }
      });
      break;

    case 'text-first':
      // Add all text results first
      normalizedText.forEach((result) => {
        resultMap.set(result.id, result);
      });
      // Add vector results only if not already present
      normalizedVector.forEach((result) => {
        if (!resultMap.has(result.id)) {
          resultMap.set(result.id, result);
        }
      });
      break;

    case 'weighted':
    default:
      // Combine scores for matching results
      normalizedVector.forEach((result) => {
        resultMap.set(result.id, {
          ...result,
          score: result.score * vWeight,
          sources: ['vector'],
        });
      });

      normalizedText.forEach((result) => {
        if (resultMap.has(result.id)) {
          // Combine scores
          const existing = resultMap.get(result.id);
          existing.score += result.score * tWeight;
          existing.sources.push('text');
          existing.textMetadata = result.metadata;
        } else {
          // Add new result
          resultMap.set(result.id, {
            ...result,
            score: result.score * tWeight,
            sources: ['text'],
          });
        }
      });
      break;
  }

  // Convert to array and sort by score
  let results = Array.from(resultMap.values()).sort((a, b) => b.score - a.score);

  // Apply limit
  const limit = parseInt(options.limit);
  if (limit > 0) {
    results = results.slice(0, limit);
  }

  return results;
}

async function analyzeResults() {
  try {
    let vectorResults = { results: [] };
    let textResults = { results: [] };

    // Read results from files or stdin
    if (values.vectorResults) {
      vectorResults = readResults(values.vectorResults);
    }

    if (values.textResults) {
      textResults = readResults(values.textResults);
    }

    // If no files specified, try to read combined results from stdin
    if (!values.vectorResults && !values.textResults) {
      const stdinData = readResults('-');
      if (stdinData.vectorResults) vectorResults = stdinData.vectorResults;
      if (stdinData.textResults) textResults = stdinData.textResults;
    }

    // Merge and rank results
    const mergedResults = mergeResults(vectorResults, textResults, values);

    // Prepare output
    const output = {
      strategy: values.strategy,
      weights: {
        vector: parseFloat(values.vectorWeight),
        text: parseFloat(values.textWeight),
      },
      totalResults: mergedResults.length,
      results: mergedResults.map((result, index) => ({
        rank: index + 1,
        id: result.id,
        score: result.score.toFixed(3),
        type: result.type,
        sources: result.sources || [result.type],
        content: result.content,
        metadata: result.metadata,
        textMetadata: result.textMetadata,
      })),
    };

    // Output JSON
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: 'Failed to analyze results',
        message: error.message,
        stack: error.stack,
      })
    );
    process.exit(1);
  }
}

// Execute
analyzeResults().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
