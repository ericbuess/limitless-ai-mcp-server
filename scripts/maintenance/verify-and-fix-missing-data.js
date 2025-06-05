#!/usr/bin/env node

/**
 * Verify and fix missing data in sync
 * This script checks for missing dates and re-downloads them
 */

const { LimitlessClient } = require('./dist/core/limitless-client.js');
const { FileManager } = require('./dist/storage/file-manager.js');
const fs = require('fs');
const path = require('path');

// Configuration
const apiKey = process.env.LIMITLESS_API_KEY || 'sk-a740f4f7-fb38-4a20-8286-43549ab21157';

async function findMissingDates() {
  console.log('🔍 Checking for missing dates in June 2025...\n');

  const fileManager = new FileManager({
    baseDir: './data',
    enableEmbeddings: true,
    enableMetadata: true,
  });

  await fileManager.initialize();

  // Check June 2025 specifically
  const year = '2025';
  const month = '06';
  const missingDates = [];

  // Check each day of June
  for (let day = 1; day <= 30; day++) {
    const dayStr = day.toString().padStart(2, '0');
    const dirPath = path.join('./data/lifelogs', year, month, dayStr);

    if (!fs.existsSync(dirPath)) {
      missingDates.push(`${year}-${month}-${dayStr}`);
    } else {
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
      console.log(`✓ ${year}-${month}-${dayStr}: ${files.length} lifelogs`);
    }
  }

  if (missingDates.length > 0) {
    console.log('\n❌ Missing dates:', missingDates.join(', '));
  }

  return missingDates;
}

async function downloadMissingDates(missingDates) {
  if (missingDates.length === 0) {
    console.log('\n✅ No missing dates to download!');
    return;
  }

  console.log(`\n📥 Downloading data for ${missingDates.length} missing dates...\n`);

  const client = new LimitlessClient({ apiKey });
  const fileManager = new FileManager({
    baseDir: './data',
    enableEmbeddings: true,
    enableMetadata: true,
  });

  await fileManager.initialize();

  let totalDownloaded = 0;

  for (const date of missingDates) {
    console.log(`\n🔄 Checking ${date}...`);

    try {
      // Fetch lifelogs for this specific date
      const lifelogs = await client.listLifelogsByDate(date, {
        includeMarkdown: true,
        includeHeadings: true,
      });

      if (lifelogs.length > 0) {
        console.log(`  Found ${lifelogs.length} lifelogs`);

        // Save each lifelog
        for (const apiLifelog of lifelogs) {
          // Convert to Phase2 format
          const lifelog = {
            id: apiLifelog.id,
            title: apiLifelog.title || 'Untitled',
            content: apiLifelog.markdown || '',
            createdAt: apiLifelog.startTime,
            endTime: apiLifelog.endTime,
            duration:
              apiLifelog.endTime && apiLifelog.startTime
                ? (new Date(apiLifelog.endTime).getTime() -
                    new Date(apiLifelog.startTime).getTime()) /
                  1000
                : 0,
            headings: apiLifelog.contents || [],
          };

          await fileManager.saveLifelog(lifelog);
          console.log(`  ✓ Saved: ${lifelog.id} - ${lifelog.title}`);
          totalDownloaded++;
        }
      } else {
        console.log(`  No lifelogs found for ${date}`);
      }

      // Respectful delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`  ❌ Error downloading ${date}:`, error.message);
    }
  }

  console.log(`\n✅ Downloaded ${totalDownloaded} lifelogs total`);
}

async function main() {
  try {
    console.log('🔧 Missing Data Recovery Tool\n');

    // Find missing dates
    const missingDates = await findMissingDates();

    // Download missing data
    await downloadMissingDates(missingDates);

    // Re-check
    console.log('\n🔍 Final verification:');
    await findMissingDates();

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the tool
main();
