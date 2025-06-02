import { LRUCache } from '../../src/core/cache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({ maxSize: 3, ttl: 1000 });
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should update existing values', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('key1')).toBe(false);
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when maxSize is reached', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update LRU order on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it most recently used
      cache.get('key1');

      cache.set('key4', 'value4'); // Should evict key2, not key1

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should call onEvict callback when evicting', () => {
      const onEvict = jest.fn();
      cache = new LRUCache<string>({ maxSize: 2, ttl: 1000, onEvict });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // Should evict key1

      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith(
        'key1',
        expect.objectContaining({
          data: 'value1',
        })
      );
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      jest.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not expire entries before TTL', () => {
      cache.set('key1', 'value1');

      jest.advanceTimersByTime(999);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should handle has() with expired entries', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      jest.advanceTimersByTime(1001);
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss

      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should track evictions', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Evicts key1

      const stats = cache.stats();
      expect(stats.evictions).toBe(1);
    });

    it('should track size', () => {
      expect(cache.stats().size).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.stats().size).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.stats().size).toBe(2);

      cache.delete('key1');
      expect(cache.stats().size).toBe(1);
    });

    it('should track hit count per entry', () => {
      cache.set('key1', 'value1');

      cache.get('key1');
      cache.get('key1');
      cache.get('key1');

      // Get entry directly to check hits
      const entry = (cache as any).cache.get('key1');
      expect(entry.hits).toBe(3);
    });
  });
});

describe('Cache key builders', () => {
  it('should build lifelog cache key', async () => {
    const { buildLifelogCacheKey } = await import('../../src/core/cache');
    expect(buildLifelogCacheKey('123')).toBe('lifelog:123');
  });

  it('should build date cache key', async () => {
    const { buildDateCacheKey } = await import('../../src/core/cache');
    expect(buildDateCacheKey('2024-01-15')).toBe('date:2024-01-15:');
    expect(buildDateCacheKey('2024-01-15', { limit: 10 })).toBe('date:2024-01-15:{"limit":10}');
  });

  it('should build search cache key', async () => {
    const { buildSearchCacheKey } = await import('../../src/core/cache');
    expect(buildSearchCacheKey('test')).toBe('search:test:');
    expect(buildSearchCacheKey('test', { searchTerm: 'test', limit: 5 })).toBe(
      'search:test:{"searchTerm":"test","limit":5}'
    );
  });

  it('should build recent cache key', async () => {
    const { buildRecentCacheKey } = await import('../../src/core/cache');
    expect(buildRecentCacheKey()).toBe('recent:');
    expect(buildRecentCacheKey({ limit: 20 })).toBe('recent:{"limit":20}');
  });
});
