#!/usr/bin/env node

import { LimitlessClient } from './dist/core/limitless-client.js';
import { FileManager } from './dist/storage/file-manager.js';
import { toPhase2Lifelog } from './dist/types/phase2.js';
import { logger } from './dist/utils/logger.js';

async function downloadToday() {
  logger.info("Downloading today's lifelogs...");

  const client = new LimitlessClient({
    apiKey: process.env.LIMITLESS_API_KEY,
  });

  const fileManager = new FileManager({
    baseDir: './data',
    enableEmbeddings: true,
    enableMetadata: true,
  });
  await fileManager.initialize();

  // Get today's date
  const today = new Date().toISOString().split('T')[0];

  try {
    logger.info(`Fetching lifelogs for ${today}...`);

    const lifelogs = await client.listLifelogsByDate(today, {
      includeMarkdown: true,
      includeHeadings: true,
    });

    logger.info(`Found ${lifelogs.length} lifelogs for today`);

    let savedCount = 0;
    for (const apiLifelog of lifelogs) {
      const lifelog = toPhase2Lifelog(apiLifelog);

      logger.info(`Processing lifelog ${lifelog.id}:`, {
        createdAt: lifelog.createdAt,
        duration: lifelog.duration,
        title: lifelog.title.substring(0, 50),
      });

      try {
        await fileManager.saveLifelog(lifelog);
        savedCount++;
        logger.info(`Saved lifelog ${lifelog.id}`);
      } catch (error) {
        logger.error(`Failed to save lifelog ${lifelog.id}:`, error);
      }
    }

    logger.info(`Download complete: ${savedCount}/${lifelogs.length} saved`);

    // Check storage stats
    const stats = await fileManager.getStorageStats();
    logger.info('Storage stats:', stats);
  } catch (error) {
    logger.error("Failed to download today's lifelogs:", error);
  }
}

downloadToday();
