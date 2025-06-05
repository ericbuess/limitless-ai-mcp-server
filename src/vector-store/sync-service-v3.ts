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
  phase: 'idle' | 'download' | 'vectorize' | 'monitoring';
  currentDate: string;
  totalDownloaded: number;
  totalVectorized: number;
  lastCheckpoint: Date;
  oldestDate?: string;
  newestDate?: string;
  storageSize: number;
  errors: Array<{ date: string; error: string }>;
  processedBatches: Set<string>; // Track successfully processed batches
  lastMonitorCheck?: Date;
  lastProcessedTimestamp?: string; // Track the newest lifelog timestamp to avoid re-processing
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

      // Check if this is first run (no lastProcessedTimestamp)
      if (!this.progress.lastProcessedTimestamp || this.progress.lastProcessedTimestamp === '') {
        logger.info('First run detected - initializing from scratch');
        await this.initializeFromScratch();
      } else if (this.progress.phase === 'monitoring') {
        // Resume monitoring
        logger.info('Resuming monitoring mode');
        await this.startMonitoring();
      } else if (this.progress.phase === 'download') {
        // Resume interrupted download
        logger.info('Resuming interrupted download');
        await this.performDownload();
      } else if (this.progress.phase === 'vectorize') {
        // Resume vectorization
        logger.info('Resuming vectorization');
        await this.performVectorization();
        await this.startMonitoring();
      }
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
      // Start date is today or current progress
      const startDate = this.progress.currentDate
        ? new Date(this.progress.currentDate)
        : new Date(this.options.startDate);

      // End date should be the oldest date we found, not 10 years ago!
      let endDate: Date;
      if (this.progress.oldestDate) {
        // If we know the oldest date, start from there
        endDate = new Date(this.progress.oldestDate);
        // Go back a few days to ensure we don't miss anything
        endDate.setDate(endDate.getDate() - 7);
      } else {
        // Fallback to 10 years ago if we don't know the oldest
        endDate = new Date(this.options.startDate);
        endDate.setFullYear(endDate.getFullYear() - this.options.maxYearsBack);
      }

      logger.info(`Downloading data from ${endDate.toISOString()} to ${startDate.toISOString()}`);

      // Download from oldest to newest, one day at a time
      const currentDate = new Date(endDate);
      let totalBatchCount = 0;
      let daysWithData = 0;

      while (currentDate <= startDate && !this.isCancelled) {
        const dateStr = currentDate.toISOString().split('T')[0];

        // Skip if this date already processed
        if (this.progress.processedBatches.has(dateStr)) {
          logger.debug(`Skipping already processed date: ${dateStr}`);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        this.progress.currentDate = dateStr;

        try {
          // Fetch lifelogs for this specific date
          logger.debug(`Fetching lifelogs for date: ${dateStr}`);

          const lifelogs = await this.client.listLifelogsByDate(dateStr, {
            limit: 1000, // Get all lifelogs for this day
            includeMarkdown: true,
            includeHeadings: true,
          });

          if (lifelogs.length > 0) {
            logger.info(`Found ${lifelogs.length} lifelogs on ${dateStr}`);

            // Save each lifelog with error handling
            let savedCount = 0;
            let failedCount = 0;
            let skippedCount = 0;

            for (const apiLifelog of lifelogs) {
              const lifelog = toPhase2Lifelog(apiLifelog);

              try {
                // Check if already exists
                const existingLifelog = await this.fileManager.loadLifelog(
                  lifelog.id,
                  new Date(lifelog.createdAt)
                );

                if (!existingLifelog) {
                  await this.fileManager.saveLifelog(lifelog);
                  savedCount++;
                  this.progress.totalDownloaded++;

                  // Update date range and lastProcessedTimestamp
                  if (!this.progress.oldestDate || lifelog.createdAt < this.progress.oldestDate) {
                    this.progress.oldestDate = lifelog.createdAt;
                  }
                  if (!this.progress.newestDate || lifelog.createdAt > this.progress.newestDate) {
                    this.progress.newestDate = lifelog.createdAt;
                  }

                  // Update lastProcessedTimestamp to track progress
                  if (
                    !this.progress.lastProcessedTimestamp ||
                    lifelog.createdAt > this.progress.lastProcessedTimestamp
                  ) {
                    this.progress.lastProcessedTimestamp = lifelog.createdAt;
                  }
                } else {
                  skippedCount++;
                }
              } catch (error) {
                failedCount++;
                logger.error('Failed to save lifelog', {
                  id: lifelog.id,
                  date: lifelog.createdAt,
                  error: error instanceof Error ? error.message : error,
                });
              }
            }

            // Update storage stats
            const stats = await this.fileManager.getStorageStats();
            this.progress.storageSize = stats.sizeInBytes;

            logger.info(`Date ${dateStr} processing complete`, {
              found: lifelogs.length,
              saved: savedCount,
              skipped: skippedCount,
              failed: failedCount,
            });

            daysWithData++;

            // Mark date as processed if successful
            if (savedCount > 0 || skippedCount > 0) {
              this.progress.processedBatches.add(dateStr);
            } else if (failedCount > 0 && failedCount === lifelogs.length) {
              logger.error(`Date ${dateStr} had all failures - not marking as processed`);
            } else {
              // Even if all were skipped, mark as processed
              this.progress.processedBatches.add(dateStr);
            }
          } else {
            logger.debug(`No data on ${dateStr}`);
            // Mark empty dates as processed so we don't check them again
            this.progress.processedBatches.add(dateStr);
          }

          totalBatchCount++;

          // Save checkpoint periodically
          if (totalBatchCount % 5 === 0) {
            await this.saveCheckpoint();
            logger.info(
              `Progress: Downloaded ${this.progress.totalDownloaded} lifelogs from ${daysWithData} days (${(this.progress.storageSize / 1024 / 1024).toFixed(2)} MB)`
            );
          }

          // Respectful delay between API calls
          await this.delay(this.options.apiDelayMs);
        } catch (error) {
          logger.error(`Error processing date ${dateStr}`, { error });
          this.progress.errors.push({
            date: dateStr,
            error: error instanceof Error ? error.message : String(error),
          });

          // Save checkpoint on error so we can resume
          await this.saveCheckpoint();

          // Continue with next date after error
          await this.delay(this.options.apiDelayMs);
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
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

        // Start monitoring mode after vectorization
        if (!this.isCancelled) {
          await this.startMonitoring();
        }
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
   * Start monitoring mode - continuously check for new lifelogs
   */
  private async startMonitoring(): Promise<void> {
    this.progress.phase = 'monitoring';
    logger.info('Starting monitoring mode - checking for new lifelogs every 60 seconds');

    // If we don't have a last processed timestamp, set it to the newest lifelog we have
    if (!this.progress.lastProcessedTimestamp && this.progress.newestDate) {
      this.progress.lastProcessedTimestamp = this.progress.newestDate;
      logger.info(
        `Setting initial monitoring timestamp to: ${this.progress.lastProcessedTimestamp}`
      );
    }

    // Save initial monitoring state
    await this.saveCheckpoint();

    // Set up interval for checking
    const checkInterval = setInterval(async () => {
      if (this.isCancelled) {
        clearInterval(checkInterval);
        return;
      }

      try {
        this.progress.lastMonitorCheck = new Date();
        logger.info('Running monitoring check', {
          lastProcessedTimestamp: this.progress.lastProcessedTimestamp,
          checkTime: new Date().toISOString(),
        });

        // Get recent lifelogs (last 2 days to ensure we don't miss anything)
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const recentLifelogs = await this.client.listLifelogsByRange({
          start: twoDaysAgo.toISOString().split('T')[0],
          end: tomorrow.toISOString().split('T')[0],
          limit: 200,
          includeMarkdown: true,
          includeHeadings: true,
        });

        logger.info('Monitoring API response', {
          totalFound: recentLifelogs.length,
          dateRange: `${twoDaysAgo.toISOString().split('T')[0]} to ${tomorrow.toISOString().split('T')[0]}`,
          lastProcessedTimestamp: this.progress.lastProcessedTimestamp,
        });

        let newCount = 0;
        let newestTimestamp = this.progress.lastProcessedTimestamp || '';

        // Sort lifelogs by startTime to process in chronological order
        const sortedLifelogs = recentLifelogs.sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        logger.info(`Processing ${sortedLifelogs.length} lifelogs from monitoring check`);

        // Log first few lifelogs for debugging
        if (sortedLifelogs.length > 0) {
          logger.info('First lifelog in response', {
            id: sortedLifelogs[0].id,
            startTime: sortedLifelogs[0].startTime,
            createdAt: new Date(sortedLifelogs[0].startTime).toISOString(),
          });
          logger.info('Last lifelog in response', {
            id: sortedLifelogs[sortedLifelogs.length - 1].id,
            startTime: sortedLifelogs[sortedLifelogs.length - 1].startTime,
            createdAt: new Date(sortedLifelogs[sortedLifelogs.length - 1].startTime).toISOString(),
          });
        }

        for (const apiLifelog of sortedLifelogs) {
          const lifelog = toPhase2Lifelog(apiLifelog);

          // Log every lifelog for debugging
          logger.debug('Processing lifelog', {
            id: lifelog.id,
            createdAt: lifelog.createdAt,
            title: lifelog.title?.substring(0, 50) + '...',
          });

          // Skip if this lifelog was already processed
          if (
            this.progress.lastProcessedTimestamp &&
            new Date(lifelog.createdAt).getTime() <=
              new Date(this.progress.lastProcessedTimestamp).getTime()
          ) {
            logger.debug('Skipping already processed lifelog', {
              id: lifelog.id,
              createdAt: lifelog.createdAt,
              lastProcessed: this.progress.lastProcessedTimestamp,
              comparison:
                new Date(lifelog.createdAt).getTime() <=
                new Date(this.progress.lastProcessedTimestamp).getTime(),
            });
            continue;
          }

          // Check if already exists (double-check)
          const existingLifelog = await this.fileManager.loadLifelog(
            lifelog.id,
            new Date(lifelog.createdAt)
          );

          if (!existingLifelog) {
            logger.info('Found new lifelog to download', {
              id: lifelog.id,
              createdAt: lifelog.createdAt,
              title: lifelog.title,
            });

            // Save new lifelog
            await this.fileManager.saveLifelog(lifelog);
            this.progress.totalDownloaded++;
            newCount++;

            // Track the newest timestamp
            if (!newestTimestamp || new Date(lifelog.createdAt) > new Date(newestTimestamp)) {
              newestTimestamp = lifelog.createdAt;
            }

            // Add to vector store if available
            if (this.vectorStore) {
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
              this.progress.totalVectorized++;
            }
          } else {
            logger.debug('Lifelog already exists locally', {
              id: lifelog.id,
              createdAt: lifelog.createdAt,
            });
          }
        }

        // Update the last processed timestamp if we found new lifelogs
        if (newestTimestamp && newestTimestamp !== this.progress.lastProcessedTimestamp) {
          this.progress.lastProcessedTimestamp = newestTimestamp;
          this.progress.newestDate = newestTimestamp;
        }

        if (newCount > 0) {
          logger.info(`Found ${newCount} new lifelogs during monitoring check`);
          await this.saveCheckpoint();
        } else {
          logger.debug('No new lifelogs found in monitoring check');
        }
      } catch (error) {
        logger.error('Error during monitoring check', { error });
        this.progress.errors.push({
          date: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 60000); // Check every 60 seconds

    logger.info('Monitoring mode active - press Ctrl+C to stop');
  }

  /**
   * Initialize from scratch - clear data and download everything
   */
  private async initializeFromScratch(): Promise<void> {
    logger.info('Starting fresh initialization');

    // Clear existing data
    logger.info('Clearing existing local data and vector store');
    await this.fileManager.clearAllLifelogs();
    if (this.vectorStore) {
      await this.vectorStore.clear();
    }

    // Find the oldest lifelog
    logger.info('Finding oldest lifelog via API');
    const oldestDate = await this.findOldestLifelog();

    if (!oldestDate) {
      logger.warn('No lifelogs found in API');
      this.progress.phase = 'monitoring';
      await this.startMonitoring();
      return;
    }

    logger.info(`Oldest lifelog found at: ${oldestDate.toISOString()}`);

    // Reset progress for fresh start
    // IMPORTANT: Set currentDate to TODAY, not the oldest date
    // This ensures we download everything from oldest to newest
    this.progress = {
      phase: 'download',
      currentDate: new Date().toISOString().split('T')[0], // Start from today
      totalDownloaded: 0,
      totalVectorized: 0,
      lastCheckpoint: new Date(),
      oldestDate: oldestDate.toISOString(),
      newestDate: '',
      storageSize: 0,
      errors: [],
      processedBatches: new Set(),
      lastProcessedTimestamp: '', // Will be updated as we download
    };

    // Save initial checkpoint
    await this.saveCheckpoint();

    // Start downloading from oldest to newest
    await this.performDownload();
  }

  /**
   * Find the oldest lifelog in the API
   */
  private async findOldestLifelog(): Promise<Date | null> {
    logger.info('Searching for oldest lifelog in the API');

    // Start by checking large date ranges to find data quickly
    const today = new Date();
    let oldestFound: Date | null = null;

    // Check year by year going back
    for (let yearsBack = 0; yearsBack < 10; yearsBack++) {
      const yearStart = new Date(today);
      yearStart.setFullYear(yearStart.getFullYear() - yearsBack - 1);
      yearStart.setMonth(0, 1); // January 1st

      const yearEnd = new Date(today);
      yearEnd.setFullYear(yearEnd.getFullYear() - yearsBack);
      yearEnd.setMonth(11, 31); // December 31st

      try {
        logger.debug(`Checking year ${yearStart.getFullYear()}`);

        const lifelogs = await this.client.listLifelogsByRange({
          start: yearStart.toISOString().split('T')[0],
          end: yearEnd.toISOString().split('T')[0],
          limit: 1,
          includeMarkdown: false,
        });

        if (lifelogs.length > 0) {
          // Found data in this year, now find the exact oldest date
          logger.info(`Found data in year ${yearStart.getFullYear()}, searching for oldest...`);

          // Binary search within this year
          let left = yearStart.getTime();
          let right = yearEnd.getTime();

          while (right - left > 86400000) {
            // More than 1 day difference
            const mid = Math.floor((left + right) / 2);
            const midDate = new Date(mid);

            const midLogs = await this.client.listLifelogsByRange({
              start: new Date(left).toISOString().split('T')[0],
              end: midDate.toISOString().split('T')[0],
              limit: 1,
              includeMarkdown: false,
            });

            if (midLogs.length > 0) {
              // Data exists in the left half
              right = mid;
              oldestFound = new Date(midLogs[0].startTime);
            } else {
              // Data only in the right half
              left = mid;
            }

            await this.delay(1000); // Rate limit
          }

          // Do a final check on the exact date
          if (oldestFound) {
            const checkDate = new Date(oldestFound);
            checkDate.setDate(checkDate.getDate() - 7); // Check a week before

            const finalCheck = await this.client.listLifelogsByRange({
              start: checkDate.toISOString().split('T')[0],
              end: oldestFound.toISOString().split('T')[0],
              limit: 100,
              includeMarkdown: false,
            });

            if (finalCheck.length > 0) {
              // Find the actual oldest
              const sorted = finalCheck.sort(
                (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
              );
              oldestFound = new Date(sorted[0].startTime);
            }
          }

          break; // Found the oldest year with data
        }

        await this.delay(2000); // Rate limit
      } catch (error) {
        logger.error('Error checking year', { year: yearStart.getFullYear(), error });
      }
    }

    if (oldestFound) {
      logger.info(`Oldest lifelog found: ${oldestFound.toISOString()}`);
    } else {
      logger.warn('No lifelogs found in the past 10 years');
    }

    return oldestFound;
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
