#!/usr/bin/env node

/**
 * Test MCP tools availability
 */

const { spawn } = require('child_process');

const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
};

const listToolsRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
};

async function testMCPTools() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      env: { ...process.env },
      stdio: 'pipe',
    });

    let output = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
      const lines = output.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);

            if (response.id === 1 && response.result) {
              console.log('✅ Server initialized successfully');
              // Now request tools list
              server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
            }

            if (response.id === 2 && response.result) {
              console.log(`\n📋 Available tools: ${response.result.tools.length}\n`);

              // List all tools
              response.result.tools.forEach((tool, index) => {
                console.log(`${index + 1}. ${tool.name}`);
                console.log(`   ${tool.description.split('\n')[0]}`);
              });

              // Check for Phase 2 tools
              const phase2Tools = [
                'limitless_advanced_search',
                'limitless_semantic_search',
                'limitless_analyze_lifelogs',
                'limitless_sync_status',
              ];

              const foundPhase2 = phase2Tools.filter((name) =>
                response.result.tools.some((tool) => tool.name === name)
              );

              console.log(`\n✅ Phase 2 tools found: ${foundPhase2.length}/4`);

              server.kill();
              resolve();
            }
          } catch (e) {
            // Ignore non-JSON output
          }
        }
      }
    });

    server.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    // Send initialization
    setTimeout(() => {
      server.stdin.write(JSON.stringify(initRequest) + '\n');
    }, 500);

    // Timeout
    setTimeout(() => {
      server.kill();
      reject(new Error('Test timed out'));
    }, 10000);
  });
}

// Load environment and run test
const env = process.env;
const envFile = require('fs').readFileSync('.env', 'utf8');
envFile.split('\n').forEach((line) => {
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  }
});

console.log('🧪 Testing MCP Tools Availability...\n');

testMCPTools()
  .then(() => console.log('\n✨ Test completed!'))
  .catch((err) => console.error('\n❌ Test failed:', err.message));
