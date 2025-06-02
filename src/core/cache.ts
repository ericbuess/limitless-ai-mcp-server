import { CacheEntry, CacheOptions, CacheStats, ICache } from '../types/cache';
import { Lifelog, ListLifelogsOptions, SearchOptions } from '../types/limitless';
import { logger } from '../utils/logger';

export class LRUCache<T> implements ICache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private options: Required<CacheOptions>;
  private _stats: CacheStats;

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      maxSize: options.maxSize || 100,
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes default
      onEvict: options.onEvict || (() => {}),
    };

    this.cache = new Map();
    this._stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      maxSize: this.options.maxSize,
    };

    logger.info('LRU cache initialized', {
      maxSize: this.options.maxSize,
      ttl: this.options.ttl,
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this._stats.misses++;
      logger.debug('Cache miss', { key });
      return undefined;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.delete(key);
      this._stats.misses++;
      logger.debug('Cache entry expired', { key });
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    entry.hits++;
    this.cache.set(key, entry);
    
    this._stats.hits++;
    logger.debug('Cache hit', { key, hits: entry.hits });
    
    return entry.data;
  }

  set(key: string, value: T): void {
    // Delete existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else {
      this._stats.size++;
    }

    // Check if we need to evict
    if (this.cache.size >= this.options.maxSize) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      hits: 0,
    };

    this.cache.set(key, entry);
    logger.debug('Cache set', { key, size: this.cache.size });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this._stats.size--;
      logger.debug('Cache entry deleted', { key });
    }
    return existed;
  }

  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this._stats.size = 0;
    logger.info('Cache cleared', { entriesCleared: size });
  }

  size(): number {
    return this.cache.size;
  }

  stats(): CacheStats {
    return { ...this._stats };
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > this.options.ttl;
  }

  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      const entry = this.cache.get(firstKey);
      this.cache.delete(firstKey);
      this._stats.evictions++;
      this._stats.size--;
      
      if (entry) {
        this.options.onEvict(firstKey, entry);
      }
      
      logger.debug('Cache entry evicted', { key: firstKey });
    }
  }
}

// Global cache instances
export const lifelogCache = new LRUCache<Lifelog | Lifelog[]>({
  maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100'),
  ttl: parseInt(process.env.CACHE_TTL || String(5 * 60 * 1000)), // 5 minutes
});

export const searchCache = new LRUCache<Lifelog[]>({
  maxSize: parseInt(process.env.SEARCH_CACHE_MAX_SIZE || '50'),
  ttl: parseInt(process.env.SEARCH_CACHE_TTL || String(3 * 60 * 1000)), // 3 minutes
});

// Cache key builders
export function buildLifelogCacheKey(id: string): string {
  return `lifelog:${id}`;
}

export function buildDateCacheKey(date: string, options?: ListLifelogsOptions): string {
  const optStr = options ? JSON.stringify(options) : '';
  return `date:${date}:${optStr}`;
}

export function buildSearchCacheKey(searchTerm: string, options?: SearchOptions): string {
  const optStr = options ? JSON.stringify(options) : '';
  return `search:${searchTerm}:${optStr}`;
}

export function buildRecentCacheKey(options?: ListLifelogsOptions): string {
  const optStr = options ? JSON.stringify(options) : '';
  return `recent:${optStr}`;
}