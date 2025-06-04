import {
  BaseVectorStore,
  VectorDocument,
  VectorSearchResult,
  VectorStoreConfig,
  QueryOptions,
  EmbeddingProvider,
} from './vector-store.interface.js';
import { logger } from '../utils/logger.js';

/**
 * Simple in-memory vector store using cosine similarity
 * No external dependencies required
 */
export class SimpleVectorStore extends BaseVectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private embeddings: Map<string, number[]> = new Map();

  constructor(config: VectorStoreConfig, embeddingProvider: EmbeddingProvider) {
    super(config, embeddingProvider);
    logger.info('Initializing simple in-memory vector store');
  }

  async initialize(): Promise<void> {
    // Initialize embedding provider if it has an initialize method
    if (
      'initialize' in this.embeddingProvider &&
      typeof this.embeddingProvider.initialize === 'function'
    ) {
      await this.embeddingProvider.initialize();
    }

    logger.info('Simple vector store initialized', {
      collection: this.config.collectionName,
      embeddingDimension: this.embeddingProvider.getDimension(),
    });
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    logger.info(`Adding ${documents.length} documents to vector store`);

    for (const doc of documents) {
      // Generate embedding if not provided
      let embedding = doc.embedding;
      if (!embedding) {
        embedding = await this.embeddingProvider.embedSingle(doc.content);
      }

      this.documents.set(doc.id, doc);
      this.embeddings.set(doc.id, embedding);
    }

    logger.info(`Vector store now contains ${this.documents.size} documents`);
  }

  async searchByText(query: string, options: QueryOptions = {}): Promise<VectorSearchResult[]> {
    const limit = options.topK || 10;
    const threshold = options.scoreThreshold || 0.0;

    logger.debug(`Searching for: "${query}" with threshold ${threshold}`);

    // Generate query embedding
    const queryEmbedding = await this.embeddingProvider.embedSingle(query);
    logger.debug(`Query embedding generated, dimension: ${queryEmbedding.length}`);

    // Calculate similarities
    const results: Array<{ id: string; similarity: number }> = [];

    for (const [id, docEmbedding] of this.embeddings) {
      const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);

      // Apply metadata filter if provided
      if (options.filter) {
        const doc = this.documents.get(id);
        if (!doc || !this.matchesFilter(doc.metadata || {}, options.filter)) {
          continue;
        }
      }

      if (similarity >= threshold) {
        results.push({ id, similarity });
      }
    }

    logger.debug(`Found ${results.length} results above threshold`);

    // Sort by similarity (descending) and limit
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, limit);

    // Build response
    return topResults.map(({ id, similarity }) => {
      const doc = this.documents.get(id)!;
      const result: VectorSearchResult = {
        id: doc.id,
        score: similarity,
      };

      if (options.includeContent !== false) {
        result.content = doc.content;
      }

      if (options.includeMetadata !== false) {
        result.metadata = doc.metadata;
      }

      return result;
    });
  }

  async searchByVector(
    embedding: number[],
    options: QueryOptions = {}
  ): Promise<VectorSearchResult[]> {
    const limit = options.topK || 10;
    const threshold = options.scoreThreshold || 0.0;

    // Calculate similarities
    const results: Array<{ id: string; similarity: number }> = [];

    for (const [id, docEmbedding] of this.embeddings) {
      const similarity = this.cosineSimilarity(embedding, docEmbedding);

      // Apply metadata filter if provided
      if (options.filter) {
        const doc = this.documents.get(id);
        if (!doc || !this.matchesFilter(doc.metadata || {}, options.filter)) {
          continue;
        }
      }

      if (similarity >= threshold) {
        results.push({ id, similarity });
      }
    }

    // Sort by similarity (descending) and limit
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, limit);

    // Build response
    return topResults.map(({ id, similarity }) => {
      const doc = this.documents.get(id)!;
      const result: VectorSearchResult = {
        id: doc.id,
        score: similarity,
      };

      if (options.includeContent !== false) {
        result.content = doc.content;
      }

      if (options.includeMetadata !== false) {
        result.metadata = doc.metadata;
      }

      return result;
    });
  }

  async updateDocument(id: string, document: Partial<VectorDocument>): Promise<void> {
    const existing = this.documents.get(id);
    if (!existing) {
      throw new Error(`Document ${id} not found`);
    }

    // Update document
    const updated = { ...existing, ...document };
    this.documents.set(id, updated);

    // Update embedding if content changed
    if (document.content) {
      const embedding = await this.embeddingProvider.embedSingle(document.content);
      this.embeddings.set(id, embedding);
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.documents.delete(id);
      this.embeddings.delete(id);
    }
  }

  async getDocuments(ids: string[]): Promise<VectorDocument[]> {
    const docs: VectorDocument[] = [];
    for (const id of ids) {
      const doc = this.documents.get(id);
      if (doc) {
        docs.push(doc);
      }
    }
    return docs;
  }

  async listDocumentIds(): Promise<string[]> {
    return Array.from(this.documents.keys());
  }

  async getStats(): Promise<{
    documentCount: number;
    indexSize?: number;
    lastUpdated?: Date;
  }> {
    return {
      documentCount: this.documents.size,
      indexSize: this.embeddings.size * this.embeddingProvider.getDimension() * 4, // Approximate bytes
    };
  }

  async clear(): Promise<void> {
    this.documents.clear();
    this.embeddings.clear();
  }

  async getDocument(id: string): Promise<VectorDocument | null> {
    return this.documents.get(id) || null;
  }

  async close(): Promise<void> {
    // Nothing to close for in-memory store
    this.clear();
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Check if metadata matches filter criteria
   */
  private matchesFilter(metadata: Record<string, any>, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Simple embedding provider using basic text statistics
 * This is a placeholder - for production use, consider using a proper embedding model
 */
export class SimpleEmbeddingProvider implements EmbeddingProvider {
  private dimension: number = 100;

  async embed(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedSingle(text)));
  }

  async embedSingle(text: string): Promise<number[]> {
    // Simple embedding based on character frequencies and text statistics
    // This is just for testing - real embeddings would use a proper model

    const embedding = new Array(this.dimension).fill(0);
    const normalizedText = text.toLowerCase();

    // Use character frequencies
    for (let i = 0; i < normalizedText.length; i++) {
      const charCode = normalizedText.charCodeAt(i);
      const index = charCode % this.dimension;
      embedding[index] += 1;
    }

    // Add word count features
    const words = normalizedText.split(/\s+/);
    embedding[0] = words.length;
    embedding[1] = normalizedText.length;
    embedding[2] = words.filter((w) => w.length > 5).length;

    // Add some randomness for variety (seeded by text)
    let seed = 0;
    for (const char of normalizedText) {
      seed += char.charCodeAt(0);
    }
    for (let i = 3; i < 10; i++) {
      embedding[i] = (seed * (i + 1)) % 10;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelName(): string {
    return 'simple-text-stats';
  }
}
