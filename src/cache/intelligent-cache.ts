import { logger } from '../utils/logger.js';
import type { QueryClassification, QueryType } from '../search/query-router.js';

export interface CachedSearchResult {
  query: string;
  queryType: QueryType;
  strategy: 'fast' | 'vector' | 'hybrid' | 'claude';
  results: any;
  metadata: {
    hitCount: number;
    lastAccessed: Date;
    avgResponseTime: number;
    confidence: number;
  };
}

export interface QueryPattern {
  pattern: string;
  type: QueryType;
  frequency: number;
  avgResponseTime: number;
  successRate: number;
  preferredStrategy: 'fast' | 'vector' | 'hybrid' | 'claude';
}

export interface CacheOptions {
  maxSize?: number;
  ttl?: number; // milliseconds
  learningEnabled?: boolean;
  persistPath?: string;
}

export class IntelligentCache {
  private cache: Map<string, CachedSearchResult>;
  private queryPatterns: Map<string, QueryPattern>;
  private performanceHistory: Map<string, number[]>;
  private options: Required<CacheOptions>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.queryPatterns = new Map();
    this.performanceHistory = new Map();

    this.options = {
      maxSize: options.maxSize || 1000,
      ttl: options.ttl || 300000, // 5 minutes
      learningEnabled: options.learningEnabled ?? true,
      persistPath: options.persistPath || '',
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute
  }

  /**
   * Get cached result for a query
   */
  get(query: string): CachedSearchResult | null {
    const cached = this.cache.get(query);

    if (!cached) {
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.metadata.lastAccessed.getTime();
    if (age > this.options.ttl) {
      this.cache.delete(query);
      return null;
    }

    // Update access metadata
    cached.metadata.hitCount++;
    cached.metadata.lastAccessed = new Date();

    logger.debug('Cache hit', {
      query,
      hitCount: cached.metadata.hitCount,
      age: Math.round(age / 1000) + 's',
    });

    return cached;
  }

  /**
   * Store search result in cache
   */
  set(
    query: string,
    classification: QueryClassification,
    results: any,
    responseTime: number
  ): void {
    // Update performance history
    this.updatePerformanceHistory(query, responseTime);

    // Create or update cache entry
    const existing = this.cache.get(query);

    const cached: CachedSearchResult = {
      query,
      queryType: classification.type,
      strategy: classification.suggestedStrategy,
      results,
      metadata: {
        hitCount: existing?.metadata.hitCount || 0,
        lastAccessed: new Date(),
        avgResponseTime: this.calculateAvgResponseTime(query),
        confidence: classification.confidence,
      },
    };

    this.cache.set(query, cached);

    // Learn from this query if enabled
    if (this.options.learningEnabled) {
      this.learnFromQuery(query, classification, responseTime, results);
    }

    // Enforce size limit
    if (this.cache.size > this.options.maxSize) {
      this.evictOldest();
    }

    logger.debug('Cached search result', {
      query,
      type: classification.type,
      strategy: classification.suggestedStrategy,
      responseTime,
    });
  }

  /**
   * Get suggested strategy based on learned patterns
   */
  getSuggestedStrategy(
    query: string,
    _classification: QueryClassification
  ): 'fast' | 'vector' | 'hybrid' | 'claude' | null {
    if (!this.options.learningEnabled) {
      return null;
    }

    // Look for similar patterns
    let bestMatch: QueryPattern | null = null;
    let bestScore = 0;

    for (const [pattern, patternData] of this.queryPatterns) {
      const score = this.calculatePatternSimilarity(query, pattern);
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        bestMatch = patternData;
      }
    }

    if (bestMatch && bestMatch.frequency > 3) {
      logger.debug('Found matching pattern', {
        query,
        pattern: bestMatch.pattern,
        strategy: bestMatch.preferredStrategy,
        confidence: bestScore,
      });
      return bestMatch.preferredStrategy;
    }

    return null;
  }

  /**
   * Learn from query execution
   */
  private learnFromQuery(
    query: string,
    classification: QueryClassification,
    responseTime: number,
    results: any
  ): void {
    // Extract pattern from query
    const pattern = this.extractPattern(query, classification);

    // Update or create pattern entry
    const existing = this.queryPatterns.get(pattern);

    if (existing) {
      // Update existing pattern
      existing.frequency++;
      existing.avgResponseTime =
        (existing.avgResponseTime * (existing.frequency - 1) + responseTime) / existing.frequency;

      // Update success rate based on results
      const hasResults = Array.isArray(results) ? results.length > 0 : !!results;
      existing.successRate =
        (existing.successRate * (existing.frequency - 1) + (hasResults ? 1 : 0)) /
        existing.frequency;

      // Update preferred strategy if this one performed better
      if (responseTime < existing.avgResponseTime * 0.8) {
        existing.preferredStrategy = classification.suggestedStrategy;
      }
    } else {
      // Create new pattern
      this.queryPatterns.set(pattern, {
        pattern,
        type: classification.type,
        frequency: 1,
        avgResponseTime: responseTime,
        successRate: Array.isArray(results) ? (results.length > 0 ? 1 : 0) : 1,
        preferredStrategy: classification.suggestedStrategy,
      });
    }

    // Limit pattern storage
    if (this.queryPatterns.size > 500) {
      this.prunePatterns();
    }
  }

  /**
   * Extract pattern from query
   */
  private extractPattern(query: string, classification: QueryClassification): string {
    // Normalize query to extract pattern
    let pattern = query
      .toLowerCase()
      .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE') // Replace dates
      .replace(/\d+/g, 'NUM') // Replace numbers
      .replace(/"[^"]+"/g, 'QUOTED') // Replace quoted strings
      .trim();

    // Add type prefix for better pattern matching
    pattern = `${classification.type}:${pattern}`;

    return pattern;
  }

  /**
   * Calculate similarity between query and pattern
   */
  private calculatePatternSimilarity(query: string, pattern: string): number {
    // Remove type prefix from pattern
    const patternWithoutType = pattern.split(':')[1] || pattern;

    // Normalize query
    const normalizedQuery = query
      .toLowerCase()
      .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
      .replace(/\d+/g, 'NUM')
      .replace(/"[^"]+"/g, 'QUOTED')
      .trim();

    // Simple similarity based on common words
    const queryWords = normalizedQuery.split(/\s+/);
    const patternWords = patternWithoutType.split(/\s+/);

    const commonWords = queryWords.filter((word) => patternWords.includes(word));
    const similarity = commonWords.length / Math.max(queryWords.length, patternWords.length);

    return similarity;
  }

  /**
   * Update performance history
   */
  private updatePerformanceHistory(query: string, responseTime: number): void {
    if (!this.performanceHistory.has(query)) {
      this.performanceHistory.set(query, []);
    }

    const history = this.performanceHistory.get(query)!;
    history.push(responseTime);

    // Keep only last 10 entries
    if (history.length > 10) {
      history.shift();
    }
  }

  /**
   * Calculate average response time
   */
  private calculateAvgResponseTime(query: string): number {
    const history = this.performanceHistory.get(query);
    if (!history || history.length === 0) {
      return 0;
    }

    const sum = history.reduce((a, b) => a + b, 0);
    return Math.round(sum / history.length);
  }

  /**
   * Evict oldest cache entries
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort(
      (a, b) => a[1].metadata.lastAccessed.getTime() - b[1].metadata.lastAccessed.getTime()
    );

    // Remove oldest 10%
    const toRemove = Math.ceil(this.cache.size * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Prune rarely used patterns
   */
  private prunePatterns(): void {
    const patterns = Array.from(this.queryPatterns.entries());
    patterns.sort((a, b) => a[1].frequency - b[1].frequency);

    // Remove patterns with frequency < 2
    for (const [pattern, data] of patterns) {
      if (data.frequency < 2) {
        this.queryPatterns.delete(pattern);
      }
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [query, cached] of this.cache) {
      const age = now - cached.metadata.lastAccessed.getTime();
      if (age > this.options.ttl) {
        expired.push(query);
      }
    }

    for (const query of expired) {
      this.cache.delete(query);
    }

    if (expired.length > 0) {
      logger.debug('Cleaned up expired cache entries', { count: expired.length });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cacheSize: number;
    patternCount: number;
    hitRate: number;
    avgResponseTime: number;
    topPatterns: QueryPattern[];
  } {
    let totalHits = 0;
    let totalQueries = 0;
    let totalResponseTime = 0;

    for (const cached of this.cache.values()) {
      totalHits += cached.metadata.hitCount;
      totalQueries++;
      totalResponseTime += cached.metadata.avgResponseTime;
    }

    const topPatterns = Array.from(this.queryPatterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    return {
      cacheSize: this.cache.size,
      patternCount: this.queryPatterns.size,
      hitRate: totalQueries > 0 ? totalHits / (totalHits + totalQueries) : 0,
      avgResponseTime: totalQueries > 0 ? totalResponseTime / totalQueries : 0,
      topPatterns,
    };
  }

  /**
   * Clear all cache data
   */
  clear(): void {
    this.cache.clear();
    this.queryPatterns.clear();
    this.performanceHistory.clear();
    logger.info('Intelligent cache cleared');
  }

  /**
   * Stop the cache service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Export learned patterns for analysis
   */
  exportPatterns(): QueryPattern[] {
    return Array.from(this.queryPatterns.values()).sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Import patterns from previous sessions
   */
  importPatterns(patterns: QueryPattern[]): void {
    for (const pattern of patterns) {
      this.queryPatterns.set(pattern.pattern, pattern);
    }
    logger.info('Imported query patterns', { count: patterns.length });
  }
}
