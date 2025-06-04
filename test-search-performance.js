#!/usr/bin/env node

/**
 * Test search performance
 */

const { spawn } = require('child_process');

// Load environment
const envFile = require('fs').readFileSync('.env', 'utf8');
envFile.split('\n').forEach((line) => {
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  }
});

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

const searchRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'limitless_advanced_search',
    arguments: {
      query: 'test',
    },
  },
};

const oldSearchRequest = {
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'limitless_search_lifelogs',
    arguments: {
      search_term: 'test',
    },
  },
};

async function testSearchPerformance() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      env: { ...process.env },
      stdio: 'pipe',
    });

    let output = '';
    let searchStartTime;
    let oldSearchStartTime;

    server.stdout.on('data', (data) => {
      output += data.toString();
      const lines = output.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);

            if (response.id === 1 && response.result) {
              console.log('✅ Server initialized\n');
              console.log('🔍 Testing advanced search...');
              searchStartTime = Date.now();
              server.stdin.write(JSON.stringify(searchRequest) + '\n');
            }

            if (response.id === 2) {
              const searchTime = Date.now() - searchStartTime;
              if (response.result && response.result.content) {
                const results = response.result.content[0];
                console.log(`✅ Advanced search completed in ${searchTime}ms`);
                console.log(
                  `   Strategy used: ${results.text.includes('fast') ? 'fast' : 'unknown'}`
                );
                console.log(
                  `   Results found: ${results.text.match(/Found \d+ results?/)?.[0] || 'unknown'}\n`
                );
              }

              console.log('🔍 Testing old search for comparison...');
              oldSearchStartTime = Date.now();
              server.stdin.write(JSON.stringify(oldSearchRequest) + '\n');
            }

            if (response.id === 3) {
              const oldSearchTime = Date.now() - oldSearchStartTime;
              if (response.result && response.result.content) {
                console.log(`✅ Old search completed in ${oldSearchTime}ms`);

                const advancedTime = Date.now() - searchStartTime - oldSearchTime;
                const improvement = Math.round(oldSearchTime / advancedTime);

                console.log(`\n📊 Performance Comparison:`);
                console.log(`   Old search: ${oldSearchTime}ms`);
                console.log(`   Advanced search: ${advancedTime}ms`);
                console.log(`   Improvement: ${improvement}x faster`);
              }

              server.kill();
              resolve();
            }

            if (response.error) {
              console.error('Error:', response.error);
            }
          } catch (e) {
            // Ignore non-JSON output
          }
        }
      }
    });

    server.stderr.on('data', (data) => {
      // Ignore info logs
    });

    setTimeout(() => {
      server.stdin.write(JSON.stringify(initRequest) + '\n');
    }, 3000); // Wait for server to fully initialize

    setTimeout(() => {
      server.kill();
      reject(new Error('Test timed out'));
    }, 30000);
  });
}

console.log('⚡ Testing Search Performance...\n');

testSearchPerformance()
  .then(() => console.log('\n✨ Performance test completed!'))
  .catch((err) => console.error('\n❌ Test failed:', err.message));
