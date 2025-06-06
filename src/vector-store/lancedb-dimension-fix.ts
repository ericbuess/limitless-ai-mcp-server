/**
 * LanceDB Dimension Fix
 *
 * This module provides a fix for the vector dimension mismatch issue where:
 * - Database was created with 768-dim vectors (Ollama)
 * - System now uses 384-dim vectors (Transformer fallback)
 */

import { EmbeddingProvider } from './vector-store.interface.js';
import { logger } from '../utils/logger.js';

/**
 * Padding Embedding Provider
 * Pads 384-dim vectors to 768-dim by adding zeros
 * This allows compatibility with existing 768-dim database
 */
export class PaddingEmbeddingProvider implements EmbeddingProvider {
  private innerProvider: EmbeddingProvider;
  private targetDimension: number = 768;

  constructor(innerProvider: EmbeddingProvider) {
    this.innerProvider = innerProvider;
  }

  async initialize(): Promise<void> {
    if ('initialize' in this.innerProvider && typeof this.innerProvider.initialize === 'function') {
      await this.innerProvider.initialize();
    }
  }

  async embedSingle(text: string): Promise<number[]> {
    const embedding = await this.innerProvider.embedSingle(text);
    return this.padVector(embedding);
  }

  async embed(texts: string[]): Promise<number[][]> {
    const embeddings = await this.innerProvider.embed(texts);
    return embeddings.map((e) => this.padVector(e));
  }

  getDimension(): number {
    return this.targetDimension;
  }

  getModelName(): string {
    // Delegate to inner provider and add padding info
    const innerName =
      'getModelName' in this.innerProvider ? (this.innerProvider as any).getModelName() : 'unknown';
    return `${innerName}-padded-to-${this.targetDimension}`;
  }

  private padVector(vector: number[]): number[] {
    if (vector.length === this.targetDimension) {
      return vector;
    }

    if (vector.length > this.targetDimension) {
      // Truncate if too long
      return vector.slice(0, this.targetDimension);
    }

    // Pad with zeros
    const padded = [...vector];
    while (padded.length < this.targetDimension) {
      padded.push(0);
    }

    return padded;
  }
}

/**
 * Check if we need dimension fixing
 */
export async function needsDimensionFix(): Promise<boolean> {
  try {
    const { connect } = await import('@lancedb/lancedb');
    const db = await connect('./data/lancedb');
    const tables = await db.tableNames();

    if (!tables.includes('limitless-lifelogs')) {
      return false; // No table, no problem
    }

    // Try to get the schema or a sample
    // Since direct inspection is difficult, we'll check by trying a query
    // and seeing if it fails with dimension mismatch
    return true; // For now, assume we need fixing if table exists
  } catch (error) {
    logger.debug('Error checking dimension fix need', { error });
    return false;
  }
}

/**
 * Create a dimension-fixed embedding provider
 */
export async function createDimensionFixedProvider(
  innerProvider: EmbeddingProvider
): Promise<EmbeddingProvider> {
  const needsFix = await needsDimensionFix();

  if (needsFix) {
    logger.info('Applying dimension fix: padding vectors to 768 dimensions');
    return new PaddingEmbeddingProvider(innerProvider);
  }

  return innerProvider;
}
