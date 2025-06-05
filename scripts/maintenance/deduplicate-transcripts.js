#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deduplicate transcript by removing duplicate lines
 * This helps clean up repeated content in lifelogs
 */
function deduplicateTranscript(transcript) {
  const lines = transcript.split('\n');
  const uniqueLines = new Set();
  const deduplicatedLines = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !uniqueLines.has(trimmedLine)) {
      uniqueLines.add(trimmedLine);
      deduplicatedLines.push(line);
    } else if (!trimmedLine) {
      // Preserve empty lines for formatting
      deduplicatedLines.push(line);
    }
  }

  return deduplicatedLines.join('\n');
}

async function processMarkdownFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const originalSize = content.length;

    // Extract the actual transcript content (after the --- separator)
    const lines = content.split('\n');
    const separatorIndex = lines.findIndex((line) => line.trim() === '---');

    if (separatorIndex === -1) {
      console.log(`⚠️  No separator found in ${filePath}, skipping`);
      return { processed: false };
    }

    // Split into header and transcript
    const headerLines = lines.slice(0, separatorIndex + 2); // Include separator and empty line
    const transcriptLines = lines.slice(separatorIndex + 2);

    // Deduplicate only the transcript portion
    const deduplicatedTranscript = deduplicateTranscript(transcriptLines.join('\n'));

    // Reconstruct the file
    const newContent = [...headerLines, deduplicatedTranscript].join('\n');
    const newSize = newContent.length;

    if (newSize < originalSize) {
      await fs.writeFile(filePath, newContent, 'utf-8');
      const reduction = (((originalSize - newSize) / originalSize) * 100).toFixed(1);
      return {
        processed: true,
        originalSize,
        newSize,
        reduction: parseFloat(reduction),
      };
    }

    return { processed: false, originalSize, newSize };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return { processed: false, error: error.message };
  }
}

async function deduplicateAllTranscripts() {
  console.log('🧹 Deduplicating Lifelog Transcripts\n');

  const dataDir = path.join(__dirname, '..', '..', 'data', 'lifelogs');

  let totalFiles = 0;
  let processedFiles = 0;
  let totalOriginalSize = 0;
  let totalNewSize = 0;

  try {
    // Get all years
    const years = await fs.readdir(dataDir);

    for (const year of years) {
      const yearPath = path.join(dataDir, year);
      const yearStat = await fs.stat(yearPath);
      if (!yearStat.isDirectory()) continue;

      console.log(`\n📅 Processing year ${year}...`);

      // Get all months
      const months = await fs.readdir(yearPath);

      for (const month of months) {
        const monthPath = path.join(yearPath, month);
        const monthStat = await fs.stat(monthPath);
        if (!monthStat.isDirectory()) continue;

        // Get all days
        const days = await fs.readdir(monthPath);

        for (const day of days) {
          const dayPath = path.join(monthPath, day);
          const dayStat = await fs.stat(dayPath);
          if (!dayStat.isDirectory()) continue;

          // Get all markdown files
          const files = await fs.readdir(dayPath);
          const mdFiles = files.filter((f) => f.endsWith('.md'));

          if (mdFiles.length > 0) {
            process.stdout.write(`   ${year}-${month}-${day}: ${mdFiles.length} files... `);

            let dayProcessed = 0;
            let dayReduction = 0;

            for (const file of mdFiles) {
              const filePath = path.join(dayPath, file);
              totalFiles++;

              const result = await processMarkdownFile(filePath);

              if (result.processed) {
                processedFiles++;
                dayProcessed++;
                totalOriginalSize += result.originalSize;
                totalNewSize += result.newSize;
                dayReduction += result.reduction;
              } else if (result.originalSize) {
                totalOriginalSize += result.originalSize;
                totalNewSize += result.newSize;
              }
            }

            if (dayProcessed > 0) {
              const avgReduction = (dayReduction / dayProcessed).toFixed(1);
              console.log(`✅ ${dayProcessed} deduplicated (avg ${avgReduction}% reduction)`);
            } else {
              console.log('✓ No duplicates found');
            }
          }
        }
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total files: ${totalFiles}`);
    console.log(`   Files deduplicated: ${processedFiles}`);

    if (processedFiles > 0) {
      const totalReduction = (
        ((totalOriginalSize - totalNewSize) / totalOriginalSize) *
        100
      ).toFixed(1);
      const savedMB = ((totalOriginalSize - totalNewSize) / 1024 / 1024).toFixed(2);
      console.log(`   Space saved: ${savedMB} MB (${totalReduction}% reduction)`);
    }

    console.log('\n✨ Deduplication complete!');

    if (processedFiles > 0) {
      console.log('\n💡 Next steps:');
      console.log('   1. Run "npm run db:rebuild" to rebuild the vector database');
      console.log('   2. Run "npm run assistant:start" to start the monitoring service');
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the deduplication
deduplicateAllTranscripts().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
