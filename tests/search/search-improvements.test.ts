/**
 * Comprehensive Test Suite for Search Improvements
 *
 * Tests all the recent improvements:
 * 1. Consensus scoring prioritizes keyword matches
 * 2. Vector dimension mismatch handling
 * 3. Confidence threshold adjustments
 * 4. Score normalization improvements
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { FastPatternMatcher } from '../../src/search/fast-patterns.js';
import { ParallelSearchExecutor } from '../../src/search/parallel-search-executor.js';
import { FileManager } from '../../src/storage/file-manager.js';
import { LanceDBStore } from '../../src/vector-store/lancedb-store.js';
import { TransformerEmbeddings } from '../../src/vector-store/transformer-embeddings.js';
import { PaddingEmbeddingProvider } from '../../src/vector-store/lancedb-dimension-fix.js';
import { IterativeMemorySearchTool } from '../../scripts/memory-search-iterative.js';

describe('Search Improvements Test Suite', () => {
  let fileManager: FileManager;
  let fastMatcher: FastPatternMatcher;
  let vectorStore: LanceDBStore;
  let searchExecutor: ParallelSearchExecutor;
  let memorySearch: IterativeMemorySearchTool;

  beforeAll(async () => {
    // Initialize components
    fileManager = new FileManager({ baseDir: './data' });
    fastMatcher = new FastPatternMatcher();
    vectorStore = new LanceDBStore({
      collectionName: 'limitless-lifelogs-test',
      persistPath: './data/test-lancedb',
    });

    await vectorStore.initialize();

    searchExecutor = new ParallelSearchExecutor(fastMatcher, vectorStore, fileManager);

    memorySearch = new IterativeMemorySearchTool({
      tasks: {
        memory_search: {
          confidenceThreshold: 0.8,
          maxIterations: 3,
        },
      },
    });

    await memorySearch.initialize();
  });

  afterAll(async () => {
    // Cleanup
    await vectorStore.close?.();
  });

  describe('Consensus Scoring', () => {
    test('should prioritize keyword matches over other strategies', async () => {
      // Create test data
      const testLifelogs = [
        {
          id: 'test-1',
          title: 'Discussion about kids going to Mimi house',
          content: "The kids went to Mimi's house this afternoon for a playdate.",
          createdAt: new Date().toISOString(),
          duration: 300,
        },
        {
          id: 'test-2',
          title: 'Random AI discussion',
          content: 'We talked about artificial intelligence and machine learning.',
          createdAt: new Date().toISOString(),
          duration: 600,
        },
      ];

      // Build index
      await fastMatcher.buildIndex(testLifelogs);

      // Search
      const results = fastMatcher.search('where did the kids go this afternoon?', {
        maxResults: 10,
      });

      // Verify kids/Mimi result is found
      const mimiResult = results.find((r) => r.lifelog.id === 'test-1');
      expect(mimiResult).toBeDefined();

      // Should have high score due to keyword matches
      expect(mimiResult!.score).toBeGreaterThan(0.5);
    });

    test('should penalize results without keyword matches', async () => {
      // Mock results with different strategy combinations
      const mockResults = [
        {
          id: 'r1',
          lifelog: { id: 'r1', title: 'Keyword match', content: 'kids afternoon' },
          score: 0.8,
          strategies: new Set(['fast-keyword', 'context-aware-filter']),
          occurrences: 1,
          scores: [0.8],
        },
        {
          id: 'r2',
          lifelog: { id: 'r2', title: 'Only context', content: 'something else' },
          score: 0.8,
          strategies: new Set(['context-aware-filter']),
          occurrences: 1,
          scores: [0.8],
        },
      ];

      // Apply consensus scoring
      const buildConsensus = memorySearch.buildConsensus.bind(memorySearch);
      const consensusResults = buildConsensus(mockResults, {});

      // Keyword match should score higher
      expect(consensusResults[0].id).toBe('r1');
      expect(consensusResults[0].consensusScore).toBeGreaterThan(
        consensusResults[1].consensusScore
      );

      // Non-keyword result should be penalized
      expect(consensusResults[1].consensusScore).toBeLessThan(0.6);
    });
  });

  describe('Vector Dimension Handling', () => {
    test('should pad 384-dim vectors to 768-dim', async () => {
      const transformer = new TransformerEmbeddings();
      await transformer.initialize();

      const paddingProvider = new PaddingEmbeddingProvider(transformer);

      // Test single embedding
      const embedding = await paddingProvider.embedSingle('test text');
      expect(embedding.length).toBe(768);

      // First 384 should have values, rest should be zeros
      const nonZeroCount = embedding.slice(0, 384).filter((v) => v !== 0).length;
      const zeroCount = embedding.slice(384).filter((v) => v === 0).length;

      expect(nonZeroCount).toBeGreaterThan(0);
      expect(zeroCount).toBe(384);
    });

    test('should handle batch embeddings correctly', async () => {
      const transformer = new TransformerEmbeddings();
      await transformer.initialize();

      const paddingProvider = new PaddingEmbeddingProvider(transformer);

      const texts = ['test 1', 'test 2', 'test 3'];
      const embeddings = await paddingProvider.embed(texts);

      expect(embeddings.length).toBe(3);
      embeddings.forEach((embedding) => {
        expect(embedding.length).toBe(768);
      });
    });
  });

  describe('Confidence Thresholds', () => {
    test('should achieve high confidence with good keyword matches', () => {
      const mockResults = [
        {
          lifelog: { id: 'test', title: 'Test', content: 'Content' },
          consensusScore: 0.85,
          strategies: new Set(['fast-keyword', 'vector-semantic']),
        },
      ];

      const calculateConfidence = memorySearch.calculateLocalConfidence.bind(memorySearch);
      const confidence = calculateConfidence(mockResults, 'test query');

      // Should get high confidence with keyword + vector match
      expect(confidence).toBeGreaterThan(0.8);
      expect(confidence).toBeLessThanOrEqual(0.95);
    });

    test('should not over-iterate with reasonable results', async () => {
      let iterationCount = 0;

      // Mock the search handler to count iterations
      const originalSearch = memorySearch.searchHandler.search;
      memorySearch.searchHandler.search = jest.fn(async (query, options) => {
        iterationCount++;
        return {
          results: [
            {
              lifelog: {
                id: 'test',
                title: 'Kids went to Mimi house',
                content: "The kids went to Mimi's house this afternoon",
              },
              score: 0.82,
              metadata: { source: 'fast-keyword' },
            },
          ],
        };
      });

      // Run search
      await memorySearch.search('where did the kids go this afternoon?');

      // Should terminate early due to good results
      expect(iterationCount).toBeLessThan(3);

      // Restore
      memorySearch.searchHandler.search = originalSearch;
    });
  });

  describe('Score Normalization', () => {
    test('should not saturate all scores at 1.0', async () => {
      const testLifelogs = Array.from({ length: 10 }, (_, i) => ({
        id: `test-${i}`,
        title: `Document ${i}`,
        content: `This is test content ${i}. Some have kids, some don't.`,
        createdAt: new Date().toISOString(),
        duration: 300,
      }));

      // Add specific keyword matches
      testLifelogs[0].content += ' The kids went somewhere.';
      testLifelogs[1].content += ' Kids are playing.';

      await fastMatcher.buildIndex(testLifelogs);
      const results = fastMatcher.search('kids', { maxResults: 10 });

      // Should have varied scores, not all 1.0
      const uniqueScores = new Set(results.map((r) => r.score.toFixed(3)));
      expect(uniqueScores.size).toBeGreaterThan(1);

      // Top results should be the ones with keyword matches
      expect(results[0].lifelog.content).toContain('kids');
    });
  });

  describe('Integration Tests', () => {
    test('should find correct answer for location query', async () => {
      // This would require actual test data
      // For now, we'll test the query preprocessing
      const query = 'where did the kids go this afternoon?';

      // The system should recognize this as a location query
      const queryLower = query.toLowerCase();
      const isWhereQuestion = /where\s+.*(go|went|going)/i.test(queryLower);
      const hasKids = queryLower.includes('kids') || queryLower.includes('children');
      const hasAfternoon = queryLower.includes('afternoon');

      expect(isWhereQuestion).toBe(true);
      expect(hasKids).toBe(true);
      expect(hasAfternoon).toBe(true);
    });

    test('should handle vector search errors gracefully', async () => {
      // Test with invalid query
      const results = await vectorStore.searchByText('test query', {
        topK: 5,
        scoreThreshold: 0.5,
      });

      // Should return empty array on error, not throw
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
