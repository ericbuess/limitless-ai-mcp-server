export interface VectorDocument {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
}

export interface VectorSearchResult {
  id: string;
  score: number;
  content?: string;
  metadata?: Record<string, any>;
}

export interface VectorStoreConfig {
  collectionName: string;
  embeddingDimension?: number;
  distanceMetric?: 'cosine' | 'euclidean' | 'dot';
  persistPath?: string;
}

export interface QueryOptions {
  topK?: number;
  filter?: Record<string, any>;
  includeContent?: boolean;
  includeMetadata?: boolean;
  scoreThreshold?: number;
}

export interface VectorStore {
  /**
   * Initialize the vector store
   */
  initialize(): Promise<void>;

  /**
   * Add documents to the vector store
   * If embeddings are not provided, they will be generated
   */
  addDocuments(documents: VectorDocument[]): Promise<void>;

  /**
   * Update an existing document
   */
  updateDocument(id: string, document: Partial<VectorDocument>): Promise<void>;

  /**
   * Delete documents by IDs
   */
  deleteDocuments(ids: string[]): Promise<void>;

  /**
   * Search by text query
   * The query will be embedded and used for similarity search
   */
  searchByText(query: string, options?: QueryOptions): Promise<VectorSearchResult[]>;

  /**
   * Search by embedding vector
   */
  searchByVector(embedding: number[], options?: QueryOptions): Promise<VectorSearchResult[]>;

  /**
   * Get document by ID
   */
  getDocument(id: string): Promise<VectorDocument | null>;

  /**
   * Get multiple documents by IDs
   */
  getDocuments(ids: string[]): Promise<VectorDocument[]>;

  /**
   * List all document IDs in the store
   */
  listDocumentIds(): Promise<string[]>;

  /**
   * Get statistics about the vector store
   */
  getStats(): Promise<{
    documentCount: number;
    indexSize?: number;
    lastUpdated?: Date;
  }>;

  /**
   * Clear all documents from the store
   */
  clear(): Promise<void>;

  /**
   * Persist the vector store to disk (if supported)
   */
  persist?(): Promise<void>;

  /**
   * Close connections and cleanup
   */
  close(): Promise<void>;
}

export interface EmbeddingProvider {
  /**
   * Generate embeddings for text
   */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * Generate a single embedding
   */
  embedSingle(text: string): Promise<number[]>;

  /**
   * Get the dimension of embeddings
   */
  getDimension(): number;

  /**
   * Get the model name
   */
  getModelName(): string;
}

export abstract class BaseVectorStore implements VectorStore {
  protected config: VectorStoreConfig;
  protected embeddingProvider: EmbeddingProvider;

  constructor(config: VectorStoreConfig, embeddingProvider: EmbeddingProvider) {
    this.config = config;
    this.embeddingProvider = embeddingProvider;
  }

  abstract initialize(): Promise<void>;
  abstract addDocuments(documents: VectorDocument[]): Promise<void>;
  abstract updateDocument(id: string, document: Partial<VectorDocument>): Promise<void>;
  abstract deleteDocuments(ids: string[]): Promise<void>;
  abstract searchByText(query: string, options?: QueryOptions): Promise<VectorSearchResult[]>;
  abstract searchByVector(
    embedding: number[],
    options?: QueryOptions
  ): Promise<VectorSearchResult[]>;
  abstract getDocument(id: string): Promise<VectorDocument | null>;
  abstract getDocuments(ids: string[]): Promise<VectorDocument[]>;
  abstract listDocumentIds(): Promise<string[]>;
  abstract getStats(): Promise<{ documentCount: number; indexSize?: number; lastUpdated?: Date }>;
  abstract clear(): Promise<void>;
  abstract close(): Promise<void>;

  protected async ensureEmbeddings(documents: VectorDocument[]): Promise<VectorDocument[]> {
    const toEmbed: { index: number; content: string }[] = [];

    documents.forEach((doc, index) => {
      if (!doc.embedding) {
        toEmbed.push({ index, content: doc.content });
      }
    });

    if (toEmbed.length === 0) {
      return documents;
    }

    const embeddings = await this.embeddingProvider.embed(toEmbed.map((item) => item.content));

    const result = [...documents];
    toEmbed.forEach((item, i) => {
      result[item.index] = {
        ...result[item.index],
        embedding: embeddings[i],
      };
    });

    return result;
  }
}
