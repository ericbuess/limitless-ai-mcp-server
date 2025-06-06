import { FileManager } from '../../dist/storage/file-manager.js';
import fs from 'fs/promises';

async function debugLoadLifelog() {
  console.log('Debugging lifelog loading...\n');

  const fileManager = new FileManager({ baseDir: './data' });
  await fileManager.initialize();

  // Test with a specific file
  const testId = '16MQOhubhurhprRIK7jd';
  const filePath = './data/lifelogs/2025/06/05/16MQOhubhurhprRIK7jd.md';

  // Read the raw content
  console.log('1. Reading raw file content:');
  const rawContent = await fs.readFile(filePath, 'utf8');
  console.log(`File length: ${rawContent.length} bytes`);
  console.log('First 200 chars:', rawContent.substring(0, 200));

  // Try different date constructions
  console.log('\n2. Testing different date constructions:');

  const dates = [
    new Date('2025-06-05'),
    new Date(2025, 5, 5), // June 5 (month is 0-indexed)
    new Date(Date.UTC(2025, 5, 5)),
    new Date('2025-06-05T00:00:00Z'),
  ];

  for (const date of dates) {
    console.log(`\nTrying date: ${date.toISOString()}`);
    console.log(`Local string: ${date.toString()}`);

    try {
      const lifelog = await fileManager.loadLifelog(testId, date);
      if (lifelog) {
        console.log('✓ SUCCESS! Loaded lifelog:', {
          id: lifelog.id,
          title: lifelog.title?.substring(0, 50) + '...',
          contentLength: lifelog.content?.length,
        });
      } else {
        console.log('✗ Returned null');

        // Check what path it's looking for
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        console.log(`  Expected path: data/lifelogs/${year}/${month}/${day}/${testId}.md`);
      }
    } catch (error) {
      console.log('✗ Error:', error.message);
    }
  }

  // Check the parseMarkdownToLifelog method directly
  console.log('\n3. Testing parseMarkdownToLifelog directly:');

  // Simulate what parseMarkdownToLifelog does
  const lines = rawContent.split('\n');
  console.log('First line:', lines[0]);
  console.log('Title extraction:', lines[0].replace('# Lifelog: ', '').trim());

  const idMatch = rawContent.match(/\*\*ID:\*\* (.+)/);
  const dateMatch = rawContent.match(/\*\*Date:\*\* (.+)/);
  const durationMatch = rawContent.match(/\*\*Duration:\*\* (\d+) minutes/);

  console.log('ID match:', idMatch ? idMatch[1] : 'NOT FOUND');
  console.log('Date match:', dateMatch ? dateMatch[1] : 'NOT FOUND');
  console.log('Duration match:', durationMatch ? durationMatch[1] : 'NOT FOUND');

  if (dateMatch) {
    const parsedDate = new Date(dateMatch[1]);
    console.log('Parsed date:', parsedDate.toString());
    console.log('Is valid date:', !isNaN(parsedDate.getTime()));
  }
}

debugLoadLifelog().catch(console.error);
