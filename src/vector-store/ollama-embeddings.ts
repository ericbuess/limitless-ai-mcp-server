import { EmbeddingProvider } from './vector-store.interface.js';
import { logger } from '../utils/logger.js';
import axios, { AxiosInstance } from 'axios';

/**
 * Ollama-based embedding provider for local embeddings
 * Supports multiple models and falls back to TransformerEmbeddingProvider if Ollama is unavailable
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private model: string;
  private baseUrl: string;
  private dimension: number;
  private initialized: boolean = false;
  private ollamaAvailable: boolean = false;
  private client: AxiosInstance;
  private fallbackProvider?: EmbeddingProvider;

  constructor(model: string = 'nomic-embed-text', fallbackProvider?: EmbeddingProvider) {
    this.model = model;
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.dimension = this.getModelDimension(model);
    this.fallbackProvider = fallbackProvider;

    // Create axios client with timeout
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private getModelDimension(model: string): number {
    const dimensions: Record<string, number> = {
      'nomic-embed-text': 768,
      'nomic-embed-text-v1.5': 768,
      'mxbai-embed-large': 1024,
      'all-minilm': 384,
      'all-minilm:v2': 384,
      'bge-small': 384,
      'bge-base': 768,
      'bge-large': 1024,
    };
    return dimensions[model] || 768;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing Ollama embeddings', { model: this.model, baseUrl: this.baseUrl });

    try {
      // Check if Ollama is running
      const response = await this.client.get('/api/tags');
      const models = response.data?.models || [];

      // Check if our model is available
      const modelAvailable = models.some(
        (m: any) => m.name === this.model || m.name.startsWith(this.model + ':')
      );

      if (!modelAvailable) {
        logger.warn(`Model ${this.model} not found in Ollama. Available models:`, {
          models: models.map((m: any) => m.name),
        });

        // Try to pull the model
        logger.info(`Attempting to pull model ${this.model}...`);
        await this.pullModel();
      }

      this.ollamaAvailable = true;
      this.initialized = true;
      logger.info('Ollama embeddings initialized successfully', {
        model: this.model,
        dimension: this.dimension,
      });
    } catch (error) {
      logger.warn('Ollama not available, will use fallback provider', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Initialize fallback provider if available
      if (this.fallbackProvider && 'initialize' in this.fallbackProvider) {
        await (this.fallbackProvider as any).initialize();
      }

      this.ollamaAvailable = false;
      this.initialized = true;
    }
  }

  private async pullModel(): Promise<void> {
    try {
      logger.info(`Pulling Ollama model ${this.model}...`);

      const response = await this.client.post('/api/pull', {
        name: this.model,
        stream: false, // For simplicity, not streaming
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      logger.info(`Successfully pulled model ${this.model}`);
    } catch (error) {
      logger.error('Failed to pull Ollama model', {
        model: this.model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async embedSingle(text: string, metadata?: any): Promise<number[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Use fallback if Ollama is not available
    if (!this.ollamaAvailable && this.fallbackProvider) {
      return this.fallbackProvider.embedSingle(text, metadata);
    }

    if (!this.ollamaAvailable) {
      throw new Error('Ollama is not available and no fallback provider configured');
    }

    try {
      const response = await this.client.post('/api/embeddings', {
        model: this.model,
        prompt: text,
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      const embedding = response.data.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding with Ollama', {
        error: error instanceof Error ? error.message : String(error),
        textLength: text.length,
      });

      // Try fallback if available
      if (this.fallbackProvider) {
        logger.info('Falling back to alternative embedding provider');
        return this.fallbackProvider.embedSingle(text, metadata);
      }

      throw error;
    }
  }

  async embed(texts: string[], metadata?: any[]): Promise<number[][]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Ollama doesn't support batch embeddings natively, so we process in parallel
    // but with a concurrency limit to avoid overwhelming the server
    const batchSize = 10;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchMetadata = metadata?.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map((text, j) => this.embedSingle(text, batchMetadata?.[j]))
      );
      embeddings.push(...batchEmbeddings);

      // Log progress for large batches
      if (texts.length > batchSize) {
        const progress = Math.min(i + batchSize, texts.length);
        const percentage = Math.round((progress / texts.length) * 100);
        logger.debug(`Ollama embedding progress: ${progress}/${texts.length} (${percentage}%)`);
      }
    }

    return embeddings;
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelName(): string {
    return `ollama:${this.model}`;
  }

  isAvailable(): boolean {
    return this.ollamaAvailable;
  }
}

/**
 * Factory function to create the best available embedding provider
 */
export async function createBestEmbeddingProvider(): Promise<EmbeddingProvider> {
  // Try Ollama first with nomic-embed-text (768 dims, good quality)
  const ollama = new OllamaEmbeddingProvider('nomic-embed-text');
  await ollama.initialize();

  if (ollama.isAvailable()) {
    logger.info('Using Ollama embeddings with nomic-embed-text');
    return ollama;
  }

  // Fall back to transformer embeddings
  logger.info('Falling back to transformer embeddings');
  const { TransformerEmbeddingProvider } = await import('./transformer-embeddings.js');
  const transformer = new TransformerEmbeddingProvider();
  await transformer.initialize();
  return transformer;
}
