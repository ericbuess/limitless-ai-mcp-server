import { LanceDBStore } from './dist/vector-store/lancedb-store.js';
import { TransformerEmbeddingProvider } from './dist/vector-store/transformer-embeddings.js';

async function debugSearch() {
  console.log('=== LanceDB Search Debug ===\n');

  try {
    // Initialize embedding provider separately to test it
    const embeddingProvider = new TransformerEmbeddingProvider();
    await embeddingProvider.initialize();
    console.log('✓ Embedding provider initialized\n');

    // Initialize vector store
    const vectorStore = new LanceDBStore({
      path: './data/lancedb',
      collectionName: 'limitless-lifelogs',
    });
    await vectorStore.initialize();
    console.log('✓ Vector store initialized\n');

    // Get stats
    const stats = await vectorStore.getStats();
    console.log(`Document count: ${stats.documentCount}\n`);

    // Test 1: Simple search
    console.log('Test 1: Simple search for "meeting"');
    const results1 = await vectorStore.searchByText('meeting', { topK: 5 });
    console.log(`Found ${results1.length} results`);
    if (results1.length > 0) {
      console.log('First result:', {
        id: results1[0].id,
        score: results1[0].score.toFixed(3),
        title: results1[0].metadata?.title?.substring(0, 50),
      });
    }

    // Test 2: Lower threshold
    console.log('\nTest 2: Search with lower threshold (0.1)');
    const results2 = await vectorStore.searchByText('meeting', {
      topK: 5,
      scoreThreshold: 0.1,
    });
    console.log(`Found ${results2.length} results`);

    // Test 3: Even lower threshold
    console.log('\nTest 3: Search with no threshold');
    const results3 = await vectorStore.searchByText('meeting', {
      topK: 5,
      scoreThreshold: 0.0,
    });
    console.log(`Found ${results3.length} results`);
    if (results3.length > 0) {
      console.log(
        'Scores:',
        results3.map((r) => r.score.toFixed(3))
      );
    }

    // Test 4: Generate embeddings directly
    console.log('\nTest 4: Direct embedding test');
    const testEmbedding = await embeddingProvider.embedSingle('meeting discussion');
    console.log(`Embedding dimensions: ${testEmbedding.length}`);
    console.log(
      `Embedding sample: [${testEmbedding
        .slice(0, 5)
        .map((n) => n.toFixed(3))
        .join(', ')}...]`
    );

    // Test 5: List some document IDs
    console.log('\nTest 5: List first 5 document IDs');
    const ids = await vectorStore.listDocumentIds();
    console.log(`Total documents: ${ids.length}`);
    console.log('First 5 IDs:', ids.slice(0, 5));

    // Test 6: Get a document directly
    if (ids.length > 0) {
      console.log('\nTest 6: Get first document');
      const doc = await vectorStore.getDocument(ids[0]);
      if (doc) {
        console.log('Document found:', {
          id: doc.id,
          contentLength: doc.content.length,
          hasEmbedding: !!doc.embedding,
          embeddingLength: doc.embedding?.length,
          metadata: doc.metadata,
        });
      }
    }
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  }
}

debugSearch()
  .catch(console.error)
  .then(() => process.exit(0));
