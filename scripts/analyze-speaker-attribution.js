#!/usr/bin/env node

import { FileManager } from '../dist/storage/file-manager.js';

async function analyzeSpeakerAttribution() {
  console.log('🎤 Analyzing Speaker Attribution in Lifelogs\n');

  const fileManager = new FileManager({ baseDir: './data' });
  await fileManager.initialize();

  // Load all lifelogs
  const allLifelogs = await fileManager.loadAllLifelogs();
  console.log(`Total lifelogs: ${allLifelogs.length}\n`);

  // Analyze speaker patterns
  const speakerStats = {
    totalLines: 0,
    youUppercase: 0,
    youLowercase: 0,
    youMixed: 0,
    unknown: 0,
    namedSpeakers: new Map(),
    speakerPatterns: new Set(),
  };

  // Sample some lifelogs for detailed analysis
  const sampleSize = Math.min(50, allLifelogs.length);
  const sampledLogs = [];

  for (let i = 0; i < allLifelogs.length; i += Math.floor(allLifelogs.length / sampleSize)) {
    const log = allLifelogs[i];
    const lines = log.content.split('\n');

    for (const line of lines) {
      // Look for speaker patterns like "Speaker: text" or "[Speaker] text"
      const speakerMatch = line.match(/^(\[([^\]]+)\]|([^:]+):)\s+(.+)/);

      if (speakerMatch) {
        speakerStats.totalLines++;
        const speaker = (speakerMatch[2] || speakerMatch[3] || '').trim();

        if (speaker === 'YOU') {
          speakerStats.youUppercase++;
        } else if (speaker === 'You') {
          speakerStats.youLowercase++;
        } else if (speaker.toLowerCase() === 'you') {
          speakerStats.youMixed++;
        } else if (speaker === 'Unknown' || speaker === 'UNKNOWN') {
          speakerStats.unknown++;
        } else if (speaker) {
          const count = speakerStats.namedSpeakers.get(speaker) || 0;
          speakerStats.namedSpeakers.set(speaker, count + 1);

          // Track the pattern
          if (speakerMatch[2]) {
            speakerStats.speakerPatterns.add('[Speaker]');
          } else {
            speakerStats.speakerPatterns.add('Speaker:');
          }
        }

        // Collect samples
        if (sampledLogs.length < 10 && (speaker === 'YOU' || speaker === 'You')) {
          sampledLogs.push({
            date: log.date,
            title: log.title.substring(0, 50),
            speaker,
            text: speakerMatch[4].substring(0, 80),
          });
        }
      }
    }
  }

  // Display results
  console.log('📊 Speaker Attribution Statistics\n');
  console.log(`Total lines with speakers: ${speakerStats.totalLines}`);
  console.log(`- YOU (uppercase): ${speakerStats.youUppercase}`);
  console.log(`- You (mixed case): ${speakerStats.youLowercase}`);
  console.log(`- you (other case): ${speakerStats.youMixed}`);
  console.log(`- Unknown speakers: ${speakerStats.unknown}`);
  console.log(`\nPatterns found: ${Array.from(speakerStats.speakerPatterns).join(', ')}`);

  console.log('\n👥 Named Speakers (top 20):');
  const sortedSpeakers = Array.from(speakerStats.namedSpeakers.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  for (const [speaker, count] of sortedSpeakers) {
    console.log(`  ${speaker}: ${count} lines`);
  }

  console.log('\n📝 Sample YOU/You Lines:');
  for (const sample of sampledLogs) {
    console.log(`\nDate: ${sample.date}`);
    console.log(`Title: ${sample.title}...`);
    console.log(`Speaker: ${sample.speaker}`);
    console.log(`Text: "${sample.text}..."`);
  }

  // Check for relationship mentions
  console.log('\n\n💑 Analyzing Relationship Mentions\n');

  const relationshipTerms = [
    'my wife',
    'my husband',
    'my daughter',
    'my son',
    'my kid',
    'my kids',
    'my children',
    'Ella',
    'Evy',
    'Emmy',
    'Asa',
    'Jordan',
  ];

  const relationshipStats = new Map();
  let sampledRelationships = [];

  for (const log of allLifelogs.slice(0, 100)) {
    // Check first 100 logs
    const content = log.content.toLowerCase();

    for (const term of relationshipTerms) {
      if (content.includes(term.toLowerCase())) {
        const count = relationshipStats.get(term) || 0;
        relationshipStats.set(term, count + 1);

        // Get context
        if (sampledRelationships.length < 5 && term.includes('wife')) {
          const index = content.indexOf(term.toLowerCase());
          const start = Math.max(0, index - 50);
          const end = Math.min(content.length, index + term.length + 50);
          const context = log.content.substring(start, end).replace(/\n/g, ' ');

          sampledRelationships.push({
            date: log.date,
            term,
            context: '...' + context + '...',
          });
        }
      }
    }
  }

  console.log('Relationship mentions found:');
  for (const [term, count] of relationshipStats.entries()) {
    if (count > 0) {
      console.log(`  "${term}": ${count} times`);
    }
  }

  console.log('\n📖 Sample contexts for "wife":');
  for (const sample of sampledRelationships) {
    console.log(`\nDate: ${sample.date}`);
    console.log(`Context: ${sample.context}`);
  }
}

analyzeSpeakerAttribution().catch(console.error);
