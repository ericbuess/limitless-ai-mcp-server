#!/usr/bin/env node

/**
 * Iterative Memory Search Tool
 * Combines UnifiedSearchHandler with iterative refinement until confidence >= 90%
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
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

  async initialize() {
    await this.searchHandler.initialize();
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.searchHistoryDir, { recursive: true });
    logger.info('IterativeMemorySearchTool initialized');
  }

  async search(query, context = {}) {
    // Handle follow-up questions by expanding query with context
    let expandedQuery = query;
    if (context.isFollowUp && context.previousQueries && context.previousQueries.length > 0) {
      const lastQuery = context.previousQueries[context.previousQueries.length - 1];
      // If query references "him", "her", "it", "that", etc., expand with context
      if (/\b(him|her|it|that|they|them|this|the same)\b/i.test(query)) {
        expandedQuery = `${query} (context: previous query was about "${lastQuery.query}" with answer mentioning: ${lastQuery.answer?.slice(0, 100)}...)`;
        logger.info('Expanded follow-up query with context', {
          originalQuery: query,
          expandedQuery,
        });
      }
    }

    const queryHash = this.hashQuery(expandedQuery);
    logger.info('Starting iterative memory search', {
      query,
      expandedQuery,
      queryHash,
      confidenceThreshold: this.config.tasks.memory_search.confidenceThreshold,
      isFollowUp: context.isFollowUp || false,
    });

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
      let iteration = 0;
      let confidence = 0;
      let finalAnswer = null;
      let allSearchResults = [];
      let searchQueries = [expandedQuery]; // Start with expanded query (same as original if not follow-up)

      // Iterative search until confidence threshold is met
      while (
        iteration < this.config.tasks.memory_search.maxIterations &&
        confidence < this.config.tasks.memory_search.confidenceThreshold
      ) {
        iteration++;
        logger.info(
          `Starting iteration ${iteration}/${this.config.tasks.memory_search.maxIterations}`,
          {
            currentConfidence: confidence,
            targetConfidence: this.config.tasks.memory_search.confidenceThreshold,
          }
        );

        // Step 1: Search with current queries
        const iterationResults = [];
        for (const searchQuery of searchQueries) {
          logger.info(`Searching with query: "${searchQuery}"`);
          const searchResults = await this.searchHandler.search(searchQuery);

          // Save condensed search results for this query
          const condensedResults = {
            query: searchQuery,
            resultCount: searchResults.results?.length || 0,
            topResults: searchResults.results?.slice(0, 5).map((r) => ({
              id: r.lifelog?.id,
              date: r.lifelog?.createdAt,
              title: r.lifelog?.title,
              score: r.score,
              highlights: r.highlights?.slice(0, 2),
            })),
          };
          await fs.writeFile(
            path.join(
              sessionDir,
              `search-results-${iteration}-${searchQueries.indexOf(searchQuery)}.json`
            ),
            JSON.stringify(condensedResults, null, 2)
          );

          if (searchResults.results && searchResults.results.length > 0) {
            iterationResults.push(...searchResults.results);
          }
        }

        // Deduplicate results by ID
        const uniqueResults = this.deduplicateResults([...allSearchResults, ...iterationResults]);
        allSearchResults = uniqueResults;

        logger.info(
          `Iteration ${iteration} found ${iterationResults.length} new results, ${uniqueResults.length} total unique`
        );

        // Step 2: Generate answer and assess confidence
        if (uniqueResults.length === 0) {
          // No results found, can't improve confidence
          break;
        }

        const assessment = await this.assessResults(
          expandedQuery,
          uniqueResults,
          sessionDir,
          iteration
        );
        confidence = assessment.confidence;

        logger.info(`Iteration ${iteration} assessment`, {
          confidence: assessment.confidence,
          hasCompleteAnswer: assessment.hasCompleteAnswer,
          needsRefinement: assessment.needsRefinement,
        });

        if (assessment.hasCompleteAnswer) {
          finalAnswer = assessment.answer;
          break;
        }

        // Step 3: Generate refined search queries if needed
        if (
          assessment.needsRefinement &&
          iteration < this.config.tasks.memory_search.maxIterations
        ) {
          searchQueries = await this.generateRefinedQueries(
            query,
            assessment.refinementHints,
            uniqueResults,
            sessionDir,
            iteration
          );
          logger.info(`Generated ${searchQueries.length} refined queries for next iteration`);
        }
      }

      // Generate final answer if we don't have one yet
      if (!finalAnswer && allSearchResults.length > 0) {
        logger.info('Generating final answer from all results');
        const finalAssessment = await this.generateFinalAnswer(query, allSearchResults, sessionDir);
        finalAnswer = finalAssessment.answer;
        confidence = finalAssessment.confidence;
      } else if (!finalAnswer) {
        finalAnswer = "I couldn't find any information about that in your lifelogs.";
        confidence = 1.0; // We're confident there's no information
      }

      const result = {
        sessionId,
        query,
        answer: this.cleanAnswer(finalAnswer),
        confidence,
        iterations: iteration,
        resultCount: allSearchResults.length,
      };

      await this.saveResults(sessionDir, result);

      // Cache if confidence is high enough
      if (this.config.tasks.memory_search.cacheAnswers && confidence >= 0.7) {
        await this.cacheAnswer(queryHash, result);
      }

      return result;
    } catch (error) {
      logger.error('Iterative search failed', { error: error.message, sessionId });
      throw error;
    }
  }

  deduplicateResults(results) {
    const seen = new Set();
    return results.filter((r) => {
      const id = r.lifelog?.id || r.file || JSON.stringify(r);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  async assessResults(query, results, sessionDir, iteration) {
    const relevantResults = results.slice(0, 10);
    const prompt = this.buildAssessmentPrompt(query, relevantResults);

    logger.info('Assessing results with Claude');
    const response = await this.claudeInvoker.invoke(prompt, {
      sessionDir,
      iterationNum: iteration,
      iterationName: 'assessment',
      outputFormat: 'json',
      maxTurns: 1,
    });

    try {
      let resultText = response.result || response.content || '{}';

      // Handle escaped JSON (when Claude returns it with backslashes)
      if (resultText.includes('\\n') || resultText.includes('\\"')) {
        resultText = JSON.parse('"' + resultText + '"'); // Unescape the string
      }

      const parsed = JSON.parse(resultText);
      return {
        confidence: parsed.confidence || 0.5,
        hasCompleteAnswer: parsed.hasCompleteAnswer || false,
        answer: parsed.answer || null,
        needsRefinement: parsed.needsRefinement !== false,
        refinementHints: parsed.refinementHints || [],
      };
    } catch (e) {
      logger.error('Failed to parse assessment', { error: e.message });
      return {
        confidence: 0.5,
        hasCompleteAnswer: false,
        answer: null,
        needsRefinement: true,
        refinementHints: [],
      };
    }
  }

  buildAssessmentPrompt(query, results) {
    const resultsText = results
      .map((r, i) => {
        const date = r.lifelog?.createdAt
          ? new Date(r.lifelog.createdAt).toLocaleDateString()
          : 'Unknown date';

        // Extract only relevant portions around highlights
        let content;
        if (r.highlights && r.highlights.length > 0) {
          // Use highlights which are already focused on relevant parts
          // Each highlight has ~100 chars of context, so 3 highlights = ~300 chars
          content = r.highlights.slice(0, 3).join(' ... ');
        } else {
          // Fallback to first 400 chars if no highlights to give more context
          content = (r.lifelog?.content || '').slice(0, 400);
        }

        return `
Result ${i + 1}:
Date: ${date}
Title: ${r.lifelog?.title || 'Untitled'}
Relevant excerpt: ${content}
Score: ${r.score || 0}`;
      })
      .join('\n---\n');

    return `Assess whether these search results contain a complete answer to: "${query}"

Search Results:
${resultsText}

Instructions:
1. Determine if the results contain enough information to fully answer the question
2. Assess your confidence level (0.0-1.0) in the completeness of the answer
3. If confidence >= 0.9, provide the complete answer
4. If confidence < 0.9, suggest what additional information to search for

Respond with JSON:
{
  "confidence": 0.0-1.0,
  "hasCompleteAnswer": true/false,
  "answer": "Your complete answer if confidence >= 0.9, otherwise null",
  "needsRefinement": true/false,
  "refinementHints": ["what to search for next", "alternative keywords"]
}`;
  }

  async generateRefinedQueries(query, hints, currentResults, sessionDir, iteration) {
    const prompt = `Generate refined search queries based on:

Original query: "${query}"

Current findings summary:
${currentResults
  .slice(0, 5)
  .map((r) => `- ${r.lifelog?.title || 'Untitled'}: ${(r.lifelog?.content || '').slice(0, 100)}...`)
  .join('\n')}

Refinement hints:
${hints.join('\n')}

Generate 2-3 alternative search queries that might find missing information.
Consider:
- Related terms and synonyms
- Different time periods mentioned in results
- Names or topics mentioned in partial results
- More specific or more general versions of the query

Respond with JSON:
{
  "queries": ["query1", "query2", "query3"]
}`;

    try {
      const response = await this.claudeInvoker.invoke(prompt, {
        sessionDir,
        iterationNum: iteration,
        iterationName: 'refinement',
        outputFormat: 'json',
        maxTurns: 1,
      });

      let resultText = response.result || response.content || '{}';

      // Handle escaped JSON
      if (resultText.includes('\\n') || resultText.includes('\\"')) {
        resultText = JSON.parse('"' + resultText + '"');
      }

      const parsed = JSON.parse(resultText);
      return parsed.queries || [query]; // Fallback to original query
    } catch (e) {
      logger.error('Failed to generate refined queries', { error: e.message });
      return [query]; // Fallback to original query
    }
  }

  async generateFinalAnswer(query, results, sessionDir) {
    const relevantResults = results.slice(0, 10); // Reduced from 15
    const prompt = `Generate a comprehensive answer to: "${query}"

Based on ALL these search results:
${relevantResults
  .map((r, i) => {
    const date = r.lifelog?.createdAt
      ? new Date(r.lifelog.createdAt).toLocaleString()
      : 'Unknown date';

    // Use highlights or limited content
    let content;
    if (r.highlights && r.highlights.length > 0) {
      content = r.highlights.slice(0, 2).join(' ... ');
    } else {
      content = (r.lifelog?.content || '').slice(0, 200);
    }

    return `
Result ${i + 1}:
Date: ${date}
Title: ${r.lifelog?.title || 'Untitled'}
Relevant content: ${content}`;
  })
  .join('\n---\n')}

Instructions:
1. Synthesize all available information into a complete answer
2. Be specific and reference dates/details when relevant
3. Acknowledge any gaps or uncertainties
4. Assess your confidence in the answer (0.0-1.0)

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

      let resultText = response.result || response.content || '{}';

      // Handle escaped JSON
      if (resultText.includes('\\n') || resultText.includes('\\"')) {
        resultText = JSON.parse('"' + resultText + '"');
      }

      const parsed = JSON.parse(resultText);
      return {
        answer: parsed.answer || "I found information but couldn't generate a proper answer.",
        confidence: parsed.confidence || 0.6,
      };
    } catch (e) {
      logger.error('Failed to generate final answer', { error: e.message });
      return {
        answer: `I found ${results.length} relevant results about your query but encountered an error generating a summary.`,
        confidence: 0.5,
      };
    }
  }

  hashQuery(query) {
    return createHash('sha256').update(query.toLowerCase().trim()).digest('hex').substring(0, 16);
  }

  cleanAnswer(answer) {
    // Remove embedded JSON formatting from answers
    if (typeof answer !== 'string') return answer;

    // Check if answer contains markdown code blocks with JSON
    const jsonBlockMatch = answer.match(
      /```json\s*\n\{[\s\S]*?"answer"\s*:\s*"([^"]+)"[\s\S]*?\}\s*\n```/
    );
    if (jsonBlockMatch) {
      return jsonBlockMatch[1];
    }

    // Check if answer is raw JSON
    try {
      const parsed = JSON.parse(answer);
      if (parsed.answer) {
        return parsed.answer;
      }
    } catch (e) {
      // Not JSON, return as is
    }

    return answer;
  }

  async getCachedAnswer(queryHash) {
    try {
      const cachePath = path.join(this.cacheDir, `${queryHash}.json`);
      const content = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(content);

      // Check cache age (24 hours)
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        // Clean answer before returning
        return {
          ...cached.result,
          answer: this.cleanAnswer(cached.result.answer),
        };
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
export default IterativeMemorySearchTool;

// Test function
async function testIterativeSearch() {
  // Load config
  const configPath = './config/assistant.json';
  const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

  const tool = new IterativeMemorySearchTool(config);
  await tool.initialize();

  console.log('🧪 Testing Iterative Memory Search Tool\n');
  console.log('📋 Features:');
  console.log('   - Uses UnifiedSearchHandler for fast local search');
  console.log('   - Iteratively refines search until confidence >= 90%');
  console.log('   - Maximum 3 iterations as configured');
  console.log('   - Generates refined queries based on partial results\n');

  const query = process.argv[2] || 'what did I have for lunch yesterday?';
  console.log(`🔍 Searching for: "${query}"...\n`);

  try {
    const result = await tool.search(query, {
      triggerContext: `Hey Claudius, ${query}`,
    });

    console.log('\n✅ Search completed!\n');
    console.log('📊 Results:');
    console.log('─'.repeat(60));
    console.log(`Answer: ${result.answer}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Results found: ${result.resultCount}`);
    console.log(`Session ID: ${result.sessionId}`);
    console.log('─'.repeat(60));

    if (result.confidence < 0.9) {
      console.log(
        `\n⚠️  Note: Confidence ${(result.confidence * 100).toFixed(0)}% is below the 90% threshold`
      );
    }
  } catch (error) {
    console.error('❌ Search failed:', error.message);
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testIterativeSearch().catch(console.error);
}
