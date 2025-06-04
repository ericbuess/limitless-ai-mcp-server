#!/usr/bin/env node

/**
 * Test vector store with local ChromaDB (no Docker needed)
 */

const { ChromaClient } = require('chromadb');
const { ChromaDefaultEmbeddingFunction } = require('chromadb-default-embed');

async function testLocalChroma() {
  console.log('🧪 Testing ChromaDB in local persistent mode...\n');

  try {
    // Create a client that uses local persistence instead of HTTP
    const client = new ChromaClient({
      path: './chroma-data', // Local directory instead of HTTP URL
    });

    console.log('✅ ChromaDB client created with local storage\n');

    // Create embedding function
    const embedder = new ChromaDefaultEmbeddingFunction();

    // Create a test collection
    const collection = await client
      .createCollection({
        name: 'test_lifelogs',
        embeddingFunction: embedder,
      })
      .catch(async () => {
        // If already exists, get it
        return await client.getCollection({
          name: 'test_lifelogs',
          embeddingFunction: embedder,
        });
      });

    console.log('✅ Collection created/retrieved\n');

    // Add some test documents
    const testDocs = [
      {
        id: 'test1',
        content: 'Happy birthday Ella! Hope you have a wonderful day.',
        metadata: { date: '2025-06-03', type: 'birthday' },
      },
      {
        id: 'test2',
        content: 'Discussing directions to the Texas Oncology building and parking.',
        metadata: { date: '2025-06-03', type: 'directions' },
      },
      {
        id: 'test3',
        content: 'Meeting logistics and attendance confirmation.',
        metadata: { date: '2025-06-03', type: 'meeting' },
      },
    ];

    console.log('📝 Adding test documents...');

    await collection.add({
      ids: testDocs.map((d) => d.id),
      documents: testDocs.map((d) => d.content),
      metadatas: testDocs.map((d) => d.metadata),
    });

    console.log('✅ Documents added\n');

    // Test semantic search
    console.log('🔍 Testing semantic search...\n');

    const queries = ['birthday celebration', 'driving and navigation', 'meeting planning'];

    for (const query of queries) {
      console.log(`Query: "${query}"`);
      const results = await collection.query({
        queryTexts: [query],
        nResults: 2,
      });

      console.log('Results:');
      results.documents[0].forEach((doc, i) => {
        const distance = results.distances?.[0]?.[i] || 0;
        const similarity = (1 - distance).toFixed(3);
        console.log(`  ${i + 1}. ${doc?.substring(0, 60)}... (similarity: ${similarity})`);
      });
      console.log();
    }

    console.log('✨ Local ChromaDB test successful!\n');
    console.log('💡 To use this in the MCP server:');
    console.log('   1. Update chroma-manager.ts to support local mode');
    console.log('   2. Set CHROMADB_MODE=local in your environment');
    console.log('   3. The data will persist in ./chroma-data directory');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nThis might be because ChromaDB expects a server by default.');
    console.error('We need to modify the implementation to support local mode.');
  }
}

// Run the test
testLocalChroma();
