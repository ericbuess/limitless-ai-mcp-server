#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkStatus() {
  console.log('🤖 Limitless AI Assistant Status\n');

  try {
    // Check checkpoint file
    const checkpointPath = path.join(__dirname, '..', 'data', 'trigger-checkpoint.json');
    let checkpoint = null;
    try {
      const checkpointContent = await fs.readFile(checkpointPath, 'utf-8');
      checkpoint = JSON.parse(checkpointContent);
    } catch {
      console.log('⚠️  No checkpoint found - assistant has not run yet\n');
    }

    if (checkpoint) {
      console.log('📊 Monitoring Status:');
      console.log(`   Last processed: ${new Date(checkpoint.lastProcessedTime).toLocaleString()}`);
      console.log(`   Last saved: ${new Date(checkpoint.lastSaved).toLocaleString()}`);
      console.log('');
    }

    // Check recent tasks
    const tasksDir = path.join(__dirname, '..', 'data', 'tasks');
    const today = new Date().toISOString().split('T')[0];
    const todayTasksDir = path.join(tasksDir, today);

    let todayTasks = [];
    try {
      const files = await fs.readdir(todayTasksDir);
      todayTasks = files.filter((f) => f.endsWith('.json'));
    } catch {
      // No tasks today
    }

    console.log("📋 Today's Tasks:");
    if (todayTasks.length === 0) {
      console.log('   No tasks executed today');
    } else {
      console.log(`   ${todayTasks.length} task(s) executed`);

      // Show recent tasks
      for (const file of todayTasks.slice(-5)) {
        const content = await fs.readFile(path.join(todayTasksDir, file), 'utf-8');
        const task = JSON.parse(content);
        const time = new Date(task.createdAt).toLocaleTimeString();
        const status = task.status === 'completed' ? '✅' : '❌';
        console.log(`   ${status} ${time} - ${task.type}`);
        if (task.result?.query) {
          console.log(`      Query: "${task.result.query.substring(0, 50)}..."`);
        }
      }
    }

    // Check search history
    const searchHistoryDir = path.join(__dirname, '..', 'data', 'search-history', today);
    let sessions = [];
    try {
      const dirs = await fs.readdir(searchHistoryDir);
      sessions = dirs.filter((d) => d.startsWith('session-'));
    } catch {
      // No searches today
    }

    console.log('\n🔍 Search Sessions Today:');
    if (sessions.length === 0) {
      console.log('   No search sessions today');
    } else {
      console.log(`   ${sessions.length} search session(s)`);

      // Show recent sessions
      for (const session of sessions.slice(-3)) {
        const queryPath = path.join(searchHistoryDir, session, 'query.txt');
        try {
          const query = await fs.readFile(queryPath, 'utf-8');
          console.log(`   • ${query.substring(0, 60)}...`);
        } catch {
          console.log(`   • Session ${session}`);
        }
      }
    }

    // Check cached answers
    const answersDir = path.join(__dirname, '..', 'data', 'answers');
    let answerCount = 0;
    try {
      const files = await fs.readdir(answersDir);
      answerCount = files.filter((f) => f.endsWith('.json')).length;
    } catch {
      // No answers cached
    }

    console.log('\n💾 Cache Status:');
    console.log(`   ${answerCount} cached answer(s)`);

    // Configuration
    const configPath = path.join(__dirname, '..', 'config', 'assistant.json');
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      console.log('\n⚙️  Configuration:');
      console.log(`   Trigger: "${config.trigger.keyword}"`);
      console.log(`   Poll interval: ${config.monitoring.pollInterval / 1000}s`);
      console.log(
        `   Enabled tasks: ${Object.entries(config.tasks)
          .filter(([_, t]) => t.enabled)
          .map(([k]) => k)
          .join(', ')}`
      );
    } catch {
      console.log('\n⚠️  Could not load configuration');
    }
  } catch (error) {
    console.error('❌ Error checking status:', error.message);
  }
}

// Run status check
checkStatus().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
