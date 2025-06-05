import { logger } from '../utils/logger.js';
import type { Phase2Lifelog } from '../types/phase2.js';
import type { UnifiedSearchOptions, UnifiedSearchResult } from './unified-search.js';
import type { FastPatternMatcher } from './fast-patterns.js';
import type { BaseVectorStore } from '../vector-store/vector-store.interface.js';
import type { QueryClassification } from './query-router.js';

export interface ParallelSearchStrategy {
  name: string;
  execute: () => Promise<any>;
  weight: number;
  enabled: boolean;
}

export interface ParallelSearchResult extends UnifiedSearchResult {
  strategyTimings: Record<string, number>;
  failedStrategies: string[];
}

/**
 * Executes multiple search strategies in parallel for maximum performance
 */
export class ParallelSearchExecutor {
  constructor(
    private fastMatcher: FastPatternMatcher,
    private vectorStore: BaseVectorStore | null,
    _fileManager: any // Future use for metadata search
  ) {}

  /**
   * Execute all applicable search strategies in parallel
   */
  async executeParallelSearch(
    query: string,
    classification: QueryClassification,
    options: UnifiedSearchOptions = {}
  ): Promise<ParallelSearchResult> {
    const startTime = Date.now();
    const limit = options.limit || 20;

    // Define search strategies
    const strategies: ParallelSearchStrategy[] = [
      {
        name: 'fast-keyword',
        execute: async () =>
          this.fastMatcher.search(query, {
            maxResults: limit,
            scoreThreshold: options.scoreThreshold || 0.1,
          }),
        weight: 0.3,
        enabled: true,
      },
      {
        name: 'fast-date',
        execute: () => this.executeDateSearch(query, classification, limit),
        weight: 0.2,
        enabled: (classification.extractedEntities.dates?.length ?? 0) > 0,
      },
      {
        name: 'vector-semantic',
        execute: () =>
          this.vectorStore?.searchByText(query, {
            topK: limit,
            includeContent: options.includeContent,
            includeMetadata: options.includeMetadata,
            scoreThreshold: options.scoreThreshold,
          }) || Promise.resolve([]),
        weight: 0.4,
        enabled: this.vectorStore !== null,
      },
      {
        name: 'metadata-filter',
        execute: () => this.executeMetadataSearch(query, classification, limit),
        weight: 0.1,
        enabled: (classification.extractedEntities.keywords?.length ?? 0) > 2,
      },
    ];

    // Filter enabled strategies
    const enabledStrategies = strategies.filter((s) => s.enabled);
    logger.info(`Executing ${enabledStrategies.length} search strategies in parallel`, {
      query,
      strategies: enabledStrategies.map((s) => s.name),
    });

    // Execute all strategies in parallel
    const strategyPromises = enabledStrategies.map((strategy) => ({
      name: strategy.name,
      weight: strategy.weight,
      promise: strategy
        .execute()
        .then((result) => ({
          success: true,
          result,
          timing: Date.now() - startTime,
        }))
        .catch((error) => {
          logger.warn(`Search strategy ${strategy.name} failed`, { error });
          return {
            success: false,
            error,
            timing: Date.now() - startTime,
          };
        }),
    }));

    // Wait for all strategies to complete
    const results = await Promise.allSettled(strategyPromises.map((sp) => sp.promise));

    // Process results
    const strategyTimings: Record<string, number> = {};
    const failedStrategies: string[] = [];
    const successfulResults: Array<{
      name: string;
      weight: number;
      results: any[];
    }> = [];

    results.forEach((result, index) => {
      const strategy = strategyPromises[index];

      if (result.status === 'fulfilled' && result.value.success) {
        strategyTimings[strategy.name] = result.value.timing;
        successfulResults.push({
          name: strategy.name,
          weight: strategy.weight,
          results: Array.isArray((result.value as any).result) ? (result.value as any).result : [],
        });
      } else {
        failedStrategies.push(strategy.name);
        strategyTimings[strategy.name] =
          result.status === 'fulfilled' ? result.value.timing : Date.now() - startTime;
      }
    });

    // Merge and rank results
    const mergedResults = this.mergeParallelResults(successfulResults, limit);

    logger.info('Parallel search completed', {
      totalTime: Date.now() - startTime,
      strategyTimings,
      failedStrategies,
      resultCount: mergedResults.length,
    });

    return {
      query,
      strategy: 'parallel',
      results: mergedResults,
      performance: {
        totalTime: Date.now() - startTime,
        searchTime: Math.max(...Object.values(strategyTimings)),
        strategy: 'parallel',
        cacheHit: false,
      },
      strategyTimings,
      failedStrategies,
    };
  }

  /**
   * Execute date-based search
   */
  private async executeDateSearch(
    query: string,
    classification: QueryClassification,
    limit: number
  ): Promise<any[]> {
    if (!classification.extractedEntities.dates?.length) {
      return [];
    }

    const date = classification.extractedEntities.dates[0];
    return this.fastMatcher.searchByDateRange(date, date, query, { maxResults: limit });
  }

  /**
   * Execute metadata-based search
   */
  private async executeMetadataSearch(
    _query: string,
    classification: QueryClassification,
    _limit: number
  ): Promise<any[]> {
    // Search using metadata filters from local files
    const keywords = classification.extractedEntities.keywords || [];

    // This would search through .meta.json files
    // For now, return empty array as placeholder
    logger.debug('Metadata search not yet implemented', { keywords });
    return [];
  }

  /**
   * Merge results from multiple strategies with weighted scoring
   */
  private mergeParallelResults(
    strategyResults: Array<{
      name: string;
      weight: number;
      results: any[];
    }>,
    limit: number
  ): UnifiedSearchResult['results'] {
    const resultMap = new Map<
      string,
      {
        id: string;
        score: number;
        lifelog?: Phase2Lifelog;
        highlights?: string[];
        metadata: Record<string, any>;
        sources: string[];
      }
    >();

    // Process each strategy's results
    for (const { name, weight, results } of strategyResults) {
      for (const result of results) {
        const id = result.id || result.lifelog?.id;
        if (!id) continue;

        const existing = resultMap.get(id);
        if (existing) {
          // Combine scores with strategy weight
          existing.score += (result.score || 0) * weight;
          existing.sources.push(name);

          // Merge highlights
          if (result.matches) {
            existing.highlights = [
              ...(existing.highlights || []),
              ...result.matches.map((m: any) => m.context),
            ];
          }

          // Merge metadata
          existing.metadata = {
            ...existing.metadata,
            ...result.metadata,
            matchingSources: existing.sources,
          };
        } else {
          // New result
          resultMap.set(id, {
            id,
            score: (result.score || 0) * weight,
            lifelog: result.lifelog,
            highlights: result.matches?.map((m: any) => m.context),
            metadata: {
              ...result.metadata,
              source: name,
              matchingSources: [name],
            },
            sources: [name],
          });
        }
      }
    }

    // Sort by combined score and return top results
    return Array.from(resultMap.values())
      .map(({ sources: _sources, ...rest }) => rest) // Remove internal sources array
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
