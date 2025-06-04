#!/usr/bin/env node

/**
 * Simple test to verify Phase 2 components compile and initialize correctly
 */

const { LimitlessClient } = require('./dist/core/limitless-client.js');
const { FileManager } = require('./dist/storage/file-manager.js');
const { UnifiedSearchHandler } = require('./dist/search/unified-search.js');
const { QueryRouter } = require('./dist/search/query-router.js');
const { FastPatternMatcher } = require('./dist/search/fast-patterns.js');

console.log('Testing Phase 2 Components...\n');

// Test 1: File Manager
console.log('1. Testing FileManager...');
try {
  const fileManager = new FileManager({
    baseDir: './test-data',
    enableEmbeddings: true,
    enableMetadata: true,
  });
  console.log('✅ FileManager created successfully');
} catch (error) {
  console.error('❌ FileManager failed:', error.message);
}

// Test 2: Query Router
console.log('\n2. Testing QueryRouter...');
try {
  const queryRouter = new QueryRouter();
  const testQueries = [
    'meeting yesterday',
    'action items from last week',
    'what did we discuss about the budget?',
    'show me todos',
  ];

  for (const query of testQueries) {
    const classification = queryRouter.classifyQuery(query);
    console.log(`   Query: "${query}"`);
    console.log(`   Type: ${classification.type}, Strategy: ${classification.suggestedStrategy}`);
  }
  console.log('✅ QueryRouter working correctly');
} catch (error) {
  console.error('❌ QueryRouter failed:', error.message);
}

// Test 3: Fast Pattern Matcher
console.log('\n3. Testing FastPatternMatcher...');
try {
  const matcher = new FastPatternMatcher();
  // Build a test index
  const testLifelogs = [
    {
      id: 'test1',
      title: 'Test Meeting',
      content: 'Discussion about project roadmap and action items',
      createdAt: new Date().toISOString(),
      duration: 1800,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    },
  ];

  matcher.buildIndex(testLifelogs).then(() => {
    console.log('✅ FastPatternMatcher index built successfully');
  });
} catch (error) {
  console.error('❌ FastPatternMatcher failed:', error.message);
}

// Test 4: Phase2 Type Conversion
console.log('\n4. Testing Phase2 type conversion...');
try {
  const { toPhase2Lifelog } = require('./dist/types/phase2.js');
  const apiLifelog = {
    id: 'test123',
    title: 'API Test',
    markdown: '# Test\n\nThis is a test lifelog with some content.',
    startTime: '2024-01-01T10:00:00Z',
    endTime: '2024-01-01T10:30:00Z',
  };

  const phase2Lifelog = toPhase2Lifelog(apiLifelog);
  console.log('   Converted lifelog:');
  console.log(`   - ID: ${phase2Lifelog.id}`);
  console.log(`   - Duration: ${phase2Lifelog.duration} seconds`);
  console.log(`   - Content length: ${phase2Lifelog.content.length} chars`);
  console.log('✅ Phase2 type conversion working');
} catch (error) {
  console.error('❌ Phase2 type conversion failed:', error.message);
}

console.log('\n✨ Phase 2 basic components test complete!');
console.log('\nNote: Full integration testing requires:');
console.log('- LIMITLESS_API_KEY environment variable');
console.log('- ChromaDB running on localhost:8000 (for vector search)');
console.log('- Claude CLI installed (for advanced analysis)');
