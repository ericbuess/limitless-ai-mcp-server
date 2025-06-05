#!/usr/bin/env node

// Simple search test without hanging issues
const { execSync } = require('child_process');

console.log('🔍 Running simple search test...\n');

try {
  // Use the existing search.js utility
  const result = execSync('node scripts/utilities/search.js "smoothie king"', {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  console.log('Search completed successfully!');
  console.log('Output (first 1000 chars):');
  console.log(result.slice(0, 1000));

  // Check if Smoothie King was found (case insensitive)
  if (result.toLowerCase().includes('smoothie') && result.toLowerCase().includes('king')) {
    console.log('\n✅ SUCCESS: Found Smoothie King in search results!');

    // Count occurrences
    const smoothieCount = (result.match(/smoothie/gi) || []).length;
    const kingCount = (result.match(/king/gi) || []).length;
    console.log(`   Found "smoothie" ${smoothieCount} times and "king" ${kingCount} times`);
  } else {
    console.log('\n❌ FAIL: Smoothie King not found in results');
  }
} catch (error) {
  console.error('Search failed:', error.message);
  if (error.stdout) {
    console.log('Stdout:', error.stdout.toString().slice(0, 500));
  }
  if (error.stderr) {
    console.log('Stderr:', error.stderr.toString().slice(0, 500));
  }
}
