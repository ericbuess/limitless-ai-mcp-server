#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');

// Load environment
const envFile = fs.readFileSync('.env', 'utf8');
const env = { ...process.env };
envFile.split('\n').forEach((line) => {
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    if (key && value) {
      env[key.trim()] = value.trim();
    }
  }
});

// Enable vector store with simple mode
env.LIMITLESS_ENABLE_VECTOR = 'true';
env.CHROMADB_MODE = 'simple';

console.log('🧪 Testing Vector Store Implementation\n');
console.log('Configuration:');
console.log('  LIMITLESS_API_KEY:', env.LIMITLESS_API_KEY ? '✓ Set' : '✗ Missing');
console.log('  LIMITLESS_ENABLE_VECTOR:', env.LIMITLESS_ENABLE_VECTOR);
console.log('  CHROMADB_MODE:', env.CHROMADB_MODE);
console.log();

// Test semantic search via MCP protocol
const server = spawn('node', ['dist/index.js'], { env, stdio: 'pipe' });

const requests = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  },
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'limitless_semantic_search',
      arguments: {
        query: 'birthday celebration wishes for someone',
        limit: 3,
      },
    },
  },
];

let output = '';
let errors = '';

server.stdout.on('data', (data) => {
  output += data.toString();
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.trim() && line.startsWith('{')) {
      try {
        const response = JSON.parse(line);

        if (response.id === 1 && response.result) {
          console.log('✅ Server initialized\n');
          // Send semantic search request
          server.stdin.write(JSON.stringify(requests[1]) + '\n');
        }

        if (response.id === 2) {
          if (response.error) {
            console.log('❌ Semantic search error:', response.error.message);
          } else if (response.result) {
            console.log('✅ Semantic search successful!\n');
            const content = response.result.content[0].text;
            console.log(content.substring(0, 500) + '...');
          }
          server.kill();
        }
      } catch (e) {
        // Ignore non-JSON
      }
    }
  }
});

server.stderr.on('data', (data) => {
  errors += data.toString();
});

// Send initialization after server starts
setTimeout(() => {
  server.stdin.write(JSON.stringify(requests[0]) + '\n');
}, 1000);

// Handle timeout
setTimeout(() => {
  console.log('\n❌ Test timed out');
  console.log('\nServer logs:');
  console.log(
    errors
      .split('\n')
      .filter((l) => l.includes('vector') || l.includes('Vector'))
      .join('\n')
  );
  server.kill();
}, 10000);

server.on('close', () => {
  console.log('\n📊 Summary:');
  console.log('The simple vector store should be working as a fallback when ChromaDB fails.');
  console.log('If semantic search is still unavailable, the MCP server may need to be restarted.');
});
