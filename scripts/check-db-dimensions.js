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

      // Get a sample record
      const sample = await table.search('test').limit(1).toArray();

      if (sample.length > 0 && sample[0].vector) {
        console.log('\nVector dimension:', sample[0].vector.length);
        console.log('First 10 values:', sample[0].vector.slice(0, 10));
      } else {
        console.log('\nNo vectors found in table');
      }

      // Count total records
      const count = await table.countRows();
      console.log('Total records:', count);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
