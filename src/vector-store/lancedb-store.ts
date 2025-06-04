import { connect } from '@lancedb/lancedb';
import { 
  BaseVectorStore,
  VectorDocument, 
  VectorSearchResult, 
  VectorStoreConfig,
  QueryOptions,
  EmbeddingProvider
} from './vector-store.interface.js';
import { TransformerEmbeddingProvider } from './transformer-embeddings.js';
import { logger } from '../utils/logger.js';

/**
 * Simple LanceDB implementation with Contextual RAG support
 * Uses TransformerEmbeddingProvider for high-quality embeddings
 */
export class LanceDBStore extends BaseVectorStore {
  private db: any = null;
  private table: any = null;
  private dbPath: string;
  private initialized: boolean = false;

  constructor(config: VectorStoreConfig, embeddingProvider?: EmbeddingProvider) {
    // Use TransformerEmbeddingProvider by default for best results
    super(config, embeddingProvider || new TransformerEmbeddingProvider());
    this.dbPath = config.persistPath || './data/lancedb';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing LanceDB store', {
      path: this.dbPath,
      collection: this.config.collectionName,
    });

    try {
      // Initialize embedding provider
      if ('initialize' in this.embeddingProvider && typeof this.embeddingProvider.initialize === 'function') {
        await this.embeddingProvider.initialize();
      }

      // Connect to LanceDB
      this.db = await connect(this.dbPath);
      
      // Check if table exists
      const tables = await this.db.tableNames();
      if (tables.includes(this.config.collectionName)) {
        this.table = await this.db.openTable(this.config.collectionName);
        logger.info('Opened existing LanceDB table');
      } else {
        logger.info('Table does not exist, will create on first insert');
      }
      
      this.initialized = true;
      logger.info('LanceDB store initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize LanceDB', { error });
      throw error;
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!this.db) throw new Error('LanceDB not initialized');

    logger.info(`Adding ${documents.length} documents to LanceDB`);

    // Ensure all documents have embeddings
    const docsWithEmbeddings = await this.ensureEmbeddings(documents);

    // Convert to LanceDB format with proper field names
    const records = docsWithEmbeddings.map(doc => ({
      id: doc.id,
      content: doc.content,
      vector: doc.embedding, // LanceDB expects 'vector' not 'embedding'
      metadata: JSON.stringify(doc.metadata || {}),
    }));

    try {
      if (!this.table) {
        // Create table with first batch
        this.table = await this.db.createTable(this.config.collectionName, records);
        logger.info('Created new LanceDB table with initial data');
      } else {
        // Add to existing table
        await this.table.add(records);
      }
      logger.info(`Successfully added ${records.length} records to LanceDB`);
    } catch (error) {
      logger.error('Failed to add documents to LanceDB', { error });
      throw error;
    }
  }

  async searchByText(queryText: string, options: QueryOptions = {}): Promise<VectorSearchResult[]> {
    if (!this.table) {
      logger.warn('No documents in LanceDB yet');
      return [];
    }

    const limit = options.topK || 10;
    const threshold = options.scoreThreshold || 0.0;

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingProvider.embedSingle(queryText);

      // Perform vector search
      const results: VectorSearchResult[] = [];
      const query = this.table.search(queryEmbedding).limit(limit);
      
      // Collect results
      for await (const batch of query) {
        const rows = batch.toArray();
        for (const row of rows) {
          const score = 1 - (row._distance || 0);
          if (score >= threshold) {
            results.push({
              id: row.id,
              score,
              content: options.includeContent !== false ? row.content : undefined,
              metadata: options.includeMetadata !== false ? JSON.parse(row.metadata || '{}') : undefined,
            });
          }
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Search failed', { error, query: queryText });
      return [];
    }
  }

  async searchByVector(embedding: number[], options: QueryOptions = {}): Promise<VectorSearchResult[]> {
    if (!this.table) return [];

    const limit = options.topK || 10;
    const threshold = options.scoreThreshold || 0.0;

    try {
      const results: VectorSearchResult[] = [];
      const query = this.table.search(embedding).limit(limit);
      
      for await (const batch of query) {
        const rows = batch.toArray();
        for (const row of rows) {
          const score = 1 - (row._distance || 0);
          if (score >= threshold) {
            results.push({
              id: row.id,
              score,
              content: options.includeContent !== false ? row.content : undefined,
              metadata: options.includeMetadata !== false ? JSON.parse(row.metadata || '{}') : undefined,
            });
          }
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Vector search failed', { error });
      return [];
    }
  }

  // Simplified implementations for now
  async updateDocument(_id: string, _document: Partial<VectorDocument>): Promise<void> {
    logger.warn('LanceDB update not implemented - would need delete + re-add');
  }

  async deleteDocuments(_ids: string[]): Promise<void> {
    logger.warn('LanceDB delete not implemented');
  }

  async getDocument(_id: string): Promise<VectorDocument | null> {
    logger.warn('LanceDB getDocument not implemented');
    return null;
  }

  async getDocuments(_ids: string[]): Promise<VectorDocument[]> {
    return [];
  }

  async listDocumentIds(): Promise<string[]> {
    return [];
  }

  async getStats(): Promise<{ documentCount: number; indexSize?: number; lastUpdated?: Date }> {
    if (!this.table) {
      return { documentCount: 0 };
    }
    
    try {
      const count = await this.table.countRows();
      return { documentCount: count || 0 };
    } catch {
      return { documentCount: 0 };
    }
  }

  async clear(): Promise<void> {
    if (this.table && this.db) {
      try {
        await this.db.dropTable(this.config.collectionName);
        this.table = null;
      } catch (error) {
        logger.error('Failed to clear table', { error });
      }
    }
  }

  async close(): Promise<void> {
    this.db = null;
    this.table = null;
    this.initialized = false;
  }
}