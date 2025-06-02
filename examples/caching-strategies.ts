/**
 * Example: Caching Strategies
 * 
 * This example demonstrates how to optimize performance using
 * the built-in caching system and various caching strategies.
 */

import { LimitlessClient } from '../src/core/limitless-client';
import { lifelogCache, searchCache } from '../src/core/cache';

async function main() {
  // Initialize client with custom timeout for testing
  const client = new LimitlessClient({
    apiKey: process.env.LIMITLESS_API_KEY!,
    timeout: 120000,
  });

  try {
    // Strategy 1: Cache Warming
    console.log('=== Strategy 1: Cache Warming ===');
    console.log('Pre-loading frequently accessed data...');
    
    // Pre-load today's recordings
    const today = new Date().toISOString().split('T')[0];
    await client.listLifelogsByDate(today);
    
    // Pre-load recent recordings
    await client.listRecentLifelogs({ limit: 20 });
    
    // Pre-load common search terms
    const commonSearches = ['meeting', 'action item', 'decision'];
    for (const term of commonSearches) {
      await client.searchLifelogs({ searchTerm: term, fetchLimit: 30 });
    }
    
    console.log('Cache warmed with common data');
    console.log(`Lifelog cache stats:`, lifelogCache.stats());
    console.log(`Search cache stats:`, searchCache.stats());

    // Strategy 2: Cache Hit Optimization
    console.log('\n=== Strategy 2: Cache Hit Demonstration ===');
    
    // First call - cache miss
    console.time('First call (cache miss)');
    const firstCall = await client.listLifelogsByDate(today);
    console.timeEnd('First call (cache miss)');
    
    // Second call - cache hit
    console.time('Second call (cache hit)');
    const secondCall = await client.listLifelogsByDate(today);
    console.timeEnd('Second call (cache hit)');
    
    console.log('Results identical:', JSON.stringify(firstCall) === JSON.stringify(secondCall));

    // Strategy 3: Search Cache Efficiency
    console.log('\n=== Strategy 3: Search Cache Efficiency ===');
    
    const searchTerm = 'project update';
    
    // Multiple searches with same term
    console.time('Search 1 (miss)');
    await client.searchLifelogs({ searchTerm, fetchLimit: 50 });
    console.timeEnd('Search 1 (miss)');
    
    console.time('Search 2 (hit)');
    await client.searchLifelogs({ searchTerm, fetchLimit: 50 });
    console.timeEnd('Search 2 (hit)');
    
    console.time('Search 3 (hit)');
    await client.searchLifelogs({ searchTerm, fetchLimit: 50 });
    console.timeEnd('Search 3 (hit)');
    
    console.log('Search cache stats:', searchCache.stats());

    // Strategy 4: Cache-aware Batch Processing
    console.log('\n=== Strategy 4: Batch Processing with Cache ===');
    
    const dates = [
      '2024-01-13',
      '2024-01-14',
      '2024-01-15',
      today,
    ];
    
    // Process dates, some may be cached
    for (const date of dates) {
      const startTime = Date.now();
      const logs = await client.listLifelogsByDate(date);
      const duration = Date.now() - startTime;
      
      const cacheStatus = duration < 10 ? 'HIT' : 'MISS';
      console.log(`${date}: ${logs.length} logs (${cacheStatus} - ${duration}ms)`);
    }

    // Strategy 5: Cache Statistics Monitoring
    console.log('\n=== Strategy 5: Cache Monitoring ===');
    
    const lifelogStats = lifelogCache.stats();
    const searchStats = searchCache.stats();
    
    console.log('Lifelog Cache Performance:');
    console.log(`  Hit Rate: ${((lifelogStats.hits / (lifelogStats.hits + lifelogStats.misses)) * 100).toFixed(2)}%`);
    console.log(`  Size: ${lifelogStats.size}/${lifelogStats.maxSize}`);
    console.log(`  Evictions: ${lifelogStats.evictions}`);
    
    console.log('\nSearch Cache Performance:');
    console.log(`  Hit Rate: ${((searchStats.hits / (searchStats.hits + searchStats.misses)) * 100).toFixed(2)}%`);
    console.log(`  Size: ${searchStats.size}/${searchStats.maxSize}`);
    console.log(`  Evictions: ${searchStats.evictions}`);

    // Strategy 6: Intelligent Prefetching
    console.log('\n=== Strategy 6: Intelligent Prefetching ===');
    
    // If user accesses Monday, prefetch whole week
    const monday = '2024-01-08';
    console.log(`User accessed ${monday}, prefetching week...`);
    
    await client.listLifelogsByDate(monday);
    
    // Prefetch rest of week in background
    const weekDates = [
      '2024-01-09',
      '2024-01-10',
      '2024-01-11',
      '2024-01-12',
    ];
    
    await Promise.all(
      weekDates.map(date => client.listLifelogsByDate(date))
    );
    
    console.log('Week prefetched, subsequent access will be instant');

    // Strategy 7: Cache-aware Error Handling
    console.log('\n=== Strategy 7: Fallback to Cache on Error ===');
    
    // Simulate API failure by using invalid date
    try {
      await client.listLifelogsByDate('invalid-date');
    } catch (error) {
      console.log('API error occurred, checking cache for recent valid data...');
      
      // Could implement fallback logic here
      const cachedStats = lifelogCache.stats();
      console.log(`Cache has ${cachedStats.size} entries available as fallback`);
    }

    // Strategy 8: Cache Optimization Tips
    console.log('\n=== Cache Optimization Tips ===');
    console.log('1. Set appropriate TTL based on data volatility');
    console.log('   - Lifelogs (5 min): Good for static past recordings');
    console.log('   - Search (3 min): Shorter for dynamic results');
    console.log('\n2. Size cache based on usage patterns');
    console.log('   - Monitor eviction rate');
    console.log('   - Increase size if evictions are high');
    console.log('\n3. Implement cache warming for predictable access');
    console.log('   - Pre-load at startup');
    console.log('   - Refresh during idle time');
    console.log('\n4. Use cache stats to optimize');
    console.log('   - Track hit rates');
    console.log('   - Identify hot keys');
    console.log('   - Adjust strategies accordingly');

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
main().catch(console.error);