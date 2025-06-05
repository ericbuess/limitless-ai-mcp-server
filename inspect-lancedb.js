import { connect } from '@lancedb/lancedb';

async function inspectDB() {
  console.log('=== Inspecting LanceDB Contents ===\n');

  try {
    const db = await connect('./data/lancedb');
    const tables = await db.tableNames();
    console.log('Tables:', tables);

    if (tables.includes('limitless-lifelogs')) {
      const table = await db.openTable('limitless-lifelogs');
      const count = await table.countRows();
      console.log(`\nTable 'limitless-lifelogs' has ${count} rows\n`);

      // Get first 3 rows
      console.log('First 3 rows:');
      const rows = await table.query().limit(3).toArray();
      for (const row of rows) {
        console.log(`\nID: ${row.id}`);
        console.log(`Content: ${row.content?.substring(0, 100)}...`);
        console.log(`Vector length: ${row.vector?.length}`);
        console.log(`Metadata: ${row.metadata?.substring(0, 100)}...`);
      }

      // Test a simple search
      console.log('\n=== Testing Search ===');
      const queryVector = Array(384).fill(0.1);
      const searchResults = await table.search(queryVector).limit(3).toArray();
      console.log(`\nSearch returned ${searchResults.length} results`);

      // Check if any content contains "meeting"
      console.log('\n=== Checking for "meeting" keyword ===');
      const allRows = await table.query().toArray();
      let meetingCount = 0;
      for (const row of allRows) {
        if (row.content && row.content.toLowerCase().includes('meeting')) {
          meetingCount++;
          if (meetingCount === 1) {
            console.log(`Found "meeting" in ID: ${row.id}`);
            console.log(`Content preview: ${row.content.substring(0, 200)}...`);
          }
        }
      }
      console.log(`\nTotal rows containing "meeting": ${meetingCount}`);
    }
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  }
}

inspectDB()
  .catch(console.error)
  .then(() => process.exit(0));
