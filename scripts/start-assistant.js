#!/usr/bin/env node

import { TriggerMonitor } from '../dist/monitoring/trigger-monitor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'assistant.json');
  const configContent = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(configContent);
}

async function main() {
  console.log('🤖 Limitless AI Assistant Starting...\n');

  try {
    // Load configuration
    const config = await loadConfig();
    console.log(`✅ Configuration loaded`);
    console.log(`📍 Trigger keyword: "${config.trigger.keyword}"`);
    console.log(`⏱️  Poll interval: ${config.monitoring.pollInterval / 1000} seconds`);
    console.log(`🔍 Lookback time: ${config.monitoring.lookbackMinutes} minutes\n`);

    // Initialize monitor
    const monitor = new TriggerMonitor(config);

    // Start monitoring
    await monitor.start();

    console.log('\n✨ Assistant is now monitoring for triggers');
    console.log('Press Ctrl+C to stop\n');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down assistant...');
      await monitor.stop();
      console.log('✅ Assistant stopped successfully');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await monitor.stop();
      process.exit(0);
    });

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    console.error('❌ Failed to start assistant:', error.message);
    console.error('\nPlease ensure:');
    console.error('1. You have run "npm run sync:all" to download lifelogs');
    console.error('2. The config/assistant.json file exists');
    console.error('3. Claude CLI is installed and authenticated (run "claude auth login")');
    process.exit(1);
  }
}

// Run the assistant
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
