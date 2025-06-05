#!/usr/bin/env node

/**
 * Enhanced Memory Search Tool that uses UnifiedSearchHandler for search
 * and Claude only for generating natural language answers
 */

import { UnifiedSearchHandler } from '../dist/search/unified-search.js';
import { FileManager } from '../dist/storage/file-manager.js';
import { ClaudeInvoker } from '../dist/utils/claude-invoker.js';
import { logger } from '../dist/utils/logger.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export class MemorySearchToolV2 {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || './data/answers';
    this.searchHistoryDir = options.searchHistoryDir || './data/search-history';
    this.maxIterations = options.maxIterations || 3;
    this.confidenceThreshold = options.confidenceThreshold || 0.8;
    this.cacheAnswers = options.cacheAnswers !== false;

    // Initialize unified search handler
    const fileManager = new FileManager({ baseDir: './data' });
    this.searchHandler = new UnifiedSearchHandler(null, fileManager, {
      enableVectorStore: true,
      enableClaude: false,
    });

    this.claudeInvoker = new ClaudeInvoker({
      baseDir: this.searchHistoryDir,
    });
  }

  async initialize() {
    await this.searchHandler.initialize();
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.searchHistoryDir, { recursive: true });
    logger.info('MemorySearchToolV2 initialized');
  }

  async search(query, context = {}) {
    const queryHash = this.hashQuery(query);
    logger.info('Starting memory search V2', { query, queryHash, context });

    // Check cache first
    if (this.cacheAnswers) {
      const cached = await this.getCachedAnswer(queryHash);
      if (cached) {
        logger.info('Returning cached answer', { queryHash });
        return cached;
      }
    }

    // Create session for audit trail
    const { sessionId, sessionDir } = await this.claudeInvoker.createSession(query, context);

    try {
      // Step 1: Use UnifiedSearchHandler to find relevant information
      logger.info('Searching with UnifiedSearchHandler', { query });
      const searchResults = await this.searchHandler.search(query);

      // Save search results
      await fs.writeFile(
        path.join(sessionDir, 'search-results.json'),
        JSON.stringify(searchResults, null, 2)
      );

      // Step 2: Prepare relevant content for Claude
      const relevantContent = this.prepareContentForClaude(searchResults.results.slice(0, 10));

      if (relevantContent.length === 0) {
        const noResultsAnswer = {
          sessionId,
          query,
          answer:
            "I couldn't find any information about that in your lifelogs. The query might be too specific or the information might not be in the recorded conversations.",
          confidence: 0,
          iterations: 1,
          resultCount: 0,
        };

        await this.saveResults(sessionDir, noResultsAnswer);
        if (this.cacheAnswers) {
          await this.cacheAnswer(queryHash, noResultsAnswer);
        }

        return noResultsAnswer;
      }

      // Step 3: Use Claude to generate natural language answer
      logger.info('Generating answer with Claude', { resultCount: relevantContent.length });
      const answer = await this.generateAnswer(query, relevantContent, sessionDir);

      const result = {
        sessionId,
        query,
        answer: answer.answer,
        confidence: answer.confidence,
        iterations: 1,
        resultCount: searchResults.results.length,
      };

      await this.saveResults(sessionDir, result);

      if (this.cacheAnswers && result.confidence >= 0.7) {
        await this.cacheAnswer(queryHash, result);
      }

      return result;
    } catch (error) {
      logger.error('Search failed', { error: error.message, sessionId });
      throw error;
    }
  }

  prepareContentForClaude(results) {
    return results.map((result) => ({
      file: result.file,
      date: result.metadata?.date || 'Unknown date',
      content: result.content,
      score: result.score,
    }));
  }

  async generateAnswer(query, searchResults, sessionDir) {
    const prompt = `Based on the following search results from user's lifelogs, answer this question: "${query}"

Search Results:
${searchResults
  .map(
    (r, i) => `
Result ${i + 1}:
File: ${r.file}
Date: ${r.date}
Content: ${r.content}
---`
  )
  .join('\n')}

Provide a clear, direct answer based only on the information found. If the information is partial or uncertain, mention that. Format your response as JSON:

{
  "answer": "Your natural language answer here",
  "confidence": 0.0-1.0,
  "sources": ["file1", "file2"]
}`;

    try {
      const response = await this.claudeInvoker.invoke(prompt, {
        sessionDir,
        iterationNum: 1,
        iterationName: 'answer-generation',
        outputFormat: 'json',
        maxTurns: 1,
        allowedTools: [], // No tools needed for answer generation
      });

      // Parse Claude's response
      if (response.result) {
        try {
          const parsed = JSON.parse(response.result);
          return parsed;
        } catch (e) {
          // Fallback if JSON parsing fails
          return {
            answer: response.result,
            confidence: 0.7,
            sources: searchResults.map((r) => r.file),
          };
        }
      }

      return {
        answer: "I found relevant information but couldn't generate a proper answer.",
        confidence: 0.5,
        sources: searchResults.map((r) => r.file),
      };
    } catch (error) {
      logger.error('Failed to generate answer with Claude', { error: error.message });
      // Fallback to simple answer based on search results
      const topResult = searchResults[0];
      return {
        answer: `Based on your lifelogs from ${topResult.date}: ${topResult.content}`,
        confidence: 0.6,
        sources: [topResult.file],
      };
    }
  }

  hashQuery(query) {
    return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex').slice(0, 12);
  }

  async getCachedAnswer(queryHash) {
    try {
      const cachePath = path.join(this.cacheDir, `${queryHash}.json`);
      const content = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(content);

      // Check cache age (24 hours)
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return cached.result;
      }
    } catch (error) {
      // Cache miss
    }
    return null;
  }

  async cacheAnswer(queryHash, result) {
    const cachePath = path.join(this.cacheDir, `${queryHash}.json`);
    await fs.writeFile(
      cachePath,
      JSON.stringify(
        {
          result,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }

  async saveResults(sessionDir, results) {
    await fs.writeFile(
      path.join(sessionDir, 'results.json'),
      JSON.stringify(
        {
          ...results,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }
}

// Test function
async function testMemorySearchV2() {
  const searchTool = new MemorySearchToolV2();
  await searchTool.initialize();

  console.log('🧪 Testing Enhanced Memory Search Tool\n');
  console.log('📋 This version uses UnifiedSearchHandler for search');
  console.log('   and Claude only for generating natural language answers\n');

  const testQuery = 'what did I have for lunch yesterday?';
  console.log(`🔍 Searching for: "${testQuery}"...\n`);

  try {
    const result = await searchTool.search(testQuery, {
      triggerContext: 'Hey Claudius, what did I have for lunch yesterday?',
    });

    console.log('✅ Search completed!\n');
    console.log('📊 Results:');
    console.log('─'.repeat(60));
    console.log(`Answer: ${result.answer}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`Results found: ${result.resultCount}`);
    console.log(`Session ID: ${result.sessionId}`);
    console.log('─'.repeat(60));
  } catch (error) {
    console.error('❌ Search failed:', error.message);
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMemorySearchV2().catch(console.error);
}
