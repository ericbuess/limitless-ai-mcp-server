import { LanceDBStore } from '../vector-store/lancedb-store.js';
import { FileManager } from '../storage/file-manager.js';
import { logger } from '../utils/logger.js';
import type { QueryOptions, VectorSearchResult } from '../vector-store/vector-store.interface.js';

export interface HybridSearchResult {
  id: string;
  score: number;
  content?: string;
  metadata?: any;
  source: 'keyword' | 'vector' | 'hybrid';
  keywordScore?: number;
  vectorScore?: number;
}

/**
 * Hybrid searcher that combines keyword and vector search
 * Uses Reciprocal Rank Fusion (RRF) for result combination
 */
export class HybridSearcher {
  private vectorStore: LanceDBStore;
  private fileManager: FileManager;
  private keywordIndex: Map<string, Set<string>> = new Map(); // term -> document IDs
  private documentIndex: Map<string, string> = new Map(); // doc ID -> content
  private initialized: boolean = false;

  constructor(vectorStore: LanceDBStore, fileManager: FileManager) {
    this.vectorStore = vectorStore;
    this.fileManager = fileManager;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing hybrid searcher...');

    // Initialize vector store
    await this.vectorStore.initialize();

    // Build keyword index
    await this.buildKeywordIndex();

    this.initialized = true;
    logger.info('Hybrid searcher initialized');
  }

  /**
   * Build inverted index for keyword search
   */
  private async buildKeywordIndex(): Promise<void> {
    logger.info('Building keyword index...');

    const startTime = Date.now();
    let documentCount = 0;

    // Get all document IDs from vector store
    const documentIds = await this.vectorStore.listDocumentIds();

    // Process documents in batches
    const batchSize = 100;
    for (let i = 0; i < documentIds.length; i += batchSize) {
      const batch = documentIds.slice(i, i + batchSize);
      const documents = await this.vectorStore.getDocuments(batch);

      for (const doc of documents) {
        if (doc.content) {
          // Store document content
          this.documentIndex.set(doc.id, doc.content);

          // Extract and index terms
          const terms = this.extractTerms(doc.content);
          for (const term of terms) {
            if (!this.keywordIndex.has(term)) {
              this.keywordIndex.set(term, new Set());
            }
            this.keywordIndex.get(term)!.add(doc.id);
          }

          documentCount++;
        }
      }

      if (documentCount % 1000 === 0) {
        logger.debug(`Indexed ${documentCount} documents...`);
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info('Keyword index built', {
      documents: documentCount,
      uniqueTerms: this.keywordIndex.size,
      timeMs: elapsed,
    });
  }

  /**
   * Extract searchable terms from text
   */
  private extractTerms(text: string): Set<string> {
    // Convert to lowercase and split by whitespace and punctuation
    const words = text.toLowerCase().split(/[\s\W]+/);

    // Filter out empty strings and very short words
    const terms = new Set<string>();
    for (const word of words) {
      if (word.length > 2) {
        terms.add(word);

        // Also add word stems (simple stemming)
        if (word.endsWith('ing')) {
          terms.add(word.slice(0, -3));
        } else if (word.endsWith('ed')) {
          terms.add(word.slice(0, -2));
        } else if (word.endsWith('s') && word.length > 3) {
          terms.add(word.slice(0, -1));
        }
      }
    }

    return terms;
  }

  /**
   * Perform keyword search using inverted index
   */
  private async keywordSearch(query: string, limit: number): Promise<HybridSearchResult[]> {
    const queryTerms = this.extractTerms(query);
    const documentScores = new Map<string, number>();

    // Calculate BM25-like scores
    const k1 = 1.2; // BM25 parameter
    const b = 0.75; // BM25 parameter
    const avgDocLength = 500; // Approximate average document length

    for (const term of queryTerms) {
      const postings = this.keywordIndex.get(term);
      if (!postings) continue;

      const idf = Math.log((this.documentIndex.size - postings.size + 0.5) / (postings.size + 0.5));

      for (const docId of postings) {
        const content = this.documentIndex.get(docId);
        if (!content) continue;

        // Count term frequency
        const termFreq = (content.toLowerCase().match(new RegExp(term, 'g')) || []).length;
        const docLength = content.length;

        // BM25 scoring
        const score =
          (idf * (termFreq * (k1 + 1))) /
          (termFreq + k1 * (1 - b + b * (docLength / avgDocLength)));

        documentScores.set(docId, (documentScores.get(docId) || 0) + score);
      }
    }

    // Sort by score and return top results
    const sortedResults = Array.from(documentScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({
        id,
        score: score / queryTerms.size, // Normalize by query length
        content: this.documentIndex.get(id),
        source: 'keyword' as const,
        keywordScore: score,
      }));

    return sortedResults;
  }

  /**
   * Perform hybrid search combining keyword and vector search
   */
  async search(query: string, options: QueryOptions = {}): Promise<HybridSearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const limit = options.topK || 10;
    const hybridWeight = options.hybridWeight || 0.5; // Balance between keyword and vector

    logger.debug('Performing hybrid search', { query, limit });

    // Perform searches in parallel
    const [keywordResults, vectorResults] = await Promise.all([
      this.keywordSearch(query, limit * 2),
      this.vectorStore.searchByText(query, { ...options, topK: limit * 2 }),
    ]);

    logger.debug('Search results', {
      keywordCount: keywordResults.length,
      vectorCount: vectorResults.length,
    });

    // Use Reciprocal Rank Fusion to combine results
    const fusedResults = this.reciprocalRankFusion(
      keywordResults,
      vectorResults,
      limit,
      hybridWeight
    );

    return fusedResults;
  }

  /**
   * Reciprocal Rank Fusion (RRF) for combining rankings
   * Better than score-based fusion as it handles different score scales
   */
  private reciprocalRankFusion(
    keywordResults: HybridSearchResult[],
    vectorResults: VectorSearchResult[],
    limit: number,
    hybridWeight: number = 0.5
  ): HybridSearchResult[] {
    const k = 60; // RRF parameter (typically 60)
    const scores = new Map<string, { score: number; result: HybridSearchResult }>();

    // Weight for keyword vs vector (default 0.5 = equal weight)
    const keywordWeight = hybridWeight;
    const vectorWeight = 1 - hybridWeight;

    // Add keyword results
    keywordResults.forEach((result, rank) => {
      const rrfScore = keywordWeight / (k + rank + 1);
      const existing = scores.get(result.id);

      if (existing) {
        existing.score += rrfScore;
        existing.result.keywordScore = result.keywordScore;
      } else {
        scores.set(result.id, {
          score: rrfScore,
          result: {
            ...result,
            source: 'hybrid',
            score: rrfScore,
          },
        });
      }
    });

    // Add vector results
    vectorResults.forEach((result, rank) => {
      const rrfScore = vectorWeight / (k + rank + 1);
      const existing = scores.get(result.id);

      if (existing) {
        existing.score += rrfScore;
        existing.result.vectorScore = result.score;
        existing.result.content = existing.result.content || result.content;
        existing.result.metadata = existing.result.metadata || result.metadata;
      } else {
        scores.set(result.id, {
          score: rrfScore,
          result: {
            id: result.id,
            score: rrfScore,
            content: result.content,
            metadata: result.metadata,
            source: 'vector',
            vectorScore: result.score,
          },
        });
      }
    });

    // Sort by combined score and return top results
    const sortedResults = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => ({
        ...item.result,
        score: item.score,
      }));

    return sortedResults;
  }

  /**
   * Update keyword index when new documents are added
   */
  async updateIndex(documentIds: string[]): Promise<void> {
    const documents = await this.vectorStore.getDocuments(documentIds);

    for (const doc of documents) {
      if (doc.content) {
        // Store document content
        this.documentIndex.set(doc.id, doc.content);

        // Extract and index terms
        const terms = this.extractTerms(doc.content);
        for (const term of terms) {
          if (!this.keywordIndex.has(term)) {
            this.keywordIndex.set(term, new Set());
          }
          this.keywordIndex.get(term)!.add(doc.id);
        }
      }
    }

    logger.debug('Updated keyword index', { newDocuments: documents.length });
  }

  /**
   * Clear the keyword index
   */
  clearIndex(): void {
    this.keywordIndex.clear();
    this.documentIndex.clear();
    logger.info('Keyword index cleared');
  }
}
