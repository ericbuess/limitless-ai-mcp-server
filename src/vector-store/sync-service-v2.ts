import { LimitlessClient } from '../core/limitless-client.js';
import { FileManager } from '../storage/file-manager.js';
import { logger } from '../utils/logger.js';
import { toPhase2Lifelog } from '../types/phase2.js';
import type { VectorStore } from './vector-store.interface.js';
import { promises as fs } from 'fs';
import path from 'path';

export interface SyncServiceV2Options {
  pollInterval?: number; // milliseconds
  batchSize?: number;
  apiDelayMs?: number; // Delay between API requests
  checkpointInterval?: number; // Save progress every N lifelogs
  maxRetries?: number;
  downloadOnly?: boolean; // Phase 1: only download, no vectorization
}

export interface SyncProgress {
  phase: 'download' | 'vectorize' | 'idle';
  totalFound: number;
  totalDownloaded: number;
  totalVectorized: number;
  currentDate?: string;
  oldestDate?: string;
  newestDate?: string;
  lastCheckpoint?: Date;
  estimatedTimeRemaining?: number;
  errors: Array<{ date: string; error: string }>;
}

interface SyncCheckpoint {
  lastProcessedDate: string;
  totalDownloaded: number;
  totalVectorized: number;
  oldestDate: string;
  newestDate: string;
  errors: Array<{ date: string; error: string }>;
}

export class SyncServiceV2 {
  private client: LimitlessClient;
  private fileManager: FileManager;
  private vectorStore: VectorStore | null;
  private options: Required<SyncServiceV2Options>;
  private progress: SyncProgress;
  private checkpointPath: string;
  private isRunning: boolean = false;
  private isCancelled: boolean = false;

  constructor(
    client: LimitlessClient,
    fileManager: FileManager,
    vectorStore: VectorStore | null,
    options: SyncServiceV2Options = {}
  ) {
    this.client = client;
    this.fileManager = fileManager;
    this.vectorStore = vectorStore;

    this.options = {
      pollInterval: options.pollInterval || 60000, // 1 minute
      batchSize: options.batchSize || 50,
      apiDelayMs: options.apiDelayMs || 2000, // 2 second delay between API calls
      checkpointInterval: options.checkpointInterval || 100, // Checkpoint every 100 lifelogs
      maxRetries: options.maxRetries || 3,
      downloadOnly: options.downloadOnly ?? false,
    };

    this.progress = {
      phase: 'idle',
      totalFound: 0,
      totalDownloaded: 0,
      totalVectorized: 0,
      errors: [],
    };

    this.checkpointPath = path.join(fileManager['baseDir'], 'sync-checkpoint.json');
  }

  /**
   * Start the sync service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Sync service already running');
      return;
    }

    this.isRunning = true;
    this.isCancelled = false;

    logger.info('Starting sync service v2', {
      apiDelayMs: this.options.apiDelayMs,
      checkpointInterval: this.options.checkpointInterval,
      downloadOnly: this.options.downloadOnly,
    });

    // Initialize components
    await this.fileManager.initialize();
    if (this.vectorStore && !this.options.downloadOnly) {
      await this.vectorStore.initialize();
    }

    // Try to load checkpoint
    const checkpoint = await this.loadCheckpoint();
    if (checkpoint) {
      logger.info('Resuming from checkpoint', checkpoint);
      this.progress.totalDownloaded = checkpoint.totalDownloaded;
      this.progress.totalVectorized = checkpoint.totalVectorized;
      this.progress.oldestDate = checkpoint.oldestDate;
      this.progress.newestDate = checkpoint.newestDate;
      this.progress.errors = checkpoint.errors;
    }

    // Start sync process
    await this.performFullSync();
  }

  /**
   * Stop the sync service
   */
  async stop(): Promise<void> {
    logger.info('Stopping sync service');
    this.isCancelled = true;
    this.isRunning = false;

    // Save final checkpoint
    await this.saveCheckpoint();
  }

  /**
   * Get current sync progress
   */
  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  /**
   * Phase 1: Download ALL data from API to local storage
   */
  private async performFullSync(): Promise<void> {
    this.progress.phase = 'download';

    try {
      logger.info('Starting Phase 1: Downloading all data from API');

      // Start from today and work backwards
      let currentDate = new Date();
      let hasMoreData = true;
      let consecutiveEmptyDays = 0;
      const maxConsecutiveEmptyDays = 30; // Stop after 30 consecutive days with no data

      while (hasMoreData && !this.isCancelled) {
        const dateStr = currentDate.toISOString().split('T')[0];
        this.progress.currentDate = dateStr;

        try {
          // Check if we already have data for this date
          const existingLifelogs = await this.fileManager.listLifelogsByDate(currentDate);

          if (existingLifelogs.length > 0) {
            logger.debug(`Skipping ${dateStr} - already have ${existingLifelogs.length} lifelogs`);
            consecutiveEmptyDays = 0;
          } else {
            // Fetch from API
            logger.info(`Fetching data for ${dateStr}`);
            const apiLifelogs = await this.client.listLifelogsByDate(dateStr, {
              limit: 1000,
            });

            if (apiLifelogs.length > 0) {
              consecutiveEmptyDays = 0;
              const phase2Lifelogs = apiLifelogs.map(toPhase2Lifelog);

              // Save each lifelog to disk
              for (const lifelog of phase2Lifelogs) {
                await this.fileManager.saveLifelog(lifelog);
                this.progress.totalDownloaded++;

                // Update date range
                if (!this.progress.oldestDate || dateStr < this.progress.oldestDate) {
                  this.progress.oldestDate = dateStr;
                }
                if (!this.progress.newestDate || dateStr > this.progress.newestDate) {
                  this.progress.newestDate = dateStr;
                }

                // Checkpoint periodically
                if (this.progress.totalDownloaded % this.options.checkpointInterval === 0) {
                  await this.saveCheckpoint(dateStr);
                  logger.info(
                    `Checkpoint saved. Downloaded: ${this.progress.totalDownloaded} lifelogs`
                  );
                }
              }

              logger.info(
                `Downloaded ${apiLifelogs.length} lifelogs for ${dateStr}. Total: ${this.progress.totalDownloaded}`
              );
            } else {
              consecutiveEmptyDays++;
              logger.debug(
                `No data for ${dateStr}. Consecutive empty days: ${consecutiveEmptyDays}`
              );
            }

            // Respectful delay between API calls
            await this.delay(this.options.apiDelayMs);
          }

          // Move to previous day
          currentDate.setDate(currentDate.getDate() - 1);

          // Stop if we've had too many consecutive empty days
          if (consecutiveEmptyDays >= maxConsecutiveEmptyDays) {
            logger.info(
              `Stopping download after ${maxConsecutiveEmptyDays} consecutive days with no data`
            );
            hasMoreData = false;
          }
        } catch (error) {
          logger.error(`Error processing ${dateStr}`, { error });
          this.progress.errors.push({
            date: dateStr,
            error: error instanceof Error ? error.message : String(error),
          });

          // Continue with previous day after error
          currentDate.setDate(currentDate.getDate() - 1);
          await this.delay(this.options.apiDelayMs);
        }
      }

      // Save final checkpoint
      await this.saveCheckpoint();
      logger.info('Phase 1 complete: All data downloaded', {
        totalDownloaded: this.progress.totalDownloaded,
        dateRange: `${this.progress.oldestDate} to ${this.progress.newestDate}`,
        errors: this.progress.errors.length,
      });

      // Move to Phase 2 if not download-only mode
      if (!this.options.downloadOnly && this.vectorStore && !this.isCancelled) {
        await this.performVectorization();
      }
    } catch (error) {
      logger.error('Fatal error in sync process', { error });
      throw error;
    } finally {
      this.progress.phase = 'idle';
      this.isRunning = false;
    }
  }

  /**
   * Phase 2: Build vector embeddings from local data
   */
  private async performVectorization(): Promise<void> {
    if (!this.vectorStore) {
      logger.warn('No vector store configured, skipping vectorization');
      return;
    }

    this.progress.phase = 'vectorize';
    logger.info('Starting Phase 2: Building vector embeddings from local data');

    try {
      // Get all stored lifelogs
      const stats = await this.fileManager.getStorageStats();
      logger.info(`Found ${stats.totalLifelogs} lifelogs to vectorize`);

      if (stats.dateRange.start && stats.dateRange.end) {
        const currentDate = new Date(stats.dateRange.end);
        const endDate = new Date(stats.dateRange.start);

        while (currentDate >= endDate && !this.isCancelled) {
          const dateStr = currentDate.toISOString().split('T')[0];
          this.progress.currentDate = dateStr;

          try {
            const lifelogIds = await this.fileManager.listLifelogsByDate(currentDate);

            if (lifelogIds.length > 0) {
              logger.debug(`Vectorizing ${lifelogIds.length} lifelogs for ${dateStr}`);

              for (const id of lifelogIds) {
                if (this.isCancelled) break;

                const lifelog = await this.fileManager.loadLifelog(id, currentDate);
                if (lifelog) {
                  // Check if already vectorized
                  const existingEmbedding = await this.fileManager.loadEmbedding(id, currentDate);

                  if (!existingEmbedding) {
                    // Add to vector store
                    await this.vectorStore.addDocuments([
                      {
                        id: lifelog.id,
                        content: `${lifelog.title}\n\n${lifelog.content}`,
                        metadata: {
                          title: lifelog.title,
                          date: lifelog.createdAt,
                          duration: lifelog.duration,
                          headings: lifelog.headings,
                        },
                      },
                    ]);

                    // Save embedding to file storage
                    const doc = await this.vectorStore.getDocument(lifelog.id);
                    if (doc && doc.embedding) {
                      await this.fileManager.saveEmbedding(
                        lifelog.id,
                        new Date(lifelog.createdAt),
                        doc.embedding
                      );
                    }

                    this.progress.totalVectorized++;

                    // Checkpoint periodically
                    if (this.progress.totalVectorized % this.options.checkpointInterval === 0) {
                      await this.saveCheckpoint(dateStr);
                      logger.info(
                        `Vectorization checkpoint. Processed: ${this.progress.totalVectorized}`
                      );
                    }
                  } else {
                    logger.debug(`Skipping ${id} - already has embedding`);
                    this.progress.totalVectorized++;
                  }
                }
              }
            }

            // Move to previous day
            currentDate.setDate(currentDate.getDate() - 1);
          } catch (error) {
            logger.error(`Error vectorizing ${dateStr}`, { error });
            this.progress.errors.push({
              date: dateStr,
              error: error instanceof Error ? error.message : String(error),
            });

            // Continue with previous day
            currentDate.setDate(currentDate.getDate() - 1);
          }
        }
      }

      logger.info('Phase 2 complete: All data vectorized', {
        totalVectorized: this.progress.totalVectorized,
        errors: this.progress.errors.length,
      });
    } catch (error) {
      logger.error('Fatal error in vectorization', { error });
      throw error;
    }
  }

  /**
   * Rebuild embeddings from local data (no API calls)
   */
  async rebuildEmbeddings(): Promise<void> {
    if (!this.vectorStore) {
      throw new Error('No vector store configured');
    }

    logger.info('Rebuilding embeddings from local data');

    // Clear existing vector store
    await this.vectorStore.clear();

    // Reset vectorization count
    this.progress.totalVectorized = 0;

    // Run vectorization phase only
    await this.performVectorization();
  }

  /**
   * Save checkpoint for resuming
   */
  private async saveCheckpoint(currentDate?: string): Promise<void> {
    const checkpoint: SyncCheckpoint = {
      lastProcessedDate:
        currentDate || this.progress.currentDate || new Date().toISOString().split('T')[0],
      totalDownloaded: this.progress.totalDownloaded,
      totalVectorized: this.progress.totalVectorized,
      oldestDate: this.progress.oldestDate || '',
      newestDate: this.progress.newestDate || '',
      errors: this.progress.errors,
    };

    try {
      await fs.writeFile(this.checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
      this.progress.lastCheckpoint = new Date();
    } catch (error) {
      logger.error('Failed to save checkpoint', { error });
    }
  }

  /**
   * Load checkpoint if exists
   */
  private async loadCheckpoint(): Promise<SyncCheckpoint | null> {
    try {
      const content = await fs.readFile(this.checkpointPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to load checkpoint', { error });
      }
      return null;
    }
  }

  /**
   * Clear checkpoint
   */
  async clearCheckpoint(): Promise<void> {
    try {
      await fs.unlink(this.checkpointPath);
      logger.info('Checkpoint cleared');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to clear checkpoint', { error });
      }
    }
  }

  /**
   * Utility to introduce delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    return await this.fileManager.getStorageStats();
  }
}
