#!/usr/bin/env node

/**
 * Benchmark script to compare embedding models
 * Tests semantic similarity, performance, and memory usage
 */

import { TransformerEmbeddingProvider } from '../dist/vector-store/transformer-embeddings.js';
import { OllamaEmbeddingProvider } from '../dist/vector-store/ollama-embeddings.js';
import { logger } from '../dist/utils/logger.js';
import { performance } from 'perf_hooks';

class EmbeddingBenchmark {
  constructor() {
    this.testQueries = [
      // Original query and expected matches
      {
        query: 'where did the kids go this afternoon?',
        expectedMatches: [
          "Emmy and the children went to Mimi's house",
          "The kids are going to grandma's place",
          "Taking Emmy to grandmother's home this afternoon",
        ],
        negativeMatches: [
          'Discussion about AI and machine learning',
          'Coding session with JavaScript',
          'Meeting about software development',
        ],
      },
      {
        query: 'what did I have for lunch?',
        expectedMatches: [
          'I had a sandwich and salad for lunch',
          'Lunch was pizza and a drink',
          'Ate sushi at the Japanese restaurant',
        ],
        negativeMatches: [
          'Morning coffee discussion',
          'Dinner plans for tonight',
          'Breakfast meeting tomorrow',
        ],
      },
      {
        query: 'meeting with Sarah about the project',
        expectedMatches: [
          'Sarah and I discussed the project timeline',
          'Project meeting with Sarah at 2pm',
          'Talked to Sarah regarding project updates',
        ],
        negativeMatches: [
          "John's birthday party planning",
          'Team lunch without Sarah',
          'Solo work on different project',
        ],
      },
    ];
  }

  async runBenchmark() {
    console.log('🚀 Embedding Model Benchmark\n');
    console.log('Testing on M4 MacBook Pro Max with 128GB RAM\n');

    // Test current model (all-MiniLM-L6-v2)
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Testing CURRENT MODEL: all-MiniLM-L6-v2 (384 dimensions)');
    console.log('═══════════════════════════════════════════════════════════════');
    const transformerProvider = new TransformerEmbeddingProvider();
    await this.testProvider(transformerProvider, 'Transformer (all-MiniLM-L6-v2)');

    // Test Ollama with nomic-embed-text
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing OLLAMA MODEL: nomic-embed-text (768 dimensions)');
    console.log('═══════════════════════════════════════════════════════════════');
    const ollamaProvider = new OllamaEmbeddingProvider('nomic-embed-text');
    const ollamaAvailable = await this.checkOllamaAvailability(ollamaProvider);

    if (ollamaAvailable) {
      await this.testProvider(ollamaProvider, 'Ollama (nomic-embed-text)');
    } else {
      console.log(
        '⚠️  Ollama not available. Install with: brew install ollama && ollama pull nomic-embed-text'
      );
    }

    // Test Ollama with larger model if requested
    if (process.argv.includes('--test-large')) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('Testing OLLAMA MODEL: mxbai-embed-large (1024 dimensions)');
      console.log('═══════════════════════════════════════════════════════════════');
      const ollamaLargeProvider = new OllamaEmbeddingProvider('mxbai-embed-large');
      const largAvailable = await this.checkOllamaAvailability(ollamaLargeProvider);

      if (largAvailable) {
        await this.testProvider(ollamaLargeProvider, 'Ollama (mxbai-embed-large)');
      }
    }

    console.log('\n✨ Benchmark complete!\n');
    this.printRecommendations();
  }

  async checkOllamaAvailability(provider) {
    try {
      await provider.initialize();
      return provider.isAvailable();
    } catch (error) {
      return false;
    }
  }

  async testProvider(provider, providerName) {
    try {
      // Initialize
      const initStart = performance.now();
      await provider.initialize();
      const initTime = performance.now() - initStart;
      console.log(`\n✓ Initialized in ${initTime.toFixed(0)}ms`);

      // Test embedding speed
      console.log('\n📊 Performance Tests:');
      await this.testEmbeddingSpeed(provider);

      // Test semantic similarity
      console.log('\n🎯 Semantic Similarity Tests:');
      const avgScore = await this.testSemanticSimilarity(provider);

      // Memory usage
      const memUsage = process.memoryUsage();
      console.log('\n💾 Memory Usage:');
      console.log(`   RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);

      return { providerName, initTime, avgScore };
    } catch (error) {
      console.error(`\n❌ Error testing ${providerName}:`, error.message);
      return null;
    }
  }

  async testEmbeddingSpeed(provider) {
    const testTexts = [
      'The quick brown fox jumps over the lazy dog',
      "Emmy and the kids went to Mimi's house this afternoon for a playdate",
      'We had a great meeting about the new project features and timeline',
    ];

    // Single embedding
    const singleStart = performance.now();
    await provider.embedSingle(testTexts[0]);
    const singleTime = performance.now() - singleStart;
    console.log(`   Single embedding: ${singleTime.toFixed(1)}ms`);

    // Batch embedding
    const batchStart = performance.now();
    await provider.embed(testTexts);
    const batchTime = performance.now() - batchStart;
    console.log(
      `   Batch (3 texts): ${batchTime.toFixed(1)}ms (${(batchTime / 3).toFixed(1)}ms per text)`
    );

    // Large batch
    const largeBatch = Array(50).fill(testTexts[0]);
    const largeBatchStart = performance.now();
    await provider.embed(largeBatch);
    const largeBatchTime = performance.now() - largeBatchStart;
    console.log(
      `   Large batch (50 texts): ${largeBatchTime.toFixed(1)}ms (${(largeBatchTime / 50).toFixed(1)}ms per text)`
    );
  }

  async testSemanticSimilarity(provider) {
    let totalScore = 0;
    let testCount = 0;

    for (const test of this.testQueries) {
      console.log(`\n   Query: "${test.query}"`);

      // Embed query
      const queryEmbedding = await provider.embedSingle(test.query);

      // Test expected matches (should have high similarity)
      const expectedScores = [];
      for (const match of test.expectedMatches) {
        const matchEmbedding = await provider.embedSingle(match);
        const similarity = this.cosineSimilarity(queryEmbedding, matchEmbedding);
        expectedScores.push(similarity);
      }
      const avgExpected = expectedScores.reduce((a, b) => a + b, 0) / expectedScores.length;
      console.log(`   ✓ Expected matches avg similarity: ${(avgExpected * 100).toFixed(1)}%`);

      // Test negative matches (should have low similarity)
      const negativeScores = [];
      for (const match of test.negativeMatches) {
        const matchEmbedding = await provider.embedSingle(match);
        const similarity = this.cosineSimilarity(queryEmbedding, matchEmbedding);
        negativeScores.push(similarity);
      }
      const avgNegative = negativeScores.reduce((a, b) => a + b, 0) / negativeScores.length;
      console.log(`   ✓ Negative matches avg similarity: ${(avgNegative * 100).toFixed(1)}%`);

      // Calculate discrimination score (higher is better)
      const discrimination = avgExpected - avgNegative;
      console.log(`   📈 Discrimination score: ${(discrimination * 100).toFixed(1)}%`);

      totalScore += discrimination;
      testCount++;
    }

    const overallScore = totalScore / testCount;
    console.log(`\n   🎯 Overall discrimination score: ${(overallScore * 100).toFixed(1)}%`);
    return overallScore;
  }

  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  printRecommendations() {
    console.log('📋 RECOMMENDATIONS:');
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log('1. IMMEDIATE UPGRADE (Easy):');
    console.log('   - Install Ollama: brew install ollama');
    console.log('   - Start service: ollama serve');
    console.log('   - Pull model: ollama pull nomic-embed-text');
    console.log('   - Benefits: 2x dimensions (384→768), better semantic understanding\n');

    console.log('2. BETTER QUALITY (Recommended):');
    console.log('   - Pull larger model: ollama pull mxbai-embed-large');
    console.log('   - Benefits: 1024 dimensions, state-of-the-art retrieval\n');

    console.log('3. MAXIMUM QUALITY (For 128GB RAM):');
    console.log('   - Consider BGE-M3 or E5-Large models');
    console.log('   - Use advanced techniques like hybrid search');
    console.log('   - Implement semantic chunking\n');

    console.log('4. EXPECTED IMPROVEMENTS:');
    console.log('   - "where did kids go" → Will find Emmy/Mimi references');
    console.log('   - Better understanding of synonyms and context');
    console.log('   - More accurate temporal query handling\n');
  }
}

// Run the benchmark
const benchmark = new EmbeddingBenchmark();
benchmark.runBenchmark().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
