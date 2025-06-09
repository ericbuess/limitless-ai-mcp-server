#!/usr/bin/env node

import { FileManager } from '../dist/storage/file-manager.js';

async function quickLunchTest() {
  console.log('🍔 Quick Lunch Search Test\n');

  const fileManager = new FileManager({ baseDir: './data' });
  await fileManager.initialize();

  // Load the specific file we know contains the answer
  const targetId = 'K9G2oUoUqVqj3XmRAwvN';
  const targetDate = new Date('2025-06-09T17:37:05Z');
  const lifelog = await fileManager.loadLifelog(targetId, targetDate);

  if (lifelog) {
    console.log(`Analyzing lifelog: ${lifelog.title}\n`);

    const content = lifelog.content;

    // Extract key evidence
    console.log('🔍 Evidence Found:\n');

    // 1. Smoothie King
    const smoothieMatch = content.match(/Take me to (Smoothie King)[^.\n]*/i);
    if (smoothieMatch) {
      console.log('1. Smoothie King:');
      console.log(`   Quote: "${smoothieMatch[0]}"`);
      console.log('   → Eric (the speaker/driver) went to Smoothie King\n');
    }

    // 2. Chick-fil-A
    const chickMatches = content.match(/we stopped at (Chick-fil-A)[^.\n]*/i);
    if (chickMatches) {
      console.log('2. Chick-fil-A:');
      console.log(`   Quote: "${chickMatches[0]}"`);

      // Look for context about who
      const girlsMatch = content.match(/The girls needed to go to the bathroom/i);
      if (girlsMatch) {
        console.log('   Additional: "The girls needed to go to the bathroom"');
        console.log('   → Others (likely Jordan and Asa) ate at Chick-fil-A\n');
      }
    }

    // 3. Nuggets
    const nuggetsMatch = content.match(/dip your nuggets[^.\n]*/i);
    if (nuggetsMatch) {
      console.log('3. Food Details:');
      console.log(`   Quote: "${nuggetsMatch[0]}"`);
      console.log('   → Someone (likely Asa) had chicken nuggets with sauce\n');
    }

    console.log('\n📊 Correct Answer:');
    console.log('━'.repeat(50));
    console.log('1. Eric (user): Had Smoothie King');
    console.log('2. Jordan & Asa: Had Chick-fil-A');
    console.log('   - Asa specifically had nuggets with sauce');
  } else {
    console.log('❌ Could not load target lifelog');
  }
}

quickLunchTest().catch(console.error);
