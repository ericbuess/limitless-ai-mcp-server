import { LimitlessClient } from '../core/limitless-client.js';
import { FileManager } from '../storage/file-manager.js';
import { logger } from '../utils/logger.js';
import { Phase2Lifelog, toPhase2Lifelog } from '../types/phase2.js';
import type { VectorStore } from './vector-store.interface.js';

export interface SyncServiceOptions {
  pollInterval?: number; // milliseconds
  batchSize?: number;
  enableVectorStore?: boolean;
  enableFileStorage?: boolean;
  maxRetries?: number;
}

export interface SyncStatus {
  isRunning: boolean;
  lastSync: Date | null;
  totalSynced: number;
  lastError: Error | null;
  pendingSync: number;
}

export class SyncService {
  private client: LimitlessClient;
  private fileManager: FileManager;
  private vectorStore: VectorStore | null;
  private options: Required<SyncServiceOptions>;
  private syncInterval: NodeJS.Timeout | null = null;
  private status: SyncStatus;
  private syncedIds: Set<string>;
  private isSyncing: boolean = false;

  constructor(
    client: LimitlessClient,
    fileManager: FileManager,
    vectorStore: VectorStore | null,
    options: SyncServiceOptions = {}
  ) {
    this.client = client;
    this.fileManager = fileManager;
    this.vectorStore = options.enableVectorStore ? vectorStore : null;

    this.options = {
      pollInterval: options.pollInterval || 60000, // 1 minute
      batchSize: options.batchSize || 50,
      enableVectorStore: options.enableVectorStore ?? true,
      enableFileStorage: options.enableFileStorage ?? true,
      maxRetries: options.maxRetries || 3,
    };

    this.status = {
      isRunning: false,
      lastSync: null,
      totalSynced: 0,
      lastError: null,
      pendingSync: 0,
    };

    this.syncedIds = new Set();
  }

  /**
   * Start the sync service
   */
  async start(): Promise<void> {
    if (this.status.isRunning) {
      logger.warn('Sync service already running');
      return;
    }

    logger.info('Starting sync service', {
      pollInterval: this.options.pollInterval,
      batchSize: this.options.batchSize,
    });

    // Initialize components
    await this.fileManager.initialize();
    if (this.vectorStore) {
      await this.vectorStore.initialize();
    }

    // Load existing synced IDs
    await this.loadSyncedIds();

    // Start syncing
    this.status.isRunning = true;
    await this.performSync();

    // Set up interval
    this.syncInterval = setInterval(() => {
      this.performSync().catch((error) => {
        logger.error('Sync interval error', { error });
      });
    }, this.options.pollInterval);
  }

  /**
   * Stop the sync service
   */
  async stop(): Promise<void> {
    if (!this.status.isRunning) {
      logger.warn('Sync service not running');
      return;
    }

    logger.info('Stopping sync service');

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.status.isRunning = false;

    // Wait for current sync to complete
    while (this.isSyncing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Close connections
    if (this.vectorStore) {
      await this.vectorStore.close();
    }
  }

  /**
   * Perform a sync operation
   */
  private async performSync(): Promise<void> {
    if (this.isSyncing) {
      logger.debug('Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      logger.debug('Starting sync operation');

      // Get recent lifelogs
      const recentLogs = await this.fetchRecentLifelogs();

      // Filter out already synced
      const newLogs = recentLogs.filter((log) => !this.syncedIds.has(log.id));
      this.status.pendingSync = newLogs.length;

      if (newLogs.length === 0) {
        logger.debug('No new lifelogs to sync');
        this.status.lastSync = new Date();
        return;
      }

      logger.info('Found new lifelogs to sync', { count: newLogs.length });

      // Process in batches
      for (let i = 0; i < newLogs.length; i += this.options.batchSize) {
        const batch = newLogs.slice(i, i + this.options.batchSize);
        await this.processBatch(batch);
      }

      this.status.lastSync = new Date();
      this.status.lastError = null;

      const syncTime = Date.now() - startTime;
      logger.info('Sync completed', {
        synced: newLogs.length,
        totalSynced: this.status.totalSynced,
        syncTime,
      });
    } catch (error) {
      logger.error('Sync failed', { error });
      this.status.lastError = error as Error;
    } finally {
      this.isSyncing = false;
      this.status.pendingSync = 0;
    }
  }

  /**
   * Fetch recent lifelogs from API
   */
  private async fetchRecentLifelogs(): Promise<Phase2Lifelog[]> {
    try {
      // Calculate date range for sync
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // Last 7 days

      const apiLifelogs = await this.client.listLifelogsByRange({
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        limit: 1000, // Get up to 1000 recent logs
      });

      return apiLifelogs.map(toPhase2Lifelog);
    } catch (error) {
      logger.error('Failed to fetch recent lifelogs', { error });
      throw error;
    }
  }

  /**
   * Process a batch of lifelogs
   */
  private async processBatch(lifelogs: Phase2Lifelog[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const lifelog of lifelogs) {
      promises.push(this.processLifelog(lifelog));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Process a single lifelog
   */
  private async processLifelog(lifelog: Phase2Lifelog): Promise<void> {
    let retries = 0;

    while (retries < this.options.maxRetries) {
      try {
        // Save to file storage
        if (this.options.enableFileStorage) {
          await this.fileManager.saveLifelog(lifelog);
        }

        // Add to vector store
        if (this.options.enableVectorStore && this.vectorStore) {
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

          // Save embedding to file storage for portability
          const doc = await this.vectorStore.getDocument(lifelog.id);
          if (doc && doc.embedding && this.options.enableFileStorage) {
            await this.fileManager.saveEmbedding(
              lifelog.id,
              new Date(lifelog.createdAt),
              doc.embedding
            );
          }
        }

        // Mark as synced
        this.syncedIds.add(lifelog.id);
        this.status.totalSynced++;

        logger.debug('Synced lifelog', { id: lifelog.id });
        return;
      } catch (error) {
        retries++;
        logger.warn('Failed to sync lifelog, retrying', {
          id: lifelog.id,
          retry: retries,
          error,
        });

        if (retries >= this.options.maxRetries) {
          logger.error('Failed to sync lifelog after retries', {
            id: lifelog.id,
            error,
          });
          throw error;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
      }
    }
  }

  /**
   * Load existing synced IDs from storage
   */
  private async loadSyncedIds(): Promise<void> {
    try {
      // Initialize storage stats
      await this.fileManager.getStorageStats();

      // Get all lifelog IDs from the past 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const lifelogs = await this.fileManager.listLifelogsByDateRange(startDate, endDate);

      for (const { id } of lifelogs) {
        this.syncedIds.add(id);
      }

      this.status.totalSynced = this.syncedIds.size;
      logger.info('Loaded existing synced IDs', { count: this.syncedIds.size });
    } catch (error) {
      logger.error('Failed to load synced IDs', { error });
    }
  }

  /**
   * Force sync specific lifelogs
   */
  async syncLifelogs(lifelogs: Phase2Lifelog[]): Promise<void> {
    logger.info('Force syncing lifelogs', { count: lifelogs.length });

    for (let i = 0; i < lifelogs.length; i += this.options.batchSize) {
      const batch = lifelogs.slice(i, i + this.options.batchSize);
      await this.processBatch(batch);
    }
  }

  /**
   * Get sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Clear all synced data
   */
  async clearSyncedData(): Promise<void> {
    logger.warn('Clearing all synced data');

    // Clear vector store
    if (this.vectorStore) {
      await this.vectorStore.clear();
    }

    // Clear synced IDs
    this.syncedIds.clear();
    this.status.totalSynced = 0;

    logger.info('Synced data cleared');
  }

  /**
   * Rebuild the entire index
   */
  async rebuildIndex(): Promise<void> {
    logger.info('Rebuilding entire index');

    // Clear existing data
    await this.clearSyncedData();

    // Fetch all lifelogs from the past year
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const apiLifelogs = await this.client.listLifelogsByRange({
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
      limit: 10000,
    });

    const phase2Lifelogs = apiLifelogs.map(toPhase2Lifelog);
    logger.info('Rebuilding with lifelogs', { count: phase2Lifelogs.length });

    // Sync all
    await this.syncLifelogs(phase2Lifelogs);

    logger.info('Index rebuild complete', { totalSynced: this.status.totalSynced });
  }
}
