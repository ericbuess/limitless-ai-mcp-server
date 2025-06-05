#!/usr/bin/env node

/**
 * Hybrid Memory Search Tool
 * Uses UnifiedSearchHandler to get results, then Claude to generate answers
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { UnifiedSearchHandler } from '../dist/search/unified-search.js';
import { FileManager } from '../dist/storage/file-manager.js';
import { ClaudeInvoker } from '../dist/utils/claude-invoker.js';
import { logger } from '../dist/utils/logger.js';

export class HybridMemorySearchTool {
  constructor(config = {}) {
    this.config = {
      trigger: config.trigger || { keyword: 'Claudius' },
      tasks: {
        memory_search: {
          cacheAnswers: true,
          confidenceThreshold: 0.8,
          ...config.tasks?.memory_search,
        },
      },
    };

    this.cacheDir = './data/answers';
    this.searchHistoryDir = './data/search-history';

    // Initialize search components
    this.fileManager = new FileManager({ baseDir: './data' });
    this.searchHandler = new UnifiedSearchHandler(null, this.fileManager, {
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
    logger.info('HybridMemorySearchTool initialized');
  }

  async search(query, context = {}) {
    const queryHash = this.hashQuery(query);
    logger.info('Starting hybrid memory search', { query, queryHash });

    // Check cache
    if (this.config.tasks.memory_search.cacheAnswers) {
      const cached = await this.getCachedAnswer(queryHash);
      if (cached) {
        logger.info('Returning cached answer', { queryHash });
        return cached;
      }
    }

    // Create session
    const { sessionId, sessionDir } = await this.claudeInvoker.createSession(query, context);

    try {
      // Step 1: Use UnifiedSearchHandler to get search results
      logger.info('Searching with UnifiedSearchHandler');
      const searchResults = await this.searchHandler.search(query);

      // Save raw search results
      await fs.writeFile(
        path.join(sessionDir, 'search-results.json'),
        JSON.stringify(searchResults, null, 2)
      );

      if (!searchResults.results || searchResults.results.length === 0) {
        const noResultsAnswer = {
          sessionId,
          query,
          answer: "I couldn't find any information about that in your lifelogs.",
          confidence: 0,
          iterations: 1,
          resultCount: 0,
        };

        await this.saveResults(sessionDir, noResultsAnswer);
        return noResultsAnswer;
      }

      // Step 2: Generate answer using Claude with search results embedded in prompt
      const relevantResults = searchResults.results.slice(0, 5);
      const prompt = this.buildAnswerPrompt(query, relevantResults);

      logger.info('Generating answer with Claude');
      const claudeResponse = await this.claudeInvoker.invoke(prompt, {
        sessionDir,
        iterationNum: 1,
        iterationName: 'generate-answer',
        outputFormat: 'json',
        maxTurns: 1, // Single turn since we're not using tools
      });

      // Extract answer from Claude's response
      let answer = "I found relevant information but couldn't generate a proper answer.";
      let confidence = 0.5;

      if (claudeResponse.result) {
        // Try to parse structured response
        try {
          const parsed = JSON.parse(claudeResponse.result);
          answer = parsed.answer || answer;
          confidence = parsed.confidence || confidence;
        } catch (e) {
          // Fallback to using the raw response
          answer = claudeResponse.result;
          confidence = 0.7;
        }
      }

      const result = {
        sessionId,
        query,
        answer,
        confidence,
        iterations: 1,
        resultCount: searchResults.results.length,
      };

      await this.saveResults(sessionDir, result);

      if (this.config.tasks.memory_search.cacheAnswers && confidence >= 0.7) {
        await this.cacheAnswer(queryHash, result);
      }

      return result;
    } catch (error) {
      logger.error('Hybrid search failed', { error: error.message, sessionId });
      throw error;
    }
  }

  buildAnswerPrompt(query, searchResults) {
    const resultsText = searchResults
      .map((r, i) => {
        const date = r.lifelog?.createdAt
          ? new Date(r.lifelog.createdAt).toLocaleString()
          : 'Unknown date';
        const content = (r.lifelog?.content || '').slice(0, 800);
        return `
Result ${i + 1}:
Date: ${date}
Title: ${r.lifelog?.title || 'Untitled'}
Relevant content: ${content}
---`;
      })
      .join('\n');

    return `Based on the following search results from the user's lifelogs, please answer this question: "${query}"

Search Results:
${resultsText}

Instructions:
1. Provide a direct, helpful answer based ONLY on the information found in the search results
2. If the information is incomplete or uncertain, acknowledge that
3. Be specific and reference the date/time when relevant
4. Keep your answer concise but complete

Respond with a JSON object in this format:
{
  "answer": "Your natural language answer here",
  "confidence": 0.0-1.0
}`;
  }

  hashQuery(query) {
    return createHash('sha256').update(query.toLowerCase().trim()).digest('hex').substring(0, 16);
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

  async execute(task) {
    const query = this.extractQuery(task);
    const result = await this.search(query, {
      triggerContext: task.trigger.text,
      fullContext: task.trigger.fullContext,
      metadata: task.trigger.metadata,
    });

    return result;
  }

  extractQuery(task) {
    if (task.trigger.assessment?.extractedRequest) {
      return task.trigger.assessment.extractedRequest;
    }

    const context = task.trigger.text;
    const keyword = this.config.trigger.keyword;

    const keywordIndex = context.toLowerCase().indexOf(keyword.toLowerCase());
    if (keywordIndex !== -1) {
      const afterKeyword = context.substring(keywordIndex + keyword.length).trim();
      const match = afterKeyword.match(/^[^.!?]+[.!?]?/);
      return match ? match[0].trim() : afterKeyword;
    }

    return context;
  }
}

// Export as default for compatibility
export default HybridMemorySearchTool;

// Test function
async function testHybridSearch() {
  const tool = new HybridMemorySearchTool();
  await tool.initialize();

  console.log('🧪 Testing Hybrid Memory Search Tool\n');
  console.log('This version:');
  console.log('1. Uses UnifiedSearchHandler for fast local search');
  console.log('2. Passes results to Claude for answer generation');
  console.log('3. Works without tool permissions\n');

  const query = 'what did I have for lunch yesterday?';
  console.log(`🔍 Searching for: "${query}"...\n`);

  try {
    const result = await tool.search(query, {
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
  testHybridSearch().catch(console.error);
}
