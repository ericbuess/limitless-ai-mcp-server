#!/usr/bin/env node

/**
 * Benchmark different embedding models for our specific use case
 * Tests semantic understanding of family relationships
 */

import { OllamaEmbeddingProvider } from '../dist/vector-store/ollama-embeddings.js';
import { TransformerEmbeddingProvider } from '../dist/vector-store/transformer-embeddings.js';
import { logger } from '../dist/utils/logger.js';

// Test cases specifically for our "kids → Emmy/Mimi" problem
const testCases = [
  {
    query: 'where did the kids go this afternoon',
    documents: [
      "Emmy and her sister went to Mimi's house for a playdate",
      "The children were taken to their grandmother Mimi's place",
      "Kids went to Mimi's house at 12:30 PM",
      'Meeting with Sarah about AI coding tools',
      'Discussing dinner plans with the family',
    ],
    expectedTopMatch: 2, // "Kids went to Mimi's house" should rank highest
  },
  {
    query: 'Emmy activities',
    documents: [
      'Emmy played with toys at home',
      'The kids including Emmy went outside',
      "Children's activities for the afternoon",
      'Email about work activities',
      'Gaming session in the evening',
    ],
    expectedTopMatch: 1, // Direct Emmy mention should rank highest
  },
  {
    query: 'Mimi house location',
    documents: [
      "Directions to grandmother's house",
      "Mimi's house is on Oak Street",
      "Going to Mimi's place for dinner",
      'House renovation project details',
      'Location services on the phone',
    ],
    expectedTopMatch: 1, // Direct Mimi house mention
  },
];

async function cosineSimilarity(vec1, vec2) {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

async function benchmarkModel(provider, modelName) {
  console.log(`\n=== Testing ${modelName} ===`);
  console.log(`Dimensions: ${provider.getDimension()}`);

  const results = [];

  for (const testCase of testCases) {
    console.log(`\nQuery: "${testCase.query}"`);

    // Get query embedding
    const startEmbed = Date.now();
    const queryEmbedding = await provider.embedSingle(testCase.query);
    const embedTime = Date.now() - startEmbed;

    // Get document embeddings and calculate similarities
    const docScores = [];
    for (let i = 0; i < testCase.documents.length; i++) {
      const docEmbedding = await provider.embedSingle(testCase.documents[i]);
      const similarity = await cosineSimilarity(queryEmbedding, docEmbedding);
      docScores.push({
        index: i,
        text: testCase.documents[i],
        score: similarity,
      });
    }

    // Sort by similarity
    docScores.sort((a, b) => b.score - a.score);

    // Display results
    console.log('\nTop matches:');
    docScores.slice(0, 3).forEach((doc, rank) => {
      const marker = doc.index === testCase.expectedTopMatch ? ' ✅' : '';
      console.log(`${rank + 1}. [${doc.score.toFixed(3)}] ${doc.text}${marker}`);
    });

    // Check if expected match is in top position
    const topMatch = docScores[0];
    const isCorrect = topMatch.index === testCase.expectedTopMatch;
    const expectedRank = docScores.findIndex((d) => d.index === testCase.expectedTopMatch) + 1;

    results.push({
      query: testCase.query,
      correct: isCorrect,
      expectedRank,
      topScore: topMatch.score,
      embedTime,
    });

    if (!isCorrect) {
      console.log(`❌ Expected match ranked #${expectedRank}`);
    }
  }

  // Summary statistics
  const correctCount = results.filter((r) => r.correct).length;
  const avgRank = results.reduce((sum, r) => sum + r.expectedRank, 0) / results.length;
  const avgTime = results.reduce((sum, r) => sum + r.embedTime, 0) / results.length;
  const avgScore = results.reduce((sum, r) => sum + r.topScore, 0) / results.length;

  console.log('\n📊 Summary:');
  console.log(
    `Correct top matches: ${correctCount}/${results.length} (${((correctCount / results.length) * 100).toFixed(0)}%)`
  );
  console.log(`Average expected rank: ${avgRank.toFixed(1)}`);
  console.log(`Average top score: ${avgScore.toFixed(3)}`);
  console.log(`Average embed time: ${avgTime.toFixed(0)}ms`);

  return {
    model: modelName,
    correctRate: correctCount / results.length,
    avgRank,
    avgScore,
    avgTime,
  };
}

async function runBenchmarks() {
  console.log('🔬 Benchmarking Embedding Models for Family/Location Queries\n');

  const results = [];

  // Test current transformer model
  console.log('Testing current model...');
  const transformer = new TransformerEmbeddingProvider();
  await transformer.initialize();
  results.push(await benchmarkModel(transformer, 'all-MiniLM-L6-v2 (current)'));

  // Test Ollama nomic-embed-text
  console.log('\nTesting Ollama nomic-embed-text...');
  const nomic = new OllamaEmbeddingProvider('nomic-embed-text');
  await nomic.initialize();
  const nomicResult = await benchmarkModel(nomic, 'nomic-embed-text');
  if (nomicResult) results.push(nomicResult);

  // Test Ollama mxbai-embed-large
  console.log('\nTesting Ollama mxbai-embed-large...');
  const mxbai = new OllamaEmbeddingProvider('mxbai-embed-large');
  await mxbai.initialize();
  const mxbaiResult = await benchmarkModel(mxbai, 'mxbai-embed-large');
  if (mxbaiResult) results.push(mxbaiResult);

  // Final comparison
  console.log('\n\n📈 FINAL COMPARISON:');
  console.log('Model                    | Correct | Avg Rank | Avg Score | Speed');
  console.log('-------------------------|---------|----------|-----------|-------');
  results.forEach((r) => {
    console.log(
      `${r.model.padEnd(24)} | ${(r.correctRate * 100).toFixed(0).padStart(5)}% | ${r.avgRank
        .toFixed(1)
        .padStart(8)} | ${r.avgScore.toFixed(3).padStart(9)} | ${r.avgTime
        .toFixed(0)
        .padStart(4)}ms`
    );
  });

  // Recommend best model
  const best = results.reduce((best, current) =>
    current.correctRate > best.correctRate ? current : best
  );

  console.log(`\n✨ Recommended model: ${best.model}`);
  console.log(`   - ${(best.correctRate * 100).toFixed(0)}% accuracy on family/location queries`);
  console.log(`   - ${best.avgScore.toFixed(3)} average similarity score`);
  console.log(`   - ${best.avgTime.toFixed(0)}ms per embedding`);
}

runBenchmarks().catch(console.error);
