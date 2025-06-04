import { ChromaClient, Collection, IEmbeddingFunction } from 'chromadb';
import { pipeline } from 'chromadb-default-embed';
import { logger } from '../utils/logger.js';
import {
  BaseVectorStore,
  VectorDocument,
  VectorSearchResult,
  VectorStoreConfig,
  QueryOptions,
  EmbeddingProvider,
} from './vector-store.interface.js';

// ChromaDB embedding function wrapper
class ChromaDefaultEmbeddingFunction implements IEmbeddingFunction {
  private pipelineInstance: any;

  async generate(texts: string[]): Promise<number[][]> {
    if (!this.pipelineInstance) {
      // Initialize the pipeline on first use
      this.pipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    const results = await Promise.all(
      texts.map(async (text) => {
        const output = await this.pipelineInstance(text, { pooling: 'mean', normalize: true });
        // Ensure we return a proper number array
        return Array.from(output.data as Float32Array).map((v: any) => Number(v));
      })
    );

    return results;
  }
}

export class ChromaEmbeddingProvider implements EmbeddingProvider {
  private embedder: ChromaDefaultEmbeddingFunction;
  private dimension: number = 384; // default for all-MiniLM-L6-v2

  constructor() {
    this.embedder = new ChromaDefaultEmbeddingFunction();
  }

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const embeddings = await this.embedder.generate(texts);
      return embeddings;
    } catch (error) {
      logger.error('Failed to generate embeddings', { error, textCount: texts.length });
      throw error;
    }
  }

  async embedSingle(text: string): Promise<number[]> {
    const embeddings = await this.embed([text]);
    return embeddings[0];
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelName(): string {
    return 'all-MiniLM-L6-v2';
  }
}

export interface ChromaConfig extends VectorStoreConfig {
  host?: string;
  port?: number;
  ssl?: boolean;
  headers?: Record<string, string>;
}

export class ChromaVectorStore extends BaseVectorStore {
  private client: ChromaClient;
  private collection?: Collection;
  private chromaConfig: ChromaConfig;

  constructor(config: ChromaConfig, embeddingProvider?: EmbeddingProvider) {
    super(config, embeddingProvider || new ChromaEmbeddingProvider());
    this.chromaConfig = config;

    // Initialize ChromaDB client
    const chromaPath = config.persistPath || 'http://localhost:8000';

    // Check if we should use in-memory mode
    if (process.env.CHROMADB_MODE === 'memory' || chromaPath === 'memory') {
      // Use in-memory client (no server required)
      this.client = new ChromaClient();
    } else {
      this.client = new ChromaClient({
        path: chromaPath,
      });
    }
  }

  async initialize(): Promise<void> {
    try {
      const isMemoryMode =
        process.env.CHROMADB_MODE === 'memory' || this.chromaConfig.persistPath === 'memory';
      logger.info('Initializing ChromaDB vector store', {
        collection: this.config.collectionName,
        mode: isMemoryMode ? 'memory' : 'server',
        path: isMemoryMode ? 'in-memory' : this.chromaConfig.persistPath || 'http://localhost:8000',
      });

      // Create ChromaDB embedding function instance
      const chromaEmbedder = new ChromaDefaultEmbeddingFunction();

      // Create or get collection
      this.collection = await this.client
        .createCollection({
          name: this.config.collectionName,
          metadata: {
            description: 'Limitless AI lifelogs vector store',
            created: new Date().toISOString(),
          },
          embeddingFunction: chromaEmbedder,
        })
        .catch(async () => {
          // Collection might already exist, try to get it
          return await this.client.getCollection({
            name: this.config.collectionName,
            embeddingFunction: chromaEmbedder,
          });
        });

      logger.info('ChromaDB vector store initialized');
    } catch (error) {
      logger.error('Failed to initialize ChromaDB', { error });
      throw error;
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      // Ensure all documents have embeddings
      const docsWithEmbeddings = await this.ensureEmbeddings(documents);

      const ids = docsWithEmbeddings.map((doc) => doc.id);
      const embeddings = docsWithEmbeddings.map((doc) => doc.embedding!);
      const metadatas = docsWithEmbeddings.map((doc) => doc.metadata || {});
      const contents = docsWithEmbeddings.map((doc) => doc.content);

      await this.collection.add({
        ids,
        embeddings,
        metadatas,
        documents: contents,
      });

      logger.debug('Added documents to vector store', { count: documents.length });
    } catch (error) {
      logger.error('Failed to add documents', { error, count: documents.length });
      throw error;
    }
  }

  async updateDocument(id: string, document: Partial<VectorDocument>): Promise<void> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      // Delete existing document
      await this.deleteDocuments([id]);

      // Add updated document
      const existingDoc = await this.getDocument(id);
      if (existingDoc) {
        const updatedDoc: VectorDocument = {
          ...existingDoc,
          ...document,
          id, // Ensure ID doesn't change
        };
        await this.addDocuments([updatedDoc]);
      }
    } catch (error) {
      logger.error('Failed to update document', { error, id });
      throw error;
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      await this.collection.delete({ ids });
      logger.debug('Deleted documents from vector store', { count: ids.length });
    } catch (error) {
      logger.error('Failed to delete documents', { error, count: ids.length });
      throw error;
    }
  }

  async searchByText(query: string, options?: QueryOptions): Promise<VectorSearchResult[]> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      const embedding = await this.embeddingProvider.embedSingle(query);
      return await this.searchByVector(embedding, options);
    } catch (error) {
      logger.error('Failed to search by text', { error, query });
      throw error;
    }
  }

  async searchByVector(embedding: number[], options?: QueryOptions): Promise<VectorSearchResult[]> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      const topK = options?.topK || 10;
      const includeContent = options?.includeContent ?? true;
      const includeMetadata = options?.includeMetadata ?? true;

      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: topK,
        where: options?.filter,
      });

      // Transform results
      const searchResults: VectorSearchResult[] = [];

      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const score = results.distances?.[0]?.[i] || 0;

          // Apply score threshold if specified
          if (options?.scoreThreshold && score > options.scoreThreshold) {
            continue;
          }

          searchResults.push({
            id: results.ids[0][i] as string,
            score: 1 - score, // Convert distance to similarity score
            content: includeContent ? (results.documents?.[0]?.[i] as string) : undefined,
            metadata: includeMetadata
              ? (results.metadatas?.[0]?.[i] as Record<string, any>)
              : undefined,
          });
        }
      }

      return searchResults;
    } catch (error) {
      logger.error('Failed to search by vector', { error });
      throw error;
    }
  }

  async getDocument(id: string): Promise<VectorDocument | null> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      const result = await this.collection.get({ ids: [id] });

      if (!result.ids || result.ids.length === 0) {
        return null;
      }

      return {
        id: result.ids[0] as string,
        content: (result.documents?.[0] as string) || '',
        metadata: result.metadatas?.[0] as Record<string, any>,
        embedding: result.embeddings?.[0] as number[],
      };
    } catch (error) {
      logger.error('Failed to get document', { error, id });
      throw error;
    }
  }

  async getDocuments(ids: string[]): Promise<VectorDocument[]> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      const result = await this.collection.get({ ids });
      const documents: VectorDocument[] = [];

      if (result.ids) {
        for (let i = 0; i < result.ids.length; i++) {
          documents.push({
            id: result.ids[i] as string,
            content: (result.documents?.[i] as string) || '',
            metadata: result.metadatas?.[i] as Record<string, any>,
            embedding: result.embeddings?.[i] as number[],
          });
        }
      }

      return documents;
    } catch (error) {
      logger.error('Failed to get documents', { error, count: ids.length });
      throw error;
    }
  }

  async listDocumentIds(): Promise<string[]> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      // ChromaDB doesn't have a direct way to list all IDs efficiently
      // We'll use a large query to get all documents
      const result = await this.collection.get({ limit: 100000 });
      return (result.ids || []) as string[];
    } catch (error) {
      logger.error('Failed to list document IDs', { error });
      throw error;
    }
  }

  async getStats(): Promise<{ documentCount: number; indexSize?: number; lastUpdated?: Date }> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      const count = await this.collection.count();

      return {
        documentCount: count,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get stats', { error });
      throw error;
    }
  }

  async clear(): Promise<void> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    try {
      // Delete the collection and recreate it
      await this.client.deleteCollection({ name: this.config.collectionName });
      await this.initialize();
      logger.info('Cleared vector store');
    } catch (error) {
      logger.error('Failed to clear vector store', { error });
      throw error;
    }
  }

  async persist(): Promise<void> {
    // ChromaDB automatically persists data
    logger.debug('ChromaDB automatically persists data');
  }

  async close(): Promise<void> {
    // ChromaDB client doesn't require explicit closing
    this.collection = undefined;
    logger.debug('Closed ChromaDB connection');
  }

  /**
   * Check if ChromaDB server is running
   */
  async isServerRunning(): Promise<boolean> {
    try {
      await this.client.heartbeat();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start a local ChromaDB server (requires Docker)
   */
  static async startLocalServer(): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      // Check if Docker is installed
      await execAsync('docker --version');

      // Start ChromaDB container
      const command = 'docker run -d --name chromadb -p 8000:8000 chromadb/chroma:latest';
      await execAsync(command);

      logger.info('Started local ChromaDB server');
    } catch (error) {
      logger.error('Failed to start ChromaDB server', { error });
      throw new Error('Failed to start ChromaDB server. Ensure Docker is installed.');
    }
  }
}
