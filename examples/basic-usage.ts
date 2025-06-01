import { LimitlessClient } from '../src/core/limitless-client';

async function main() {
  // Initialize the client
  const client = new LimitlessClient({
    apiKey: process.env.LIMITLESS_API_KEY!,
    timeout: 120000,
  });

  try {
    // Example 1: Get recent recordings
    console.log('=== Recent Recordings ===');
    const recentLogs = await client.listRecentLifelogs({
      limit: 5,
      includeMarkdown: true,
    });
    
    recentLogs.forEach(log => {
      console.log(`- ${log.title} (${log.date})`);
      if (log.summary) {
        console.log(`  Summary: ${log.summary.substring(0, 100)}...`);
      }
    });

    // Example 2: Search for specific content
    console.log('\n=== Search Results ===');
    const searchResults = await client.searchLifelogs({
      searchTerm: 'meeting',
      fetchLimit: 20,
      limit: 3,
    });

    searchResults.forEach(log => {
      console.log(`- ${log.title}`);
      console.log(`  Date: ${log.date}`);
      console.log(`  ID: ${log.id}`);
    });

    // Example 3: Get recordings for a specific date
    console.log('\n=== Today\'s Recordings ===');
    const today = new Date().toISOString().split('T')[0];
    const todaysLogs = await client.listLifelogsByDate(today, {
      includeHeadings: true,
    });

    todaysLogs.forEach(log => {
      console.log(`- ${log.title}`);
      if (log.headings && log.headings.length > 0) {
        console.log('  Topics discussed:');
        log.headings.slice(0, 3).forEach(heading => {
          console.log(`    • ${heading}`);
        });
      }
    });

    // Example 4: Get recordings within a date range
    console.log('\n=== This Week\'s Recordings ===');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const weekLogs = await client.listLifelogsByRange({
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
      direction: 'desc',
      limit: 10,
    });

    console.log(`Found ${weekLogs.length} recordings this week`);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the examples
main();