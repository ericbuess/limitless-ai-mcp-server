#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

async function debugFileLoading() {
  console.log('🔍 Debugging File Loading\n');

  const lifelogsDir = './data/lifelogs';

  try {
    // Check if directory exists
    try {
      await fs.access(lifelogsDir);
      console.log(`✅ Directory exists: ${lifelogsDir}`);
    } catch {
      console.log(`❌ Directory not found: ${lifelogsDir}`);
      return;
    }

    // List years
    const years = await fs.readdir(lifelogsDir);
    console.log(`\nFound ${years.length} year directories:`, years);

    // Check first year
    if (years.length > 0) {
      const year = years[0];
      const yearPath = path.join(lifelogsDir, year);
      const yearStat = await fs.stat(yearPath);

      console.log(`\nChecking ${year}:`);
      console.log(`- Is directory: ${yearStat.isDirectory()}`);

      if (yearStat.isDirectory()) {
        const months = await fs.readdir(yearPath);
        console.log(`- Found ${months.length} months:`, months);

        // Check if any contain "data", "models", etc.
        const invalidDirs = months.filter(
          (m) => m === 'data' || m === 'models' || m === 'embeddings'
        );

        if (invalidDirs.length > 0) {
          console.log(`\n⚠️  Found non-date directories: ${invalidDirs.join(', ')}`);
          console.log('These are causing the loadAllLifelogs function to fail!');
        }
      }
    }

    // Try manual load of June 9
    const june9Path = path.join(lifelogsDir, '2025', '06', '09');
    try {
      const files = await fs.readdir(june9Path);
      const mdFiles = files.filter((f) => f.endsWith('.md'));
      console.log(`\n✅ June 9, 2025 has ${mdFiles.length} lifelog files`);

      // Look for lunch file
      if (mdFiles.includes('K9G2oUoUqVqj3XmRAwvN.md')) {
        console.log('✅ Found lunch lifelog K9G2oUoUqVqj3XmRAwvN.md');
      }
    } catch (error) {
      console.log('❌ Could not read June 9 directory:', error.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

debugFileLoading().catch(console.error);
