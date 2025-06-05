import { connect } from '@lancedb/lancedb';
import {
  BaseVectorStore,
  VectorDocument,
  VectorSearchResult,
  VectorStoreConfig,
  QueryOptions,
  EmbeddingProvider,
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
      if (
        'initialize' in this.embeddingProvider &&
        typeof this.embeddingProvider.initialize === 'function'
      ) {
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

  /**
   * Add contextual information to content before embedding (Contextual RAG)
   * This improves retrieval accuracy by up to 49% according to Anthropic's research
   */
  private addContext(content: string, metadata?: any): string {
    const contexts: string[] = [];

    // Add temporal context
    if (metadata?.date) {
      const date = new Date(metadata.date);
      contexts.push(
        `Date: ${date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`
      );

      // Add relative time context
      const now = new Date();
      const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) {
        contexts.push('Time: Today');
      } else if (daysAgo === 1) {
        contexts.push('Time: Yesterday');
      } else if (daysAgo < 7) {
        contexts.push(`Time: ${daysAgo} days ago`);
      } else if (daysAgo < 30) {
        contexts.push(`Time: ${Math.floor(daysAgo / 7)} weeks ago`);
      }
    }

    // Add topic/title context
    if (metadata?.title) {
      contexts.push(`Topic: ${metadata.title}`);
    }

    // Add duration context (for meetings)
    if (metadata?.duration) {
      const minutes = Math.round(metadata.duration / 60);
      if (minutes < 5) {
        contexts.push('Duration: Brief check-in');
      } else if (minutes < 30) {
        contexts.push(`Duration: ${minutes} minute short discussion`);
      } else if (minutes < 60) {
        contexts.push(`Duration: ${minutes} minute meeting`);
      } else {
        contexts.push(`Duration: ${Math.round(minutes / 60)} hour long meeting`);
      }
    }

    // Add any custom tags or categories
    if (metadata?.tags && Array.isArray(metadata.tags)) {
      contexts.push(`Tags: ${metadata.tags.join(', ')}`);
    }

    // This is the key: prepend context before content
    const contextString = contexts.length > 0 ? contexts.join('. ') + '\n\n' : '';
    return contextString + content;
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!this.db) throw new Error('LanceDB not initialized');

    logger.info(`Adding ${documents.length} documents to LanceDB with Contextual RAG`);

    // Check for existing documents to prevent duplicates
    let documentsToAdd = documents;
    if (this.table) {
      // Get existing document IDs
      const existingIds = new Set(await this.listDocumentIds());

      // Filter out documents that already exist
      documentsToAdd = documents.filter((doc) => !existingIds.has(doc.id));

      if (documentsToAdd.length < documents.length) {
        logger.info(`Skipping ${documents.length - documentsToAdd.length} duplicate documents`);
      }
    }

    if (documentsToAdd.length === 0) {
      logger.info('No new documents to add');
      return;
    }

    // Apply Contextual RAG: enrich documents with context before embedding
    const contextualDocs = documentsToAdd.map((doc) => ({
      ...doc,
      // Prepend context to content before embedding
      content: this.addContext(doc.content, doc.metadata),
    }));

    // Log sample of contextual enrichment for debugging
    if (contextualDocs.length > 0) {
      const sample = contextualDocs[0].content.substring(0, 200);
      logger.debug('Sample contextual content:', { sample });
    }

    // Ensure all documents have embeddings (now with context)
    const docsWithEmbeddings = await this.ensureEmbeddings(contextualDocs);

    // Convert to LanceDB format with proper field names
    // Store original content in metadata for retrieval
    const records = docsWithEmbeddings.map((doc, index) => ({
      id: doc.id,
      content: documentsToAdd[index].content, // Store original content without context
      vector: doc.embedding, // LanceDB expects 'vector' not 'embedding'
      metadata: JSON.stringify({
        ...doc.metadata,
        contextualContent: doc.content, // Store contextual content for debugging
      }),
    }));

    try {
      if (!this.table) {
        // Create table with first batch
        this.table = await this.db.createTable(this.config.collectionName, records);
        logger.info('Created new LanceDB table with contextual embeddings');
      } else {
        // Add to existing table
        await this.table.add(records);
      }
      logger.info(`Successfully added ${records.length} records with Contextual RAG embeddings`);
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
      // Apply contextual enrichment to query as well for better matching
      const enrichedQuery = this.enrichQuery(queryText);
      logger.debug('Enriched query:', { original: queryText, enriched: enrichedQuery });

      // Generate query embedding with enriched context
      const queryEmbedding = await this.embeddingProvider.embedSingle(enrichedQuery);

      // Perform vector search
      const results = await this.table
        .search(queryEmbedding)
        .limit(limit * 2) // Get more results since we filter by threshold
        .toArray();

      // Convert results
      const searchResults: VectorSearchResult[] = [];
      for (const row of results) {
        // LanceDB returns L2 (Euclidean) distance, convert to similarity score
        // Using exponential decay: score = exp(-distance)
        const distance = row._distance || 0;
        const score = Math.exp(-distance);
        if (score >= threshold) {
          searchResults.push({
            id: row.id,
            score,
            content: options.includeContent !== false ? row.content : undefined,
            metadata:
              options.includeMetadata !== false ? JSON.parse(row.metadata || '{}') : undefined,
          });
        }
        // Stop if we have enough results
        if (searchResults.length >= limit) break;
      }

      return searchResults;
    } catch (error) {
      logger.error('Search failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        query: queryText,
      });
      return [];
    }
  }

  /**
   * Enrich search queries with temporal context for better matching
   */
  private enrichQuery(query: string): string {
    const enrichments: string[] = [];

    // Add current temporal context for relative queries
    const now = new Date();
    enrichments.push(
      `Current date: ${now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`
    );

    // Detect temporal indicators in query
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('today')) {
      enrichments.push('Time: Today');
    } else if (lowerQuery.includes('yesterday')) {
      enrichments.push('Time: Yesterday');
    } else if (lowerQuery.includes('this week')) {
      enrichments.push('Time: Within 7 days');
    } else if (lowerQuery.includes('last week')) {
      enrichments.push('Time: 7-14 days ago');
    }

    // Detect meeting-related queries
    if (lowerQuery.includes('meeting') || lowerQuery.includes('discussion')) {
      enrichments.push('Type: Meeting or discussion');
    }

    // Prepend enrichments to query
    const enrichmentString =
      enrichments.length > 0 ? enrichments.join('. ') + '\n\nSearch query: ' : '';
    return enrichmentString + query;
  }

  async searchByVector(
    embedding: number[],
    options: QueryOptions = {}
  ): Promise<VectorSearchResult[]> {
    if (!this.table) return [];

    const limit = options.topK || 10;
    const threshold = options.scoreThreshold || 0.0;

    try {
      const searchResults: VectorSearchResult[] = [];
      const results = await this.table
        .search(embedding)
        .limit(limit * 2)
        .toArray();

      for (const row of results) {
        // LanceDB returns L2 (Euclidean) distance, convert to similarity score
        const distance = row._distance || 0;
        const score = Math.exp(-distance);
        if (score >= threshold) {
          searchResults.push({
            id: row.id,
            score,
            content: options.includeContent !== false ? row.content : undefined,
            metadata:
              options.includeMetadata !== false ? JSON.parse(row.metadata || '{}') : undefined,
          });
        }
        if (searchResults.length >= limit) break;
      }

      return searchResults;
    } catch (error) {
      logger.error('Vector search failed', { error });
      return [];
    }
  }

  /**
   * Update a document by deleting and re-adding it
   */
  async updateDocument(id: string, document: Partial<VectorDocument>): Promise<void> {
    if (!this.table) {
      throw new Error('LanceDB table not initialized');
    }

    try {
      // Get existing document
      const existing = await this.getDocument(id);
      if (!existing) {
        throw new Error(`Document ${id} not found`);
      }

      // Merge with updates
      const updated: VectorDocument = {
        ...existing,
        ...document,
        id, // Ensure ID doesn't change
      };

      // Delete old version
      await this.table.delete(`id = "${id}"`);

      // Add updated version with new embeddings
      await this.addDocuments([updated]);

      logger.info('Document updated successfully', { id });
    } catch (error) {
      logger.error('Failed to update document', { id, error });
      throw error;
    }
  }

  /**
   * Delete documents by IDs
   */
  async deleteDocuments(ids: string[]): Promise<void> {
    if (!this.table || ids.length === 0) return;

    try {
      // Build WHERE clause for multiple IDs
      const whereClause = ids.map((id) => `id = "${id}"`).join(' OR ');
      await this.table.delete(whereClause);

      logger.info('Documents deleted successfully', { count: ids.length });
    } catch (error) {
      logger.error('Failed to delete documents', { ids, error });
      throw error;
    }
  }

  /**
   * Get a single document by ID
   */
  async getDocument(id: string): Promise<VectorDocument | null> {
    if (!this.table) return null;

    try {
      // Search for exact ID match
      const results = await this.table.query().where(`id = "${id}"`).limit(1).toArray();

      if (results.length > 0) {
        const row = results[0];
        return {
          id: row.id,
          content: row.content,
          metadata: JSON.parse(row.metadata || '{}'),
          embedding: row.vector,
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get document', { id, error });
      return null;
    }
  }

  /**
   * Get multiple documents by IDs
   */
  async getDocuments(ids: string[]): Promise<VectorDocument[]> {
    if (!this.table || ids.length === 0) return [];

    try {
      // Build WHERE clause for multiple IDs
      const whereClause = ids.map((id) => `id = "${id}"`).join(' OR ');
      const results = await this.table.query().where(whereClause).toArray();

      const documents: VectorDocument[] = [];
      for (const row of results) {
        documents.push({
          id: row.id,
          content: row.content,
          metadata: JSON.parse(row.metadata || '{}'),
          embedding: row.vector,
        });
      }

      return documents;
    } catch (error) {
      logger.error('Failed to get documents', { ids, error });
      return [];
    }
  }

  /**
   * List all document IDs
   */
  async listDocumentIds(): Promise<string[]> {
    if (!this.table) return [];

    try {
      // Query all rows and get just the IDs
      const rows = await this.table.query().toArray();
      return rows.map((row: any) => row.id);
    } catch (error) {
      logger.error('Failed to list document IDs', { error });
      return [];
    }
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
