#!/usr/bin/env node

import { connect } from '@lancedb/lancedb';

async function main() {
  console.log('Checking LanceDB dimensions...\n');

  try {
    const db = await connect('./data/lancedb');
    const tables = await db.tableNames();

    console.log('Available tables:', tables);

    if (tables.includes('limitless-lifelogs')) {
      const table = await db.openTable('limitless-lifelogs');

      // Try to get schema
      const schema = table.schema;
      console.log('\nTable schema:', schema);

      // Try a vector search with a dummy vector
      try {
        // Try 384 dimensions
        const dummyVector384 = new Array(384).fill(0.1);
        const results384 = await table.vectorSearch(dummyVector384).limit(1).toArray();
        console.log('\n✅ 384-dimension search worked!');
      } catch (error) {
        console.log('\n❌ 384-dimension search failed:', error.message);
      }

      try {
        // Try 768 dimensions
        const dummyVector768 = new Array(768).fill(0.1);
        const results768 = await table.vectorSearch(dummyVector768).limit(1).toArray();
        console.log('✅ 768-dimension search worked!');
      } catch (error) {
        console.log('❌ 768-dimension search failed:', error.message);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
