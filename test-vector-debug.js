#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = './dist/index.js';

async function startServer() {
  console.log('🚀 Starting MCP server with vector store...\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_PATH],
    env: {
      ...process.env,
      LIMITLESS_API_KEY: process.env.LIMITLESS_API_KEY || '***REMOVED***',
      LIMITLESS_ENABLE_VECTOR: 'true',
      CHROMADB_MODE: 'simple',
      LOG_LEVEL: 'DEBUG',
    },
  });

  const client = new Client(
    {
      name: 'vector-debug-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  // Wait for server to initialize
  await new Promise((resolve) => setTimeout(resolve, 8000));

  return client;
}

async function debugVector(client) {
  // First check what's in recent lifelogs
  console.log('📋 Checking recent lifelogs for birthday content...\n');

  const recentResult = await client.request({
    method: 'tools/call',
    params: {
      name: 'limitless_list_recent_lifelogs',
      arguments: { limit: 10 },
    },
  });

  const lifelogs = JSON.parse(recentResult.content[0].text).lifelogs;
  const birthdayLog = lifelogs.find(
    (log) =>
      log.title?.toLowerCase().includes('birthday') ||
      log.content?.toLowerCase().includes('birthday')
  );

  if (birthdayLog) {
    console.log('✅ Found birthday lifelog:');
    console.log(`   ID: ${birthdayLog.id}`);
    console.log(`   Title: ${birthdayLog.title}`);
    console.log(`   Content snippet: ${birthdayLog.content?.substring(0, 100)}...\n`);
  } else {
    console.log('❌ No birthday content found in recent lifelogs\n');
  }

  // Test semantic search with debug
  console.log('🔍 Testing semantic search...\n');

  const queries = [
    'happy birthday',
    'birthday celebration',
    'wishes someone happy birthday',
    'car maintenance toyota hulk',
  ];

  for (const query of queries) {
    try {
      const result = await client.request({
        method: 'tools/call',
        params: {
          name: 'limitless_semantic_search',
          arguments: {
            query: query,
            limit: 3,
            threshold: 0.3, // Lower threshold
          },
        },
      });

      const searchResult = JSON.parse(result.content[0].text);
      console.log(`Query: "${query}"`);
      console.log(`Results: ${searchResult.results.length}`);

      if (searchResult.results.length > 0) {
        searchResult.results.forEach((r, i) => {
          console.log(
            `  ${i + 1}. Score: ${r.score.toFixed(3)} - ${r.lifelog?.title || 'No title'}`
          );
        });
      }
      console.log('');
    } catch (error) {
      console.log(`Query: "${query}"`);
      console.log(`Error: ${error.message}\n`);
    }
  }
}

async function main() {
  let client;

  try {
    client = await startServer();
    console.log('✅ Server started successfully\n');

    await debugVector(client);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (client) {
      await client.close();
    }
    process.exit(0);
  }
}

main().catch(console.error);
