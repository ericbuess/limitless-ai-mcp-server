import { pipeline } from '@xenova/transformers';
import { EmbeddingProvider } from './vector-store.interface.js';
import { logger } from '../utils/logger.js';

/**
 * Production-ready embedding provider using Xenova transformers
 * Provides high-quality sentence embeddings that work offline
 */
export class TransformerEmbeddingProvider implements EmbeddingProvider {
  private pipe: any | null = null;
  private modelName: string = 'Xenova/all-MiniLM-L6-v2';
  private dimension: number = 384;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing transformer embeddings', { model: this.modelName });

    try {
      logger.info('Initializing transformer model...', { model: this.modelName });

      // This downloads the model on first use, then caches it
      // Model is ~90MB, download may take a moment on first run
      const startTime = Date.now();

      this.pipe = await pipeline('feature-extraction', this.modelName, {
        // Cache models in project directory
        cache_dir: './models',
        // Progress callback for model download
        progress_callback: (progress: any) => {
          if (progress.status === 'downloading' && progress.progress) {
            const percentage = Math.round(progress.progress);
            logger.info(`Model download progress: ${percentage}%`);
          }
        },
      });

      const initTime = Date.now() - startTime;
      this.initialized = true;
      logger.info('Transformer embeddings initialized successfully', {
        model: this.modelName,
        dimension: this.dimension,
        initTimeMs: initTime,
      });
    } catch (error) {
      logger.error('Failed to initialize transformer embeddings', { error });
      throw error;
    }
  }

  async embedSingle(text: string, _metadata?: any): Promise<number[]> {
    if (!this.pipe) {
      await this.initialize();
    }

    try {
      // Generate embeddings with mean pooling and normalization
      const output = await this.pipe!(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert to regular array
      return Array.from(output.data);
    } catch (error) {
      logger.error('Failed to generate embedding', { error, textLength: text.length });
      throw error;
    }
  }

  async embed(texts: string[], _metadata?: any[]): Promise<number[][]> {
    if (!this.pipe) {
      await this.initialize();
    }

    // Process in batches for better performance
    const batchSize = 10;
    const embeddings: number[][] = [];
    const totalTexts = texts.length;

    if (totalTexts > batchSize) {
      logger.info(`Generating embeddings for ${totalTexts} texts in batches...`);
    }

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await Promise.all(batch.map((text) => this.embedSingle(text)));
      embeddings.push(...batchEmbeddings);

      if (totalTexts > batchSize) {
        const progress = Math.min(i + batchSize, totalTexts);
        const percentage = Math.round((progress / totalTexts) * 100);
        logger.debug(`Embedding progress: ${progress}/${totalTexts} (${percentage}%)`);
      }
    }

    return embeddings;
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelName(): string {
    return this.modelName;
  }
}

/**
 * Fallback embedding provider using TF-IDF style approach
 * Better than character frequency but not as good as transformers
 */
export class TFIDFEmbeddingProvider implements EmbeddingProvider {
  private dimension: number = 200;

  async initialize(): Promise<void> {
    logger.info('TF-IDF embeddings initialized (fallback mode)');
  }

  async embedSingle(text: string, _metadata?: any): Promise<number[]> {
    // Simple TF-IDF inspired approach
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(this.dimension).fill(0);

    // Use word hashing to map words to dimensions
    words.forEach((word) => {
      const hash = this.hashWord(word);
      const index = Math.abs(hash) % this.dimension;
      embedding[index] += 1 / Math.sqrt(words.length); // TF with length normalization
    });

    // L2 normalization
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      return embedding.map((val) => val / norm);
    }

    return embedding;
  }

  async embed(texts: string[], _metadata?: any[]): Promise<number[][]> {
    return Promise.all(texts.map((text, i) => this.embedSingle(text, _metadata?.[i])));
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelName(): string {
    return 'tfidf-hash';
  }

  private hashWord(word: string): number {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      const char = word.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}
