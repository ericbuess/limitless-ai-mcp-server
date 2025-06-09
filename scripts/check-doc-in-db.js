#!/usr/bin/env node

import { LanceDBStore } from '../dist/vector-store/lancedb-store.js';

async function checkDocument() {
  const store = new LanceDBStore({
    collectionName: 'limitless-lifelogs',
    persistPath: './data/lancedb',
  });

  await store.initialize();

  const targetId = 'K9G2oUoUqVqj3XmRAwvN';
  const doc = await store.getDocument(targetId);

  if (doc) {
    console.log('✅ Document found in vector DB:');
    console.log('ID:', doc.id);
    console.log('Has embedding:', Boolean(doc.embedding));
    console.log('Embedding dimensions:', doc.embedding?.length);
    console.log('Content length:', doc.content?.length);
    console.log('Content preview:', doc.content?.substring(0, 200) + '...');
    console.log('Metadata:', JSON.stringify(doc.metadata, null, 2));
  } else {
    console.log('❌ Document NOT found in vector DB!');
    console.log('This explains why vector search cannot find it.');
  }

  // Also check document count
  const stats = await store.getStats();
  console.log('\nVector DB Stats:', stats);

  await store.close();
}

checkDocument().catch(console.error);
