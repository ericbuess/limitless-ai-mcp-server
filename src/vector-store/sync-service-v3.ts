import { LimitlessClient } from '../core/limitless-client.js';
import { FileManager } from '../storage/file-manager.js';
import { logger } from '../utils/logger.js';
import { toPhase2Lifelog } from '../types/phase2.js';
import type { VectorStore } from './vector-store.interface.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SyncOptions {
  downloadOnly?: boolean;
  apiDelayMs?: number;
  batchSize?: number;
  checkpointInterval?: number;
  maxYearsBack?: number;
  startDate?: Date;
}

export interface SyncProgress {
  phase: 'idle' | 'download' | 'vectorize';
  currentDate: string;
  totalDownloaded: number;
  totalVectorized: number;
  lastCheckpoint: Date;
  oldestDate?: string;
  newestDate?: string;
  storageSize: number;
  errors: Array<{ date: string; error: string }>;
  processedBatches: Set<string>; // Track successfully processed batches
}

export class SyncServiceV3 {
  private client: LimitlessClient;
  private fileManager: FileManager;
  private vectorStore: VectorStore | null;
  private options: Required<SyncOptions>;
  private progress: SyncProgress;
  private isRunning: boolean = false;
  private isCancelled: boolean = false;
  private checkpointPath: string;

  constructor(
    client: LimitlessClient,
    fileManager: FileManager,
    vectorStore: VectorStore | null,
    options: SyncOptions = {}
  ) {
    this.client = client;
    this.fileManager = fileManager;
    this.vectorStore = options.downloadOnly ? null : vectorStore;

    // Default options
    this.options = {
      downloadOnly: options.downloadOnly ?? false,
      apiDelayMs: options.apiDelayMs ?? 2000, // 2 seconds between API calls
      batchSize: options.batchSize ?? 50,
      checkpointInterval: options.checkpointInterval ?? 1, // Save after every batch
      maxYearsBack: options.maxYearsBack ?? 10, // Go back max 10 years by default
      startDate: options.startDate ?? new Date(),
    };

    this.checkpointPath = path.join(process.cwd(), 'data', 'sync-checkpoint.json');

    // Initialize progress
    this.progress = {
      phase: 'idle',
      currentDate: '',
      totalDownloaded: 0,
      totalVectorized: 0,
      lastCheckpoint: new Date(),
      storageSize: 0,
      errors: [],
      processedBatches: new Set(),
    };
  }

  /**
   * Start the sync process
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Sync already in progress');
      return;
    }

    this.isRunning = true;
    this.isCancelled = false;

    try {
      // Initialize components
      await this.fileManager.initialize();
      if (this.vectorStore) {
        await this.vectorStore.initialize();
      }

      // Load checkpoint if exists
      await this.loadCheckpoint();

      // Start download phase
      await this.performDownload();
    } catch (error) {
      logger.error('Sync failed', { error });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the sync process
   */
  stop(): void {
    logger.info('Stopping sync process...');
    this.isCancelled = true;
  }

  /**
   * Get current sync progress
   */
  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  /**
   * Load checkpoint from disk
   */
  private async loadCheckpoint(): Promise<void> {
    try {
      const data = await fs.readFile(this.checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(data);

      // Restore progress
      this.progress = {
        ...checkpoint,
        lastCheckpoint: new Date(checkpoint.lastCheckpoint),
        processedBatches: new Set(checkpoint.processedBatches || []),
      };

      logger.info('Loaded checkpoint', {
        currentDate: this.progress.currentDate,
        totalDownloaded: this.progress.totalDownloaded,
        processedBatches: this.progress.processedBatches.size,
      });
    } catch {
      logger.info('No checkpoint found, starting fresh');
    }
  }

  /**
   * Save checkpoint to disk
   */
  private async saveCheckpoint(): Promise<void> {
    const checkpoint = {
      ...this.progress,
      processedBatches: Array.from(this.progress.processedBatches),
      lastCheckpoint: new Date(),
    };

    await fs.mkdir(path.dirname(this.checkpointPath), { recursive: true });
    await fs.writeFile(this.checkpointPath, JSON.stringify(checkpoint, null, 2));

    logger.debug('Checkpoint saved', {
      totalDownloaded: checkpoint.totalDownloaded,
      processedBatches: checkpoint.processedBatches.length,
    });
  }

  /**
   * Phase 1: Download all data from API
   */
  private async performDownload(): Promise<void> {
    this.progress.phase = 'download';
    logger.info('Starting Phase 1: Downloading all data from API');

    try {
      const startDate = this.progress.currentDate
        ? new Date(this.progress.currentDate)
        : new Date(this.options.startDate);

      const endDate = new Date(this.options.startDate);
      endDate.setFullYear(endDate.getFullYear() - this.options.maxYearsBack);

      logger.info(
        `Downloading data from ${startDate.toISOString()} back to ${endDate.toISOString()}`
      );

      // Use a smarter approach: query by month first to identify active periods
      const currentDate = new Date(startDate);
      let batchCount = 0;

      while (currentDate >= endDate && !this.isCancelled) {
        // Process in batches of days
        const batchStartDate = new Date(currentDate);
        const batchEndDate = new Date(currentDate);
        batchEndDate.setDate(batchEndDate.getDate() - this.options.batchSize + 1);

        if (batchEndDate < endDate) {
          batchEndDate.setTime(endDate.getTime());
        }

        const batchKey = `${batchEndDate.toISOString().split('T')[0]}_${batchStartDate.toISOString().split('T')[0]}`;

        // Skip if batch already processed
        if (this.progress.processedBatches.has(batchKey)) {
          logger.debug(`Skipping already processed batch: ${batchKey}`);
          currentDate.setDate(currentDate.getDate() - this.options.batchSize);
          continue;
        }

        this.progress.currentDate = currentDate.toISOString().split('T')[0];

        try {
          // Fetch batch of lifelogs
          logger.debug(`Fetching batch: ${batchKey}`);

          const lifelogs = await this.client.listLifelogsByRange({
            start: batchEndDate.toISOString().split('T')[0],
            end: batchStartDate.toISOString().split('T')[0],
            limit: 1000, // Get as many as possible in one call
            includeMarkdown: true,
            includeHeadings: true,
          });

          if (lifelogs.length > 0) {
            logger.info(`Found ${lifelogs.length} lifelogs in batch ${batchKey}`);

            // Save each lifelog
            for (const apiLifelog of lifelogs) {
              const lifelog = toPhase2Lifelog(apiLifelog);

              // Check if already exists
              const existingLifelog = await this.fileManager.loadLifelog(
                lifelog.id,
                new Date(lifelog.createdAt)
              );

              if (!existingLifelog) {
                await this.fileManager.saveLifelog(lifelog);
                this.progress.totalDownloaded++;

                // Update date range
                if (!this.progress.oldestDate || lifelog.createdAt < this.progress.oldestDate) {
                  this.progress.oldestDate = lifelog.createdAt;
                }
                if (!this.progress.newestDate || lifelog.createdAt > this.progress.newestDate) {
                  this.progress.newestDate = lifelog.createdAt;
                }
              }
            }

            // Update storage stats
            const stats = await this.fileManager.getStorageStats();
            this.progress.storageSize = stats.sizeInBytes;
          } else {
            logger.debug(`No data in batch ${batchKey}`);
          }

          // Mark batch as processed
          this.progress.processedBatches.add(batchKey);
          batchCount++;

          // Save checkpoint after every batch
          if (batchCount % this.options.checkpointInterval === 0) {
            await this.saveCheckpoint();
            logger.info(
              `Progress: Downloaded ${this.progress.totalDownloaded} lifelogs (${(this.progress.storageSize / 1024 / 1024).toFixed(2)} MB)`
            );
          }

          // Respectful delay between API calls
          await this.delay(this.options.apiDelayMs);
        } catch (error) {
          logger.error(`Error processing batch ${batchKey}`, { error });
          this.progress.errors.push({
            date: batchKey,
            error: error instanceof Error ? error.message : String(error),
          });

          // Save checkpoint on error so we can resume
          await this.saveCheckpoint();

          // Continue with next batch after error
          await this.delay(this.options.apiDelayMs);
        }

        // Move to next batch
        currentDate.setDate(currentDate.getDate() - this.options.batchSize);
      }

      // Save final checkpoint
      await this.saveCheckpoint();
      logger.info('Phase 1 complete: All data downloaded', {
        totalDownloaded: this.progress.totalDownloaded,
        dateRange: `${this.progress.oldestDate} to ${this.progress.newestDate}`,
        storageSize: `${(this.progress.storageSize / 1024 / 1024).toFixed(2)} MB`,
        errors: this.progress.errors.length,
      });

      // Move to Phase 2 if not download-only mode
      if (!this.options.downloadOnly && this.vectorStore && !this.isCancelled) {
        await this.performVectorization();
      }
    } catch (error) {
      logger.error('Fatal error in download process', { error });
      throw error;
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
        let batchCount = 0;

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

                    // Save embedding for portability
                    const doc = await this.vectorStore.getDocument(lifelog.id);
                    if (doc && doc.embedding) {
                      await this.fileManager.saveEmbedding(
                        lifelog.id,
                        new Date(lifelog.createdAt),
                        doc.embedding
                      );
                    }

                    this.progress.totalVectorized++;
                  }
                }
              }

              batchCount++;

              // Save checkpoint periodically
              if (batchCount % 10 === 0) {
                await this.saveCheckpoint();
                logger.info(
                  `Vectorization progress: ${this.progress.totalVectorized}/${stats.totalLifelogs} lifelogs`
                );
              }
            }
          } catch (error) {
            logger.error(`Error vectorizing ${dateStr}`, { error });
            this.progress.errors.push({
              date: dateStr,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Move to previous day
          currentDate.setDate(currentDate.getDate() - 1);
        }
      }

      // Save final checkpoint
      await this.saveCheckpoint();
      logger.info('Phase 2 complete: All embeddings built', {
        totalVectorized: this.progress.totalVectorized,
        errors: this.progress.errors.length,
      });
    } catch (error) {
      logger.error('Fatal error in vectorization process', { error });
      throw error;
    } finally {
      this.progress.phase = 'idle';
    }
  }

  /**
   * Helper to add delay between operations
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear all checkpoints and start fresh
   */
  async clearCheckpoints(): Promise<void> {
    try {
      await fs.unlink(this.checkpointPath);
      logger.info('Checkpoints cleared');
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
