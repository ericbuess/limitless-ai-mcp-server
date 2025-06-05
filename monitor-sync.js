#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Monitor sync status
const checkpointPath = path.join(__dirname, 'data', 'sync-checkpoint.json');
const lifelogsDir = path.join(__dirname, 'data', 'lifelogs');

let lastStatus = {};
let lastFileCount = 0;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function countFiles(dir) {
  let count = 0;
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        count += countFiles(fullPath);
      } else if (item.name.endsWith('.md')) {
        count++;
      }
    }
  } catch (err) {
    // Ignore errors
  }
  return count;
}

function checkStatus() {
  try {
    // Read checkpoint
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

    // Count files
    const fileCount = countFiles(lifelogsDir);

    // Check for changes
    const hasChanged =
      JSON.stringify(lastStatus) !== JSON.stringify(checkpoint) || fileCount !== lastFileCount;

    if (hasChanged) {
      console.clear();
      console.log('🔄 Limitless Sync Monitor');
      console.log('========================\n');

      console.log(
        `📊 Status: ${checkpoint.phase === 'monitor' ? '✅ Monitoring' : '⏬ Downloading'}`
      );
      console.log(`📁 Total Downloaded: ${checkpoint.totalDownloaded} lifelogs`);
      console.log(`🗂️  Files on Disk: ${fileCount} MD files`);
      console.log(`💾 Storage Size: ${formatBytes(checkpoint.storageSize)}`);
      console.log(`🔢 Vectorized: ${checkpoint.totalVectorized}`);

      if (checkpoint.oldestDate && checkpoint.newestDate) {
        console.log(`\n📅 Date Range:`);
        console.log(`   Oldest: ${new Date(checkpoint.oldestDate).toLocaleString()}`);
        console.log(`   Newest: ${new Date(checkpoint.newestDate).toLocaleString()}`);
      }

      if (checkpoint.phase === 'download') {
        console.log(`\n⏳ Current Progress:`);
        console.log(`   Processing: ${checkpoint.currentDate}`);
        console.log(`   Batches: ${checkpoint.processedBatches.length}`);
      }

      if (checkpoint.errors && checkpoint.errors.length > 0) {
        console.log(`\n❌ Errors: ${checkpoint.errors.length}`);
        checkpoint.errors.slice(-3).forEach((err) => {
          console.log(`   - ${err}`);
        });
      }

      console.log(`\n🕐 Last Update: ${new Date(checkpoint.lastCheckpoint).toLocaleTimeString()}`);

      if (checkpoint.phase === 'monitor') {
        console.log('\n✨ System is now monitoring for new recordings every 60 seconds');
      }

      lastStatus = checkpoint;
      lastFileCount = fileCount;
    }
  } catch (err) {
    console.log(`⚠️  Waiting for sync to start... (${err.message})`);
  }
}

// Initial check
checkStatus();

// Check every 2 seconds
setInterval(checkStatus, 2000);

console.log('🚀 Monitor started. Press Ctrl+C to stop.\n');
