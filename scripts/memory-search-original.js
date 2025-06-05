import { ClaudeInvoker } from '../dist/utils/claude-invoker.js';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../dist/utils/logger.js';

export class MemorySearchTool {
  constructor(config) {
    this.config = config;
    this.claudeInvoker = new ClaudeInvoker();
    this.answersDir = './data/answers';
  }

  async execute(task) {
    const query = this.extractQuery(task);
    const queryHash = this.hashQuery(query);

    logger.info('Starting memory search', {
      query,
      queryHash,
      triggerContext: task.trigger.text.substring(0, 100) + '...',
    });

    // Check cache first
    if (this.config.tasks.memory_search.cacheAnswers) {
      const cached = await this.getCachedAnswer(queryHash);
      if (cached) {
        logger.info('Returning cached answer', { queryHash });
        return cached;
      }
    }

    // Create search session
    const { sessionId, sessionDir } = await this.claudeInvoker.createSession(query, {
      triggerContext: task.trigger.text,
      lifelogDate: task.lifelog.date,
      taskId: task.id,
      extractedRequest: task.trigger.assessment?.extractedRequest,
    });

    logger.info('Created search session', { sessionId });

    // Execute iterative search
    let iteration = 0;
    let confidence = 0;
    let finalAnswer = null;
    let searchResults = [];
    let needsRefinement = true;

    while (
      iteration < this.config.tasks.memory_search.maxIterations &&
      confidence < this.config.tasks.memory_search.confidenceThreshold &&
      needsRefinement
    ) {
      iteration++;
      logger.info(`Starting search iteration ${iteration}`);

      const prompt = this.buildSearchPrompt(query, iteration, searchResults);

      try {
        const response = await this.claudeInvoker.invoke(prompt, {
          sessionDir,
          iterationNum: iteration,
          iterationName: iteration === 1 ? 'initial' : 'refined',
          maxTurns: 5,
          allowedTools: ['Read', 'Bash', 'Grep', 'LS'],
          outputFormat: 'text', // Claude CLI returns text, we'll parse JSON from it
        });

        const result = this.parseSearchResponse(response);

        logger.info(`Iteration ${iteration} results`, {
          resultsFound: result.results.length,
          hasAnswer: result.hasAnswer,
          confidence: result.confidence,
          needsRefinement: result.needsRefinement,
        });

        // Accumulate results
        searchResults.push(...result.results);
        confidence = result.confidence;
        needsRefinement = result.needsRefinement || false;

        if (result.hasAnswer) {
          finalAnswer = result.answer;
          logger.info('Answer found!', { confidence: result.confidence });
          break;
        }
      } catch (error) {
        logger.error(`Error in iteration ${iteration}`, { error: error.message });
        // Continue to next iteration or answer generation
        break;
      }
    }

    // Generate final answer if not found
    if (!finalAnswer && searchResults.length > 0) {
      logger.info('Generating answer from search results', {
        resultCount: searchResults.length,
      });
      finalAnswer = await this.generateAnswer(query, searchResults, sessionDir);
    } else if (!finalAnswer) {
      finalAnswer =
        "I couldn't find any information about that in your lifelogs. The query might be too specific or the information might not be in the recorded conversations.";
    }

    // Save results
    const searchResult = {
      sessionId,
      query,
      iterations: iteration,
      confidence,
      answer: finalAnswer,
      resultCount: searchResults.length,
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(sessionDir, 'results.json'),
      JSON.stringify(searchResult, null, 2)
    );

    // Cache the answer
    if (finalAnswer && this.config.tasks.memory_search.cacheAnswers) {
      await this.cacheAnswer(queryHash, searchResult);
    }

    return searchResult;
  }

  extractQuery(task) {
    // First try to use the pre-assessed extracted request
    if (task.trigger.assessment?.extractedRequest) {
      return task.trigger.assessment.extractedRequest;
    }

    // Otherwise extract from context
    const context = task.trigger.text;
    const keyword = this.config.trigger.keyword;

    // Extract everything after the keyword
    const keywordIndex = context.toLowerCase().indexOf(keyword.toLowerCase());
    if (keywordIndex !== -1) {
      const afterKeyword = context.substring(keywordIndex + keyword.length).trim();
      // Take the rest of the sentence/question
      const match = afterKeyword.match(/^[^.!?]+[.!?]?/);
      return match ? match[0].trim() : afterKeyword;
    }

    return context;
  }

  hashQuery(query) {
    return createHash('sha256').update(query.toLowerCase().trim()).digest('hex').substring(0, 16);
  }

  buildSearchPrompt(query, iteration, previousResults) {
    if (iteration === 1) {
      return `You are a memory search assistant with access to transcripts of recorded conversations stored in markdown files.

User's question: "${query}"

Your task is to find relevant information in the transcript files to answer this question.

Search strategy:
1. First, use the unified search tool: node scripts/unified-search-tool.js "your search query"
2. This will return the most relevant lifelogs with highlights and scores
3. If you need more context, use Read on the specific files returned
4. If results are insufficient, try alternative queries with the unified search tool
5. As a fallback, use LS and rg for manual exploration

Available tools:
- LS: List directory contents to understand file organization
- Bash: Use 'rg' (ripgrep) for fast text search across files
- Read: Read specific files to examine content
- Grep: Alternative search tool if needed
- Bash: Use 'node scripts/unified-search-tool.js "your query"' for comprehensive search across all lifelogs

After searching, provide your findings in this exact JSON format (include the JSON in a code block):
\`\`\`json
{
  "results": [
    {
      "file": "path/to/file",
      "content": "relevant excerpt from the file",
      "relevance": 0.9
    }
  ],
  "hasAnswer": true,
  "answer": "direct answer to the user's question if found",
  "confidence": 0.85,
  "needsRefinement": false,
  "refinementStrategy": "description of what to search next if needed"
}
\`\`\``;
    } else {
      const resultSummary = previousResults
        .slice(-5)
        .map((r) => `- ${r.file}: ${r.content.substring(0, 100)}...`)
        .join('\n');

      return `Continue searching for: "${query}"

Previous findings:
${resultSummary}

Based on previous results, refine your search strategy:
1. Look for related information in nearby dates/files
2. Try alternative keywords or phrases
3. Check if there's more context around previous findings
4. Search for synonyms or related concepts

Remember to check:
- Files from similar dates
- Different phrasings of the same concept
- Context before and after matches

Respond with the same JSON format as before, wrapped in a code block.`;
    }
  }

  parseSearchResponse(response) {
    try {
      // Extract JSON from response
      const content = response.content || response;

      // Look for JSON in code blocks first
      const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        return JSON.parse(codeBlockMatch[1]);
      }

      // Try to find raw JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('No JSON found in response');
    } catch (error) {
      logger.error('Failed to parse search response', {
        error: error.message,
        responsePreview: (response.content || response).substring(0, 200),
      });

      return {
        results: [],
        hasAnswer: false,
        confidence: 0,
        needsRefinement: true,
        refinementStrategy: 'Failed to parse response, retrying with different approach',
      };
    }
  }

  async generateAnswer(query, searchResults, sessionDir) {
    const relevantResults = searchResults
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 10);

    const context = relevantResults
      .map((r) => `File: ${r.file}\nContent: ${r.content}\n`)
      .join('\n---\n');

    const prompt = `Based on the following search results, provide a comprehensive answer to: "${query}"

Search Results:
${context}

Generate a clear, concise answer that:
1. Directly addresses the user's question
2. Cites specific information from the results
3. Indicates any uncertainty or missing information
4. Is written in a friendly, conversational tone

Important: Provide ONLY the answer text, no JSON or formatting.`;

    try {
      const response = await this.claudeInvoker.invoke(prompt, {
        sessionDir,
        iterationNum: 999,
        iterationName: 'answer-generation',
        maxTurns: 1,
        allowedTools: [],
        outputFormat: 'text',
      });

      return response.content || response;
    } catch (error) {
      logger.error('Failed to generate answer', { error: error.message });
      return `I found ${relevantResults.length} relevant results but encountered an error generating a summary. The most relevant finding was in ${relevantResults[0]?.file || 'unknown file'}.`;
    }
  }

  async getCachedAnswer(queryHash) {
    try {
      const cachePath = path.join(this.answersDir, `${queryHash}.json`);
      const content = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(content);

      // Check if cache is still valid (24 hours)
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return cached;
      }
    } catch {
      // Cache miss is normal
    }
    return null;
  }

  async cacheAnswer(queryHash, result) {
    await fs.mkdir(this.answersDir, { recursive: true });
    const cachePath = path.join(this.answersDir, `${queryHash}.json`);
    await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
    logger.debug('Cached answer', { queryHash });
  }

  async clearCache() {
    try {
      const files = await fs.readdir(this.answersDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.answersDir, file));
        }
      }
      logger.info('Answer cache cleared');
    } catch (error) {
      logger.error('Error clearing cache', { error: error.message });
    }
  }
}
