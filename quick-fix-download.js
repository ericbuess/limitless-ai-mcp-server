#!/usr/bin/env node

// Quick fix to download missing data one day at a time
const { LimitlessClient } = require('./dist/core/limitless-client.js');
const fs = require('fs');
const path = require('path');

const API_KEY = 'sk-a740f4f7-fb38-4a20-8286-43549ab21157';

async function downloadSpecificDates() {
  const client = new LimitlessClient({ apiKey: API_KEY });

  // Dates we know are missing
  const datesToCheck = [
    '2025-06-01',
    '2025-06-02',
    '2025-06-04', // TODAY - user's recent recording
  ];

  for (const date of datesToCheck) {
    console.log(`\nChecking ${date}...`);

    try {
      const lifelogs = await client.listLifelogsByDate({
        date,
        includeMarkdown: true,
        includeHeadings: true,
      });

      console.log(`Found ${lifelogs.length} lifelogs`);

      if (lifelogs.length > 0) {
        const dirPath = `./data/lifelogs/${date.replace(/-/g, '/')}`;
        await fs.promises.mkdir(dirPath, { recursive: true });

        for (const log of lifelogs) {
          const filePath = path.join(dirPath, `${log.id}.md`);
          const metaPath = path.join(dirPath, `${log.id}.meta.json`);

          // Save markdown
          await fs.promises.writeFile(filePath, log.markdown || '');

          // Save metadata
          await fs.promises.writeFile(
            metaPath,
            JSON.stringify(
              {
                id: log.id,
                title: log.title,
                createdAt: log.startTime,
                endTime: log.endTime,
                duration:
                  log.endTime && log.startTime
                    ? (new Date(log.endTime).getTime() - new Date(log.startTime).getTime()) / 1000
                    : 0,
              },
              null,
              2
            )
          );

          console.log(`✓ Saved ${log.id}`);
        }
      }

      // Respectful delay
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      console.error(`Error downloading ${date}:`, error.message);
    }
  }

  console.log('\n✅ Done! Check data/lifelogs/2025/06/ for the files');
}

downloadSpecificDates();
