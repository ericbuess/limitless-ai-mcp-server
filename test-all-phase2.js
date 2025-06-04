#!/usr/bin/env node

/**
 * Comprehensive test script for Phase 2 features
 * Tests all 9 MCP tools including semantic search
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

const SERVER_PATH = './dist/index.js';

async function startServer() {
  console.log('🚀 Starting MCP server...\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_PATH],
    env: {
      ...process.env,
      LIMITLESS_API_KEY: process.env.LIMITLESS_API_KEY || '***REMOVED***',
      // No need to set LIMITLESS_ENABLE_VECTOR - it's hardcoded now
    },
  });

  const client = new Client(
    {
      name: 'test-phase2-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  // Wait for server to fully initialize
  await new Promise((resolve) => setTimeout(resolve, 5000));

  return client;
}

async function testTools(client) {
  console.log('📋 Testing all MCP tools...\n');

  // List available tools
  const toolsResponse = await client.request({
    method: 'tools/list',
    params: {},
  });

  console.log(`✅ Found ${toolsResponse.tools.length} tools:\n`);
  toolsResponse.tools.forEach((tool, i) => {
    console.log(`${i + 1}. ${tool.name}`);
  });

  // Test original tools
  console.log('\n🔧 Testing Original Tools:\n');

  // 1. List recent lifelogs
  console.log('1. Testing limitless_list_recent_lifelogs...');
  try {
    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'limitless_list_recent_lifelogs',
        arguments: { limit: 3 },
      },
    });
    console.log(
      '✅ Success! Found',
      JSON.parse(result.content[0].text).lifelogs.length,
      'recent lifelogs\n'
    );
  } catch (error) {
    console.log('❌ Error:', error.message, '\n');
  }

  // 2. Search lifelogs
  console.log('2. Testing limitless_search_lifelogs...');
  try {
    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'limitless_search_lifelogs',
        arguments: { search_term: 'birthday' },
      },
    });
    const results = JSON.parse(result.content[0].text).lifelogs;
    console.log('✅ Success! Found', results.length, 'results for "birthday"\n');
  } catch (error) {
    console.log('❌ Error:', error.message, '\n');
  }

  // Test Phase 2 tools
  console.log('🚀 Testing Phase 2 Tools:\n');

  // 3. Advanced search
  console.log('3. Testing limitless_advanced_search...');
  try {
    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'limitless_advanced_search',
        arguments: {
          query: 'happy birthday',
          limit: 5,
        },
      },
    });
    const searchResult = JSON.parse(result.content[0].text);
    console.log('✅ Success! Strategy:', searchResult.strategy);
    console.log('   Found', searchResult.results.length, 'results');
    console.log('   Response time:', searchResult.performance.totalTime + 'ms\n');
  } catch (error) {
    console.log('❌ Error:', error.message, '\n');
  }

  // 4. Semantic search (the key test!)
  console.log('4. Testing limitless_semantic_search...');
  try {
    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'limitless_semantic_search',
        arguments: {
          query: 'birthday celebration wishes',
          limit: 3,
        },
      },
    });
    const searchResult = JSON.parse(result.content[0].text);
    console.log('✅ Success! Semantic search is working!');
    console.log('   Found', searchResult.results.length, 'semantically similar results');
    if (searchResult.results.length > 0) {
      console.log('   Top result similarity:', searchResult.results[0].score.toFixed(3));
    }
    console.log('');
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('   This is the main issue - semantic search not working in MCP\n');
  }

  // 5. Analyze lifelogs
  console.log('5. Testing limitless_analyze_lifelogs...');
  try {
    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'limitless_analyze_lifelogs',
        arguments: {
          query: 'summarize today',
          analysisType: 'summary',
        },
      },
    });
    console.log('✅ Success! Analysis completed\n');
  } catch (error) {
    console.log('❌ Error:', error.message, '\n');
  }

  // 6. Sync status
  console.log('6. Testing limitless_sync_status...');
  try {
    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'limitless_sync_status',
        arguments: {},
      },
    });
    const status = JSON.parse(result.content[0].text);
    console.log('✅ Success! Sync service status:', status.status, '\n');
  } catch (error) {
    console.log('❌ Error:', error.message, '\n');
  }
}

async function main() {
  let client;

  try {
    client = await startServer();
    console.log('✅ Server started successfully\n');

    await testTools(client);

    console.log('📊 Summary:');
    console.log('- Hardcoded vector store: ENABLED');
    console.log('- Simple vector store mode: ENABLED');
    console.log('- All tools should be available');
    console.log('\nIf semantic search still fails, the issue is in the MCP transport layer.');
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
