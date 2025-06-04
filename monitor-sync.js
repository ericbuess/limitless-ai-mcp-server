#!/usr/bin/env node

/**
 * Monitor sync service for new lifelog arrivals
 * This script watches for new data and generates summaries
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Configuration
const DATA_DIR = './data/lifelogs';
const CHECK_INTERVAL = 30000; // Check every 30 seconds
const CHECKPOINT_FILE = './data/sync-checkpoint.json';

// Track known lifelogs
let knownLifelogs = new Set();
let lastCheckpoint = null;

// Initialize known lifelogs
function initializeKnownLifelogs() {
  console.log('🔍 Initializing lifelog monitor...\n');

  try {
    // Walk through all date directories
    const years = fs.readdirSync(DATA_DIR).filter((d) => !d.startsWith('.'));

    for (const year of years) {
      const yearPath = path.join(DATA_DIR, year);
      const months = fs.readdirSync(yearPath);

      for (const month of months) {
        const monthPath = path.join(yearPath, month);
        const days = fs.readdirSync(monthPath);

        for (const day of days) {
          const dayPath = path.join(monthPath, day);
          const files = fs.readdirSync(dayPath).filter((f) => f.endsWith('.md'));

          files.forEach((file) => {
            const id = file.replace('.md', '');
            knownLifelogs.add(id);
          });
        }
      }
    }

    console.log(`📊 Found ${knownLifelogs.size} existing lifelogs\n`);
  } catch (error) {
    console.log('📁 No existing lifelogs found\n');
  }
}

// Check for new lifelogs
function checkForNewLifelogs() {
  const newLifelogs = [];

  try {
    // Read checkpoint to see sync progress
    const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));

    if (JSON.stringify(checkpoint) !== JSON.stringify(lastCheckpoint)) {
      console.log(`\n🔄 Sync Progress Update:`);
      console.log(`  Phase: ${checkpoint.phase}`);
      console.log(`  Current Date: ${checkpoint.currentDate}`);
      console.log(`  Total Downloaded: ${checkpoint.totalDownloaded}`);
      console.log(`  Storage Size: ${(checkpoint.storageSize / 1024 / 1024).toFixed(2)} MB`);

      if (checkpoint.errors && checkpoint.errors.length > 0) {
        console.log(`  ⚠️ Errors: ${checkpoint.errors.length}`);
      }

      lastCheckpoint = checkpoint;
    }

    // Check for new files
    const years = fs.readdirSync(DATA_DIR).filter((d) => !d.startsWith('.'));

    for (const year of years) {
      const yearPath = path.join(DATA_DIR, year);
      const months = fs.readdirSync(yearPath);

      for (const month of months) {
        const monthPath = path.join(yearPath, month);
        const days = fs.readdirSync(monthPath);

        for (const day of days) {
          const dayPath = path.join(monthPath, day);
          const files = fs.readdirSync(dayPath).filter((f) => f.endsWith('.md'));

          files.forEach((file) => {
            const id = file.replace('.md', '');
            if (!knownLifelogs.has(id)) {
              // New lifelog found!
              const filePath = path.join(dayPath, file);
              const metaPath = path.join(dayPath, file.replace('.md', '.meta.json'));

              newLifelogs.push({
                id,
                date: `${year}-${month}-${day}`,
                filePath,
                metaPath,
              });

              knownLifelogs.add(id);
            }
          });
        }
      }
    }

    // Process new lifelogs
    if (newLifelogs.length > 0) {
      console.log(`\n🎉 Found ${newLifelogs.length} new lifelog(s)!\n`);

      for (const lifelog of newLifelogs) {
        try {
          // Read metadata
          const metadata = JSON.parse(fs.readFileSync(lifelog.metaPath, 'utf8'));
          const content = fs.readFileSync(lifelog.filePath, 'utf8');

          console.log(`📝 New Recording: ${metadata.title || 'Untitled'}`);
          console.log(`   Date: ${new Date(metadata.createdAt).toLocaleString()}`);
          console.log(`   Duration: ${Math.round(metadata.duration / 60)} minutes`);
          console.log(`   ID: ${lifelog.id}`);

          // Generate simple summary (first 200 chars)
          const preview = content
            .replace(/^#.*$/gm, '') // Remove headings
            .replace(/\n+/g, ' ') // Replace newlines
            .trim()
            .substring(0, 200);

          console.log(`   Preview: "${preview}..."\n`);

          // TODO: Here you could:
          // - Send webhook notification
          // - Generate AI summary
          // - Update a dashboard
          // - Send email alert
        } catch (error) {
          console.error(`   ❌ Error reading lifelog: ${error.message}\n`);
        }
      }

      console.log('✅ All new lifelogs processed\n');
    }
  } catch (error) {
    // Ignore errors if checkpoint doesn't exist yet
  }
}

// Main monitoring loop
function startMonitoring() {
  console.log('🚀 Lifelog Monitor Started');
  console.log(`⏰ Checking every ${CHECK_INTERVAL / 1000} seconds for new data\n`);

  // Initial check
  checkForNewLifelogs();

  // Set up interval
  setInterval(checkForNewLifelogs, CHECK_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping monitor...');
  process.exit(0);
});

// Start the monitor
initializeKnownLifelogs();
startMonitoring();
