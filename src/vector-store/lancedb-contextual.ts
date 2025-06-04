import { connect, Connection, Table } from 'vectordb';
import { pipeline } from '@xenova/transformers';
import { EmbeddingProvider } from './vector-store.interface.js';
import { logger } from '../utils/logger.js';
import { Phase2Lifelog } from '../types/phase2.js';

/**
 * Contextual RAG implementation using LanceDB
 * Based on Anthropic's approach: prepends context before embedding
 */
export class ContextualEmbeddingProvider implements EmbeddingProvider {
  private pipe: any | null = null;
  private modelName: string = 'Xenova/all-MiniLM-L6-v2';
  private dimension: number = 384;

  async initialize(): Promise<void> {
    logger.info('Initializing contextual embeddings', { model: this.modelName });
    this.pipe = await pipeline('feature-extraction', this.modelName);
  }

  /**
   * Add contextual information to text before embedding
   * This is the key innovation from Anthropic's Contextual RAG
   */
  private addContext(text: string, metadata?: any): string {
    const contexts: string[] = [];

    // Add temporal context
    if (metadata?.date) {
      contexts.push(`Date: ${new Date(metadata.date).toLocaleDateString()}`);
    }

    // Add conversation context
    if (metadata?.title) {
      contexts.push(`Topic: ${metadata.title}`);
    }

    // Add speaker context if available
    if (metadata?.speakers) {
      contexts.push(`Participants: ${metadata.speakers.join(', ')}`);
    }

    // Prepend context to the chunk
    const contextString = contexts.length > 0 ? contexts.join('. ') + '\n\n' : '';
    return contextString + text;
  }

  async embedSingle(text: string, metadata?: any): Promise<number[]> {
    if (!this.pipe) await this.initialize();

    // Add context before embedding (Contextual RAG approach)
    const contextualText = this.addContext(text, metadata);

    const output = await this.pipe(contextualText, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data);
  }

  async embed(texts: string[], metadata?: any[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i++) {
      const meta = metadata?.[i];
      const embedding = await this.embedSingle(texts[i], meta);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelName(): string {
    return `${this.modelName}-contextual`;
  }
}

/**
 * LanceDB Vector Store with Contextual RAG support
 * Provides fast, local vector search with Arrow-based storage
 */
export class LanceDBVectorStore {
  private db: Connection | null = null;
  private table: Table | null = null;
  private embeddingProvider: ContextualEmbeddingProvider;
  private dbPath: string;
  private tableName: string;

  constructor(dbPath: string = './data/lancedb', tableName: string = 'lifelogs') {
    this.dbPath = dbPath;
    this.tableName = tableName;
    this.embeddingProvider = new ContextualEmbeddingProvider();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing LanceDB vector store', {
      path: this.dbPath,
      table: this.tableName,
    });

    // Initialize embedding provider
    await this.embeddingProvider.initialize();

    // Connect to LanceDB
    this.db = await connect(this.dbPath);

    // Check if table exists
    const tables = await this.db.tableNames();
    if (!tables.includes(this.tableName)) {
      // Create table with schema
      await this.createTable();
    } else {
      this.table = await this.db.openTable(this.tableName);
    }

    logger.info('LanceDB initialized successfully');
  }

  private async createTable(): Promise<void> {
    // Create empty table with schema
    const schema = {
      id: 'string',
      content: 'string',
      title: 'string',
      date: 'string',
      embedding: `fixed_size_list[${this.embeddingProvider.getDimension()}]<float32>`,
      metadata: 'string', // JSON string
    };

    this.table = await this.db!.createTable(this.tableName, [], { schema });
  }

  async addLifelogs(lifelogs: Phase2Lifelog[]): Promise<void> {
    if (!this.table) throw new Error('Table not initialized');

    logger.info(`Adding ${lifelogs.length} lifelogs to LanceDB`);

    // Prepare data with contextual embeddings
    const records = await Promise.all(
      lifelogs.map(async (log) => {
        const metadata = {
          date: log.startTime,
          title: log.title,
          duration: log.durationSeconds,
        };

        // Generate contextual embedding
        const embedding = await this.embeddingProvider.embedSingle(log.content, metadata);

        return {
          id: log.id,
          content: log.content,
          title: log.title || '',
          date: log.startTime,
          embedding,
          metadata: JSON.stringify(metadata),
        };
      })
    );

    // Add to table
    await this.table.add(records);
    logger.info(`Successfully added ${records.length} records to LanceDB`);
  }

  async search(
    query: string,
    options: { limit?: number; threshold?: number } = {}
  ): Promise<any[]> {
    if (!this.table) throw new Error('Table not initialized');

    const limit = options.limit || 10;
    const threshold = options.threshold || 0.0;

    // Generate query embedding (without context for query)
    const queryEmbedding = await this.embeddingProvider.embedSingle(query);

    // Perform vector search
    const results = await this.table.search(queryEmbedding).limit(limit).execute();

    // Filter by threshold and format results
    return results
      .filter((r) => r._distance <= 1 - threshold) // Convert similarity to distance
      .map((r) => ({
        id: r.id,
        score: 1 - r._distance, // Convert back to similarity
        content: r.content,
        title: r.title,
        date: r.date,
        metadata: JSON.parse(r.metadata),
      }));
  }

  async hybridSearch(
    query: string,
    options: { limit?: number; dateFilter?: string } = {}
  ): Promise<any[]> {
    if (!this.table) throw new Error('Table not initialized');

    const limit = options.limit || 10;

    // Generate query embedding
    const queryEmbedding = await this.embeddingProvider.embedSingle(query);

    // Build query with optional filters
    let searchQuery = this.table.search(queryEmbedding);

    if (options.dateFilter) {
      searchQuery = searchQuery.where(`date = '${options.dateFilter}'`);
    }

    // Execute search
    const results = await searchQuery.limit(limit).execute();

    return results.map((r) => ({
      id: r.id,
      score: 1 - r._distance,
      content: r.content,
      title: r.title,
      date: r.date,
      metadata: JSON.parse(r.metadata),
    }));
  }

  async close(): Promise<void> {
    // LanceDB handles cleanup automatically
    this.db = null;
    this.table = null;
  }
}
