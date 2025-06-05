#!/usr/bin/env node

import { LimitlessClient } from './dist/core/limitless-client.js';
import { FileManager } from './dist/storage/file-manager.js';
import { toPhase2Lifelog } from './dist/types/phase2.js';
import { logger } from './dist/utils/logger.js';

async function downloadMissingDays() {
  logger.info('Downloading missing days (June 1st and 2nd)...');

  const client = new LimitlessClient({
    apiKey: process.env.LIMITLESS_API_KEY,
  });

  const fileManager = new FileManager({
    baseDir: './data',
    enableEmbeddings: true,
    enableMetadata: true,
  });
  await fileManager.initialize();

  const dates = ['2025-06-03'];

  for (const date of dates) {
    try {
      logger.info(`Fetching lifelogs for ${date}...`);

      const lifelogs = await client.listLifelogsByDate(date, {
        includeMarkdown: true,
        includeHeadings: true,
      });

      logger.info(`Found ${lifelogs.length} lifelogs for ${date}`);

      let savedCount = 0;
      for (const apiLifelog of lifelogs) {
        const lifelog = toPhase2Lifelog(apiLifelog);

        try {
          await fileManager.saveLifelog(lifelog);
          savedCount++;
          logger.info(`Saved lifelog ${lifelog.id}`);
        } catch (error) {
          logger.error(`Failed to save lifelog ${lifelog.id}:`, error);
        }
      }

      logger.info(`${date}: ${savedCount}/${lifelogs.length} saved`);

      // Add delay between dates to be respectful
      if (date !== dates[dates.length - 1]) {
        logger.info('Waiting 2 seconds before next request...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.error(`Failed to download lifelogs for ${date}:`, error);
    }
  }

  // Check final storage stats
  const stats = await fileManager.getStorageStats();
  logger.info('Final storage stats:', stats);
}

downloadMissingDays();
