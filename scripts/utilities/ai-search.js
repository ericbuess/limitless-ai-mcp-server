#!/usr/bin/env node

/**
 * AI-Powered Search Command
 * Uses the full AI assistant pipeline with Claude analysis
 * This is the primary search interface - always uses iterative memory search
 */

import { TaskExecutor } from '../../dist/tasks/task-executor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig() {
  const configPath = path.join(__dirname, '..', '..', 'config', 'assistant.json');
  const configContent = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(configContent);
}

async function main() {
  const query = process.argv.slice(2).join(' ');

  if (!query) {
    console.error('Usage: npm run search <your question>');
    console.error('Example: npm run search "what did I discuss about AI tools?"');
    process.exit(1);
  }

  console.log(`\n🤖 AI Assistant Search: "${query}"\n`);
  console.log('Using full AI pipeline with Claude analysis...\n');

  try {
    // Load the same config used by the monitoring service
    const config = await loadConfig();

    // Create a synthetic task that mimics what the monitoring service would create
    const task = {
      id: `cli-search-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'memory_search',
      trigger: {
        text: `Claudius, ${query}`,
        assessment: {
          taskType: 'memory_search',
          isValidRequest: true,
          confidence: 1.0,
          extractedRequest: query,
        },
      },
      lifelog: {
        id: 'cli-search',
        date: new Date().toISOString(),
        title: 'CLI Search Request',
      },
      createdAt: new Date().toISOString(),
    };

    // Initialize TaskExecutor with config
    const executor = new TaskExecutor(config);
    const result = await executor.execute(task);

    if (result.success && result.result) {
      console.log('\n✅ Answer found:\n');
      console.log(result.result.answer);
      console.log(`\n📊 Confidence: ${(result.result.confidence * 100).toFixed(0)}%`);
      console.log(`📁 Session: ${result.sessionId}`);
      if (result.result.sources?.length > 0) {
        console.log(`📚 Sources: ${result.result.sources.length} lifelogs analyzed`);
      }
    } else {
      console.error('\n❌ Search failed:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('claude')) {
      console.error('\n💡 Make sure Claude CLI is authenticated: claude auth login');
    }
    process.exit(1);
  }
}

main().catch(console.error);
