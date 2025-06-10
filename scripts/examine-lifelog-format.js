#!/usr/bin/env node

import { FileManager } from '../dist/storage/file-manager.js';

async function examineLifelogFormat() {
  console.log('📄 Examining Lifelog Format\n');

  const fileManager = new FileManager({ baseDir: './data' });
  await fileManager.initialize();

  // Load recent lifelogs
  const allLifelogs = await fileManager.loadAllLifelogs();

  // Sort by date (newest first)
  const sortedLogs = allLifelogs.sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB - dateA;
  });

  // Examine the first few logs
  console.log('Recent lifelog examples:\n');

  for (let i = 0; i < Math.min(3, sortedLogs.length); i++) {
    const log = sortedLogs[i];
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Lifelog #${i + 1}`);
    console.log(`Date: ${log.date}`);
    console.log(`Title: ${log.title}`);
    console.log(`ID: ${log.id}`);
    console.log(`\nFirst 500 characters of content:`);
    console.log(log.content.substring(0, 500));
    console.log('...\n');

    // Look for speaker patterns
    const lines = log.content.split('\n').slice(0, 10);
    const speakerLines = lines.filter((line) => line.includes('Unknown') || line.includes(':'));

    if (speakerLines.length > 0) {
      console.log('Speaker lines found:');
      speakerLines.forEach((line) => {
        console.log(`  → ${line.substring(0, 100)}...`);
      });
    }
  }

  // Search for different speaker formats
  console.log('\n\n🔍 Searching for Speaker Patterns\n');

  const patterns = {
    'Unknown (date):': 0,
    'You:': 0,
    'YOU:': 0,
    'Me:': 0,
    'Eric:': 0,
    'Speaker [number]:': 0,
    'Person [number]:': 0,
  };

  for (const log of allLifelogs) {
    const content = log.content;

    // Count Unknown speaker pattern
    const unknownMatches = content.match(/Unknown \(\d+\/\d+\/\d+.*?\):/g);
    if (unknownMatches) {
      patterns['Unknown (date):'] += unknownMatches.length;
    }

    // Count other patterns
    if (content.includes('You:')) patterns['You:']++;
    if (content.includes('YOU:')) patterns['YOU:']++;
    if (content.includes('Me:')) patterns['Me:']++;
    if (content.includes('Eric:')) patterns['Eric:']++;
    if (content.match(/Speaker \d+:/)) patterns['Speaker [number]:']++;
    if (content.match(/Person \d+:/)) patterns['Person [number]:']++;
  }

  console.log('Pattern counts across all lifelogs:');
  for (const [pattern, count] of Object.entries(patterns)) {
    if (count > 0) {
      console.log(`  ${pattern} ${count} occurrences`);
    }
  }

  // Look for conversations
  console.log('\n\n💬 Analyzing Conversation Structure\n');

  let conversationSample = null;
  for (const log of sortedLogs.slice(0, 20)) {
    if (log.content.includes('Unknown') && log.content.split('Unknown').length > 5) {
      conversationSample = log;
      break;
    }
  }

  if (conversationSample) {
    console.log(`Found conversation in: ${conversationSample.title}`);
    console.log(`Date: ${conversationSample.date}\n`);

    // Extract first few exchanges
    const lines = conversationSample.content.split('\n');
    let exchanges = [];
    let currentExchange = '';

    for (const line of lines) {
      if (line.includes('Unknown (')) {
        if (currentExchange) {
          exchanges.push(currentExchange);
        }
        currentExchange = line;
      } else if (currentExchange && line.trim()) {
        currentExchange += ' ' + line.trim();
      }

      if (exchanges.length >= 5) break;
    }

    console.log('First few exchanges:');
    exchanges.forEach((exchange, i) => {
      console.log(`\n${i + 1}. ${exchange.substring(0, 150)}...`);
    });
  }
}

examineLifelogFormat().catch(console.error);
