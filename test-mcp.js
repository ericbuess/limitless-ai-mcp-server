const { spawn } = require('child_process');
const fs = require('fs');

// Load environment
const envFile = fs.readFileSync('.env', 'utf8');
envFile.split('\n').forEach((line) => {
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  }
});

// Enable vector store
process.env.LIMITLESS_ENABLE_VECTOR = 'true';
process.env.CHROMADB_MODE = 'memory';
process.env.CHROMADB_URL = 'memory';

console.log('Testing MCP Server with Vector Store...\n');
console.log('Environment:');
console.log(`  LIMITLESS_ENABLE_VECTOR: ${process.env.LIMITLESS_ENABLE_VECTOR}`);
console.log(`  CHROMADB_MODE: ${process.env.CHROMADB_MODE}`);
console.log(`  CHROMADB_URL: ${process.env.CHROMADB_URL}\n`);

const server = spawn('node', ['dist/index.js'], {
  env: process.env,
  stdio: 'pipe',
});

server.stderr.on('data', (data) => {
  const output = data.toString();
  console.log(output.trim());
});

setTimeout(() => {
  server.kill();
  console.log('\nTest complete');
}, 5000);
