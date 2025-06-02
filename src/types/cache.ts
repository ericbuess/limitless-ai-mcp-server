export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

export interface CacheOptions {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  onEvict?: (key: string, value: CacheEntry<any>) => void;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
}

export interface ICache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  stats(): CacheStats;
}