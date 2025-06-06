#!/usr/bin/env node

/**
 * Enhanced Iterative Memory Search Tool
 *
 * Key improvements:
 * 1. Local strategies iterate and refine results BEFORE Claude assessment
 * 2. Vector DB results get more weight and iterations
 * 3. Consensus building between strategies before Claude
 * 4. Only passes high-quality, refined results to Claude
 * 5. Up to 5 local iterations before Claude sees anything
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { UnifiedSearchHandler } from '../dist/search/unified-search.js';
import { FileManager } from '../dist/storage/file-manager.js';
import { ClaudeInvoker } from '../dist/utils/claude-invoker.js';
import { logger } from '../dist/utils/logger.js';

export class IterativeMemorySearchTool {
  constructor(config = {}) {
    this.config = {
      trigger: config.trigger || { keyword: 'Claudius' },
      tasks: {
        memory_search: {
          cacheAnswers: true,
          confidenceThreshold: 0.9,
          maxIterations: 3,
          maxLocalIterations: 5, // New: max iterations before Claude
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
      timeout: config.claude?.timeout || 300000, // Use config timeout or 5 minutes default
    });
  }

  async initialize() {
    await this.searchHandler.initialize();
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.searchHistoryDir, { recursive: true });
  }

  async execute(task) {
    const query = task.trigger?.assessment?.extractedRequest || task.trigger?.text;
    if (!query) {
      throw new Error('No query found in task');
    }

    const expandedQuery = task.expandedQuery || query;
    const result = await this.search(expandedQuery, {
      previousSession: task.previousSession,
      lifelogId: task.lifelog?.id,
      expandedQuery,
    });

    return result;
  }

  async search(query, options = {}) {
    const sessionId = `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const dateDir = new Date().toISOString().split('T')[0];
    const sessionDir = path.join(this.searchHistoryDir, dateDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    // Save original query
    await fs.writeFile(path.join(sessionDir, 'query.txt'), query);

    const context = {
      originalQuery: query,
      sessionId,
      followUp: options.previousSession ? true : false,
      previousSession: options.previousSession,
    };
    await fs.writeFile(path.join(sessionDir, 'context.json'), JSON.stringify(context, null, 2));

    logger.info('Created enhanced search session', { sessionId, query });

    try {
      // Phase 1: Local Strategy Iterations (Fast, no Claude)
      const localResults = await this.performLocalIterations(query, sessionDir);

      if (localResults.confidence >= 0.8) {
        // High confidence from local search alone
        logger.info('Local search achieved high confidence', {
          confidence: localResults.confidence,
        });
        return {
          sessionId,
          query,
          answer: localResults.answer,
          confidence: localResults.confidence,
          iterations: localResults.iterations,
          resultCount: localResults.resultCount,
          source: 'local-consensus',
        };
      }

      // Phase 2: Claude Assessment with ability to request more searches
      const claudeEnhanced = await this.performClaudeIterations(query, localResults, sessionDir);

      const finalResult = {
        sessionId,
        query,
        answer: claudeEnhanced.answer || localResults.answer,
        confidence: Math.max(claudeEnhanced.confidence, localResults.confidence),
        iterations: localResults.iterations + claudeEnhanced.iterations,
        resultCount: claudeEnhanced.totalResults || localResults.resultCount,
        source: claudeEnhanced.answer ? 'claude-enhanced' : 'local-consensus',
      };

      await this.saveResults(sessionDir, finalResult);
      return finalResult;
    } catch (error) {
      logger.error('Enhanced search failed', { error: error.message, sessionId });
      throw error;
    }
  }

  async performLocalIterations(query, sessionDir) {
    const maxLocalIterations = this.config.tasks.memory_search.maxLocalIterations || 5;
    let iteration = 0;
    let bestResults = [];
    let allUniqueResults = new Map(); // id -> result
    let confidence = 0;

    // Track strategy performance
    const strategyScores = {
      'fast-keyword': [],
      'vector-semantic': [],
      'smart-date': [],
    };

    while (iteration < maxLocalIterations && confidence < 0.8) {
      iteration++;
      logger.info(`Local iteration ${iteration}/${maxLocalIterations}`);

      // Generate query variations for this iteration
      const queryVariations = this.generateSmartVariations(query, bestResults, iteration);

      // Run parallel search with all strategies
      const iterationResults = [];
      for (const queryVar of queryVariations) {
        const searchResult = await this.searchHandler.search(queryVar, {
          strategy: 'parallel',
          limit: 30,
          enableQueryExpansion: false, // We're doing our own expansion
        });

        if (searchResult.results) {
          iterationResults.push(...searchResult.results);

          // Track which strategies contributed
          if (searchResult.contextInsights) {
            this.updateStrategyScores(strategyScores, searchResult);
          }
        }
      }

      // Deduplicate and score results
      const newResults = this.deduplicateAndScore(iterationResults, allUniqueResults);

      // Build consensus from strategies
      const consensusResults = this.buildConsensus(
        Array.from(allUniqueResults.values()),
        strategyScores
      );

      // Save iteration results
      await fs.writeFile(
        path.join(sessionDir, `local-iteration-${iteration}.json`),
        JSON.stringify(
          {
            queryVariations,
            newResultsCount: newResults.length,
            totalUniqueResults: allUniqueResults.size,
            topResults: consensusResults.slice(0, 10).map((r) => ({
              id: r.lifelog?.id,
              title: r.lifelog?.title,
              score: r.consensusScore,
              strategies: Array.from(r.strategies || []),
            })),
            strategyScores,
          },
          null,
          2
        )
      );

      // Update best results based on consensus
      bestResults = consensusResults.slice(0, 20);

      // Calculate confidence based on result quality
      confidence = this.calculateLocalConfidence(bestResults, query);

      logger.info(`Local iteration ${iteration} complete`, {
        newResults: newResults.length,
        totalUnique: allUniqueResults.size,
        confidence,
        topScore: bestResults[0]?.consensusScore || 0,
      });

      // Early termination conditions
      if (newResults.length === 0 && iteration > 2) {
        logger.info('No new results found, terminating local search');
        break;
      }

      if (bestResults.length >= 10 && bestResults[0].consensusScore > 0.8) {
        logger.info('High quality results found, terminating local search');
        break;
      }

      // Also terminate if we have good keyword matches with reasonable scores
      if (
        bestResults.length >= 5 &&
        bestResults[0].consensusScore > 0.7 &&
        bestResults[0].strategies?.has('fast-keyword')
      ) {
        logger.info('Good keyword matches found, terminating local search');
        break;
      }
    }

    // Generate local answer from consensus
    const localAnswer = this.generateLocalAnswer(query, bestResults);

    return {
      refinedResults: bestResults,
      allResults: Array.from(allUniqueResults.values()),
      iterations: iteration,
      resultCount: allUniqueResults.size,
      confidence,
      answer: localAnswer,
    };
  }

  generateSmartVariations(query, previousResults, iteration) {
    const variations = [query];

    if (iteration === 1) {
      // Initial variations - break down the query
      const words = query.toLowerCase().split(/\s+/);

      // Try important keywords only
      const keywords = words.filter(
        (w) => w.length > 3 && !['what', 'where', 'when', 'how', 'did', 'the', 'this'].includes(w)
      );
      if (keywords.length > 0) {
        variations.push(keywords.join(' '));
      }

      // Try temporal focus
      const temporal = words.filter((w) =>
        ['today', 'yesterday', 'afternoon', 'morning', 'evening', 'night'].includes(w)
      );
      if (temporal.length > 0) {
        variations.push(temporal.join(' '));
      }
    } else if (previousResults.length > 0) {
      // Extract concepts from top results
      const concepts = new Set();
      const dates = new Set();

      previousResults.slice(0, 5).forEach((r) => {
        // Extract key terms from titles
        if (r.lifelog?.title) {
          const titleWords = r.lifelog.title
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3);
          titleWords.forEach((w) => concepts.add(w));
        }

        // Extract dates
        if (r.lifelog?.createdAt) {
          const date = new Date(r.lifelog.createdAt);
          dates.add(date.toLocaleDateString());
        }
      });

      // Create focused variations
      if (concepts.size > 0) {
        const conceptArray = Array.from(concepts).slice(0, 3);
        variations.push(conceptArray.join(' '));
      }

      if (dates.size > 0) {
        const dateArray = Array.from(dates);
        variations.push(`${query} ${dateArray[0]}`);
      }
    }

    return variations.slice(0, 3); // Max 3 variations per iteration
  }

  deduplicateAndScore(newResults, allResults) {
    const added = [];

    newResults.forEach((result) => {
      const id = result.lifelog?.id || result.file || JSON.stringify(result);

      if (allResults.has(id)) {
        // Update existing result with better score/metadata
        const existing = allResults.get(id);
        existing.occurrences = (existing.occurrences || 1) + 1;
        existing.scores = existing.scores || [];
        existing.scores.push(result.score);
        existing.strategies = existing.strategies || new Set();
        if (result.metadata?.source) {
          existing.strategies.add(result.metadata.source);
        }
      } else {
        // New result
        result.occurrences = 1;
        result.scores = [result.score];
        result.strategies = new Set();
        if (result.metadata?.source) {
          result.strategies.add(result.metadata.source);
        }
        allResults.set(id, result);
        added.push(result);
      }
    });

    return added;
  }

  buildConsensus(allResults, strategyScores) {
    // Calculate consensus scores based on multiple factors
    return allResults
      .map((result) => {
        const avgScore = result.scores.reduce((a, b) => a + b, 0) / result.scores.length;
        const maxScore = Math.max(...result.scores);
        const occurrenceBoost = Math.min(result.occurrences * 0.1, 0.3);

        // Strategy-specific weighting - PRIORITIZE KEYWORD MATCHES
        let strategyWeight = 0;
        if (result.strategies.has('fast-keyword')) {
          strategyWeight += 0.5; // Significantly boost keyword matches
        }
        if (result.strategies.has('vector-semantic')) {
          strategyWeight += 0.15; // Vector still valuable but not dominant
        }
        if (result.strategies.has('smart-date')) {
          strategyWeight += 0.1; // Date matches are good signals
        }

        // Bonus for multiple strategy agreement
        const multiStrategyBonus = result.strategies.size >= 2 ? 0.15 : 0;

        // Penalty if NO keyword match but found by other strategies
        const keywordPenalty =
          !result.strategies.has('fast-keyword') && result.strategies.size > 0 ? -0.2 : 0;

        // Consensus score formula - rebalanced to prioritize keywords
        result.consensusScore =
          avgScore * 0.2 + // Reduced weight for average
          maxScore * 0.25 + // Reduced weight for max
          occurrenceBoost +
          strategyWeight +
          multiStrategyBonus +
          keywordPenalty; // New penalty for non-keyword matches

        // Ensure score stays in valid range
        result.consensusScore = Math.max(0, Math.min(1, result.consensusScore));

        return result;
      })
      .sort((a, b) => b.consensusScore - a.consensusScore);
  }

  calculateLocalConfidence(results, query) {
    if (results.length === 0) return 0;

    const topScore = results[0].consensusScore;
    const hasMultipleStrategies = results[0].strategies.size >= 2;
    const hasVectorMatch = results[0].strategies.has('vector-semantic');
    const hasKeywordMatch = results[0].strategies.has('fast-keyword');

    // Base confidence on top score (adjusted for better scaling)
    let confidence = topScore * 0.7;

    // Strategy bonuses
    if (hasMultipleStrategies) confidence += 0.15;
    if (hasKeywordMatch && hasVectorMatch) confidence += 0.1; // Both keyword AND vector
    if (results.length >= 5) confidence += 0.05;

    // Cap at 0.95 to leave room for Claude enhancement
    return Math.min(confidence, 0.95);
  }

  generateLocalAnswer(query, results) {
    if (results.length === 0) {
      return "I couldn't find any information about that in your lifelogs.";
    }

    // Simple answer generation based on top results
    const topResult = results[0];
    const date = topResult.lifelog?.createdAt
      ? new Date(topResult.lifelog.createdAt).toLocaleString()
      : 'Unknown date';

    return (
      `Based on local search: Found relevant information from ${date}. ` +
      `${topResult.lifelog?.title || 'Untitled recording'}. ` +
      `(Confidence: ${(topResult.consensusScore * 100).toFixed(0)}%)`
    );
  }

  updateStrategyScores(scores, searchResult) {
    if (!searchResult.strategyTimings) return;

    Object.entries(searchResult.strategyTimings).forEach(([strategy, timing]) => {
      if (scores[strategy]) {
        scores[strategy].push({
          time: timing,
          results: searchResult.results?.filter((r) => r.metadata?.source === strategy).length || 0,
        });
      }
    });
  }

  async performClaudeIterations(query, localResults, sessionDir) {
    let claudeIterations = 0;
    const maxClaudeIterations = 3;
    let currentResults = localResults.refinedResults;
    let allResultsMap = new Map();

    // Initialize with local results
    localResults.allResults.forEach((r) => {
      const id = r.lifelog?.id || r.file;
      if (id) allResultsMap.set(id, r);
    });

    let finalAnswer = null;
    let confidence = localResults.confidence;

    while (claudeIterations < maxClaudeIterations && confidence < 0.8) {
      claudeIterations++;
      logger.info(`Claude iteration ${claudeIterations}/${maxClaudeIterations}`);

      // Ask Claude to assess and potentially request more searches
      const assessment = await this.assessWithClaude(
        query,
        currentResults,
        sessionDir,
        localResults.iterations + claudeIterations
      );

      confidence = assessment.confidence;

      if (assessment.hasCompleteAnswer) {
        finalAnswer = assessment.answer;
        break;
      }

      if (assessment.refinementQueries && assessment.refinementQueries.length > 0) {
        // Claude wants more specific searches
        logger.info('Claude requested refined searches', {
          queries: assessment.refinementQueries,
        });

        // Run the refined searches
        const refinedResults = [];
        for (const refinedQuery of assessment.refinementQueries) {
          const searchResult = await this.searchHandler.search(refinedQuery, {
            strategy: 'parallel',
            limit: 20,
          });

          if (searchResult.results) {
            refinedResults.push(...searchResult.results);
          }
        }

        // Deduplicate and add to all results
        const newResults = this.deduplicateAndScore(refinedResults, allResultsMap);

        // Rebuild consensus with all results
        currentResults = this.buildConsensus(Array.from(allResultsMap.values()), {}).slice(0, 20);

        logger.info('Refined search complete', {
          newResults: newResults.length,
          totalResults: allResultsMap.size,
        });
      } else {
        // Claude doesn't need more searches
        break;
      }
    }

    if (!finalAnswer && currentResults.length > 0) {
      // Generate final answer with all results
      const finalAssessment = await this.generateFinalAnswer(query, currentResults, sessionDir);
      finalAnswer = finalAssessment.answer;
      confidence = finalAssessment.confidence;
    }

    return {
      answer: finalAnswer,
      confidence,
      iterations: claudeIterations,
      totalResults: allResultsMap.size,
    };
  }

  async assessWithClaude(query, results, sessionDir, iteration) {
    const prompt = this.buildAssessmentPrompt(query, results);

    logger.info('Assessing results with Claude');

    try {
      const response = await this.claudeInvoker.invoke(prompt, {
        sessionDir,
        iterationNum: iteration,
        iterationName: 'assessment',
        outputFormat: 'json',
        maxTurns: 1,
      });

      return this.parseClaudeResponse(response);
    } catch (error) {
      logger.error('Claude assessment failed', { error: error.message });
      return {
        confidence: 0.5,
        hasCompleteAnswer: false,
        needsRefinement: true,
        refinementQueries: [],
      };
    }
  }

  buildAssessmentPrompt(query, results) {
    const resultsText = results
      .slice(0, 10)
      .map((r, i) => {
        const date = r.lifelog?.createdAt
          ? new Date(r.lifelog.createdAt).toLocaleString()
          : 'Unknown date';

        const content = r.highlights?.join(' ... ') || (r.lifelog?.content || '').slice(0, 300);

        return `
Result ${i + 1} (Consensus Score: ${(r.consensusScore * 100).toFixed(0)}%):
Date: ${date}
Title: ${r.lifelog?.title || 'Untitled'}
Found by: ${Array.from(r.strategies || []).join(', ')}
Content: ${content}`;
      })
      .join('\n---\n');

    return `You are analyzing refined search results that have already been filtered and ranked by multiple search strategies.

User Query: "${query}"

Top Consensus Results:
${resultsText}

These results were found by local search strategies (keyword, vector similarity, temporal matching) and represent the best matches after ${results[0]?.occurrences || 1} search iterations.

Instructions:
1. Assess if these results contain enough information to answer the query
2. If you need more specific information, suggest 1-3 refined search queries
3. If you have enough information, provide a complete answer

Respond with JSON:
{
  "confidence": 0.0-1.0,
  "hasCompleteAnswer": true/false,
  "answer": "Your complete answer if confidence >= 0.9, otherwise null",
  "needsRefinement": true/false,
  "refinementQueries": ["specific search query 1", "specific search query 2"] // Only if needed
}`;
  }

  async generateFinalAnswer(query, results, sessionDir) {
    const prompt = `Generate a comprehensive answer to: "${query}"

Based on these top results:
${results
  .slice(0, 10)
  .map((r, i) => {
    const date = r.lifelog?.createdAt
      ? new Date(r.lifelog.createdAt).toLocaleString()
      : 'Unknown date';

    const content = r.highlights?.join(' ... ') || (r.lifelog?.content || '').slice(0, 300);

    return `
Result ${i + 1}:
Date: ${date}
Title: ${r.lifelog?.title || 'Untitled'}
Content: ${content}`;
  })
  .join('\n---\n')}

Instructions:
1. Synthesize all available information into a complete answer
2. Be specific and reference dates/details when relevant
3. Acknowledge any gaps or uncertainties

Respond with JSON:
{
  "answer": "Your comprehensive answer here",
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.claudeInvoker.invoke(prompt, {
        sessionDir,
        iterationNum: 999,
        iterationName: 'final-answer',
        outputFormat: 'json',
        maxTurns: 1,
      });

      return this.parseClaudeResponse(response);
    } catch (error) {
      logger.error('Failed to generate final answer', { error: error.message });
      return {
        answer: "I found some results but couldn't generate a complete answer.",
        confidence: 0.5,
      };
    }
  }

  parseClaudeResponse(response) {
    try {
      let resultText = response.result || response.content || '{}';

      if (typeof resultText === 'string' && resultText.includes('\\n')) {
        resultText = JSON.parse('"' + resultText + '"');
      }

      const parsed = JSON.parse(resultText);
      return {
        confidence: parsed.confidence || 0.5,
        hasCompleteAnswer: parsed.hasCompleteAnswer || false,
        answer: parsed.answer || null,
        needsRefinement: parsed.needsRefinement !== false,
        refinementQueries: parsed.refinementQueries || [],
      };
    } catch (e) {
      logger.error('Failed to parse Claude response', { error: e.message });

      // Try to extract answer from non-JSON response
      if (response.result && typeof response.result === 'string') {
        return {
          answer: response.result,
          confidence: 0.5,
          hasCompleteAnswer: true,
          needsRefinement: false,
          refinementQueries: [],
        };
      }

      return {
        confidence: 0.5,
        hasCompleteAnswer: false,
        needsRefinement: true,
        refinementQueries: [],
      };
    }
  }

  async saveResults(sessionDir, result) {
    await fs.writeFile(path.join(sessionDir, 'results.json'), JSON.stringify(result, null, 2));
  }

  // Keep these methods for compatibility
  cleanAnswer(answer) {
    if (!answer) return answer;
    return answer
      .replace(/^Based on .+?: /, '')
      .replace(/\(Confidence: \d+%\)$/, '')
      .trim();
  }

  generateAutomaticVariations(query) {
    const queryLower = query.toLowerCase();
    const variations = [];

    // Extract key terms
    const words = queryLower.split(/\s+/).filter((w) => w.length > 2);

    // Single word queries for important terms
    const importantWords = words.filter(
      (w) => !['the', 'what', 'when', 'where', 'who', 'how', 'did', 'was', 'were'].includes(w)
    );
    variations.push(...importantWords.slice(0, 2));

    // Try word pairs
    if (words.length >= 2) {
      for (let i = 0; i < words.length - 1; i++) {
        variations.push(`${words[i]} ${words[i + 1]}`);
      }
    }

    return variations.slice(0, 3);
  }

  async checkCache(queryHash) {
    const cacheFile = path.join(this.cacheDir, `${queryHash}.json`);
    try {
      const cached = await fs.readFile(cacheFile, 'utf-8');
      return JSON.parse(cached);
    } catch (error) {
      return null;
    }
  }

  async cacheAnswer(queryHash, result) {
    const cacheFile = path.join(this.cacheDir, `${queryHash}.json`);
    await fs.writeFile(cacheFile, JSON.stringify(result, null, 2));
  }
}

// Export as default for backwards compatibility
export default IterativeMemorySearchTool;
