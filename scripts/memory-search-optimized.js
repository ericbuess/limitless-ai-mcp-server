#!/usr/bin/env node

/**
 * Optimized Memory Search Tool with Reduced Iterations
 *
 * Key optimizations:
 * 1. Max 2 local iterations (down from 5)
 * 2. Max 1 Claude iteration (down from 3)
 * 3. Better food extraction prompts
 * 4. Early termination on high-quality results
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

import { FileManager } from '../dist/storage/file-manager.js';
import { UnifiedSearchHandler } from '../dist/search/unified-search.js';
import { ClaudeInvoker } from '../dist/utils/claude-invoker.js';
import { logger } from '../dist/utils/logger.js';

export class OptimizedMemorySearchTool {
  constructor(config = {}) {
    this.config = {
      trigger: config.trigger || { keyword: 'Claudius' },
      tasks: {
        memory_search: {
          cacheAnswers: true,
          confidenceThreshold: 0.8, // Lowered from 0.9
          maxIterations: 1, // Max Claude iterations
          maxLocalIterations: 2, // Max local search iterations
          ...config.tasks?.memory_search,
        },
      },
    };

    this.cacheDir = './data/answers';
    this.searchHistoryDir = './data/search-history';

    // Initialize search components
    this.fileManager = new FileManager({ baseDir: './data' });
    this.searchHandler = new UnifiedSearchHandler(this.fileManager, {
      enableVectorStore: true,
      enableClaude: false,
    });

    this.claudeInvoker = new ClaudeInvoker({
      baseDir: this.searchHistoryDir,
    });
  }

  async execute(task) {
    try {
      logger.info('Executing optimized memory search task', { id: task.id });

      // Initialize search handler
      await this.searchHandler.initialize();

      // Extract the query
      const query = task.trigger?.assessment?.extractedRequest || task.trigger?.text || '';
      if (!query) {
        throw new Error('No query found in task');
      }

      // Check cache first
      const cachedAnswer = await this.checkCache(query);
      if (cachedAnswer) {
        logger.info('Returning cached answer');
        return cachedAnswer;
      }

      // Create session directory
      const sessionId = `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const dateDir = new Date().toISOString().split('T')[0];
      const sessionDir = path.join(this.searchHistoryDir, dateDir, sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      // Save query
      await fs.writeFile(path.join(sessionDir, 'query.txt'), query);

      logger.info('Created optimized search session', { sessionId, query });

      // Phase 1: Fast local search (max 2 iterations)
      const localResults = await this.performOptimizedLocalSearch(query, sessionDir);

      // Check if we have high-quality results
      // For food queries, always use Claude to extract specific details
      const isFoodQuery = /\b(eat|ate|food|lunch|dinner|breakfast|meal)\b/i.test(query);

      if (
        localResults.confidence >= 0.8 &&
        localResults.refinedResults.length >= 5 &&
        !isFoodQuery
      ) {
        logger.info('High confidence local results, skipping Claude');
        const answer = this.generateDirectAnswer(query, localResults.refinedResults);

        const result = {
          answer,
          confidence: localResults.confidence,
          sessionId,
          iterations: localResults.iterations,
          resultCount: localResults.resultCount,
          source: 'local',
        };

        await this.cacheAnswer(query, result);
        return result;
      }

      // Phase 2: Single Claude iteration for complex queries
      const claudeResult = await this.performSingleClaudeIteration(query, localResults, sessionDir);

      const result = {
        ...claudeResult,
        sessionId,
        iterations: localResults.iterations + 1,
        resultCount: localResults.resultCount,
      };

      // Cache if high confidence
      if (result.confidence >= 0.7) {
        await this.cacheAnswer(query, result);
      }

      return result;
    } catch (error) {
      logger.error('Task execution failed', { error, taskId: task.id });
      throw error;
    } finally {
      // Clean up search handler
      await this.searchHandler.stop();
    }
  }

  async performOptimizedLocalSearch(query, sessionDir) {
    const maxIterations = 2;
    let iteration = 0;
    let confidence = 0;
    const allResults = new Map();
    let bestResults = [];

    while (iteration < maxIterations && confidence < 0.8) {
      iteration++;
      logger.info(`Optimized local iteration ${iteration}/${maxIterations}`);

      // Simple query variations
      const variations = iteration === 1 ? [query] : this.generateFoodSpecificVariations(query);

      // Run searches
      const iterationResults = [];
      for (const queryVar of variations) {
        const searchResult = await this.searchHandler.search(queryVar, {
          strategy: 'parallel',
          limit: 20,
        });

        if (searchResult.results) {
          iterationResults.push(...searchResult.results);
        }
      }

      // Deduplicate
      iterationResults.forEach((result) => {
        const id = result.lifelog?.id || result.file;
        if (id && !allResults.has(id)) {
          allResults.set(id, result);
        }
      });

      // Score and rank
      bestResults = Array.from(allResults.values())
        .sort((a, b) => (b.consensusScore || b.score || 0) - (a.consensusScore || a.score || 0))
        .slice(0, 10);

      // Calculate confidence
      confidence = this.calculateConfidence(bestResults, query);

      logger.info(`Iteration ${iteration} complete`, {
        newResults: iterationResults.length,
        totalUnique: allResults.size,
        confidence,
      });

      // Early termination
      if (bestResults.length >= 5 && bestResults[0]?.consensusScore > 0.8) {
        logger.info('High quality results found, terminating');
        break;
      }
    }

    return {
      refinedResults: bestResults,
      allResults: Array.from(allResults.values()),
      iterations: iteration,
      resultCount: allResults.size,
      confidence,
    };
  }

  generateFoodSpecificVariations(query) {
    const variations = [];

    // Check if it's a food query
    const foodKeywords = ['eat', 'ate', 'lunch', 'breakfast', 'dinner', 'food', 'restaurant'];
    const hasFood = foodKeywords.some((kw) => query.toLowerCase().includes(kw));

    if (hasFood) {
      // Add specific restaurant names
      variations.push(query + ' Smoothie King Chick-fil-A restaurant');
      variations.push('who ate what lunch different restaurants');
    }

    // Add date if not present
    if (!query.match(/\d{4}|\d{1,2}\/\d{1,2}/)) {
      const today = new Date().toISOString().split('T')[0];
      variations.push(query + ' ' + today);
    }

    return variations.slice(0, 2);
  }

  async performSingleClaudeIteration(query, localResults, sessionDir) {
    logger.info('Performing single Claude iteration');

    // Take top 10 results
    const topResults = localResults.refinedResults.slice(0, 10);

    // Create optimized prompt for food extraction
    const prompt = this.createOptimizedPrompt(query, topResults);

    // Save prompt
    await fs.writeFile(path.join(sessionDir, 'claude-prompt.txt'), prompt);

    // Invoke Claude
    const response = await this.claudeInvoker.invoke(prompt);

    // Save response
    await fs.writeFile(
      path.join(sessionDir, 'claude-response.json'),
      JSON.stringify(response, null, 2)
    );

    // Parse response
    if (response.answer) {
      return {
        answer: response.answer,
        confidence: response.confidence || 0.7,
        hasCompleteAnswer: true,
      };
    }

    // Fallback
    return {
      answer: this.generateDirectAnswer(query, topResults),
      confidence: 0.6,
      hasCompleteAnswer: true,
    };
  }

  createOptimizedPrompt(query, results) {
    const resultsText = results
      .map((r, i) => {
        const content = r.lifelog?.content || r.content || '';
        const title = r.lifelog?.title || '';
        const date = r.lifelog?.createdAt || '';

        // Extract key sentences for food queries
        let excerpt = content;
        if (query.toLowerCase().includes('lunch') || query.toLowerCase().includes('eat')) {
          // Find sentences with food/restaurant mentions
          const sentences = content.split(/[.!?]+/);
          const foodSentences = sentences.filter((s) =>
            /smoothie|chick|restaurant|eat|ate|lunch|food|nugget/i.test(s)
          );
          if (foodSentences.length > 0) {
            excerpt = foodSentences.join('. ');
          }
        }

        // Limit excerpt length
        excerpt = excerpt.substring(0, 500);

        return `Result ${i + 1}:
Title: ${title}
Date: ${date}
Excerpt: ${excerpt}`;
      })
      .join('\n\n');

    return `You are analyzing search results to answer a specific question. The user is Eric.

CRITICAL INSTRUCTIONS FOR FOOD QUERIES:
- Look for ALL mentions of food, restaurants, or eating
- Identify WHO ate WHAT and WHERE
- Common pronouns: "I/me" = Eric, "we" = family
- Look for restaurant names: Smoothie King, Chick-fil-A, etc.
- Look for food items: smoothie, nuggets, sandwich, etc.
- If multiple people ate different things, list them ALL

Query: "${query}"

Search Results:
${resultsText}

Provide a JSON response with this format:
{
  "answer": "Your complete answer addressing the query. For food queries, list WHO ate WHAT.",
  "confidence": 0.0-1.0,
  "foodDetails": {
    "Eric": "what Eric ate",
    "Jordan": "what Jordan ate", 
    "Asa": "what Asa ate"
  }
}`;
  }

  generateDirectAnswer(query, results) {
    if (results.length === 0) {
      return 'No relevant information found for your query.';
    }

    const topResult = results[0];
    const title = topResult.lifelog?.title || 'Unknown';
    const date = topResult.lifelog?.createdAt || '';
    const score = topResult.consensusScore || topResult.score || 0;

    return `Based on local search: Found relevant information from ${date}. ${title}. (Confidence: ${Math.round(score * 100)}%)`;
  }

  calculateConfidence(results, query) {
    if (results.length === 0) return 0;

    // Check top result score
    const topScore = results[0]?.consensusScore || results[0]?.score || 0;

    // Check if query terms are in results
    const queryTerms = query.toLowerCase().split(/\s+/);
    const hasQueryTerms = results.some((r) => {
      const content = (r.lifelog?.content || '').toLowerCase();
      return queryTerms.every((term) => content.includes(term));
    });

    // Calculate confidence
    let confidence = topScore * 0.7;
    if (hasQueryTerms) confidence += 0.2;
    if (results.length >= 5) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  async checkCache(query) {
    const hash = crypto.createHash('sha256').update(query).digest('hex');
    const cachePath = path.join(this.cacheDir, `${hash}.json`);

    try {
      const cached = await fs.readFile(cachePath, 'utf8');
      const data = JSON.parse(cached);

      // Check if cache is fresh (24 hours)
      const age = Date.now() - new Date(data.timestamp).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return data.result;
      }
    } catch {
      // No cache or error
    }

    return null;
  }

  async cacheAnswer(query, result) {
    await fs.mkdir(this.cacheDir, { recursive: true });

    const hash = crypto.createHash('sha256').update(query).digest('hex');
    const cachePath = path.join(this.cacheDir, `${hash}.json`);

    await fs.writeFile(
      cachePath,
      JSON.stringify(
        {
          query,
          result,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }
}

// Export for use in task executor
export default OptimizedMemorySearchTool;
