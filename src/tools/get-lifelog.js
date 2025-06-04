#!/usr/bin/env node

/**
 * Get Lifelog Tool - Fetch lifelog content by ID or date
 * Usage: get-lifelog.js --id "lifelog-id" --date "2024-01-15" [--format json|markdown]
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const { values } = parseArgs({
  options: {
    id: { type: 'string', short: 'i' },
    date: { type: 'string', short: 'd' },
    format: { type: 'string', short: 'f', default: 'json' },
    dataDir: { type: 'string', default: './data/lifelogs' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help || !values.id || !values.date) {
  console.log(`
Get Lifelog Tool - Fetch lifelog content by ID and date

Usage: get-lifelog.js --id "lifelog-id" --date "2024-01-15" [options]

Options:
  -i, --id       Lifelog ID (required)
  -d, --date     Date in YYYY-MM-DD format (required)
  -f, --format   Output format: json or markdown (default: json)
  --dataDir      Data directory path (default: ./data/lifelogs)
  --help         Show this help message

Examples:
  get-lifelog.js -i "abc123" -d "2024-01-15"
  get-lifelog.js -i "xyz789" -d "2024-01-15" -f markdown

Output:
  JSON format includes parsed metadata and content
  Markdown format returns raw markdown file content
`);
  process.exit(values.help ? 0 : 1);
}

function parseDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return { year, month, day };
}

function parseMarkdownToLifelog(content, metadata) {
  const lines = content.split('\n');
  const title = lines[0].replace('# Lifelog: ', '').trim();

  // Extract metadata from markdown
  const idMatch = content.match(/\*\*ID:\*\* (.+)/);
  const dateMatch = content.match(/\*\*Date:\*\* (.+)/);
  const durationMatch = content.match(/\*\*Duration:\*\* (\d+) minutes/);

  const id = idMatch ? idMatch[1] : metadata?.id || values.id;
  const createdAt = dateMatch
    ? new Date(dateMatch[1]).toISOString()
    : metadata?.date || new Date().toISOString();
  const duration = durationMatch ? parseInt(durationMatch[1]) * 60 : metadata?.duration || 0;

  // Extract content (everything after the --- separator)
  const contentStart = lines.findIndex((line) => line === '---') + 2;
  const headingsStart = lines.findIndex((line) => line === '## Headings');

  let mainContent = '';
  let headings = [];

  if (headingsStart > -1) {
    mainContent = lines.slice(contentStart, headingsStart).join('\n').trim();
    const headingLines = lines.slice(headingsStart + 2);
    headings = headingLines
      .filter((line) => line.startsWith('- '))
      .map((line) => line.substring(2));
  } else {
    mainContent = lines.slice(contentStart).join('\n').trim();
  }

  return {
    id,
    title,
    content: mainContent,
    createdAt,
    duration,
    headings,
    metadata: metadata || {},
  };
}

async function getLifelog() {
  try {
    // Parse date
    const { year, month, day } = parseDate(values.date);

    // Construct file paths
    const mdPath = join(values.dataDir, year, month, day, `${values.id}.md`);
    const metaPath = join(values.dataDir, year, month, day, `${values.id}.meta.json`);

    // Check if markdown file exists
    if (!existsSync(mdPath)) {
      console.error(
        JSON.stringify({
          error: 'Lifelog not found',
          id: values.id,
          date: values.date,
          path: mdPath,
        })
      );
      process.exit(1);
    }

    // Read markdown content
    const mdContent = readFileSync(mdPath, 'utf8');

    // Read metadata if available
    let metadata = null;
    if (existsSync(metaPath)) {
      try {
        metadata = JSON.parse(readFileSync(metaPath, 'utf8'));
      } catch (error) {
        // Metadata parsing failed, continue without it
      }
    }

    // Output based on format
    if (values.format === 'markdown') {
      console.log(mdContent);
    } else {
      // Parse and output as JSON
      const lifelog = parseMarkdownToLifelog(mdContent, metadata);
      console.log(JSON.stringify(lifelog, null, 2));
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        error: 'Failed to get lifelog',
        message: error.message,
        id: values.id,
        date: values.date,
      })
    );
    process.exit(1);
  }
}

// Execute
getLifelog().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
