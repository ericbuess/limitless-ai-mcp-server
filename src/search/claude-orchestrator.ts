import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import type { Phase2Lifelog } from '../types/phase2.js';

const execAsync = promisify(exec);

export interface ClaudeSearchResult {
  query: string;
  results: {
    lifelogs: Phase2Lifelog[];
    insights: string;
    actionItems?: string[];
    summary?: string;
  };
  metadata: {
    executionTime: number;
    toolsUsed: string[];
    confidence: number;
  };
}

export interface ClaudeOrchestratorOptions {
  maxTurns?: number;
  timeout?: number;
  allowedTools?: string[];
  temperature?: number;
  streamCallback?: (chunk: any) => void;
}

export class ClaudeOrchestrator {
  private isAvailable: boolean = false;
  private claudeVersion: string = '';
  private defaultTimeout: number = 120000; // 2 minutes

  constructor() {
    this.checkAvailability();
  }

  /**
   * Check if Claude CLI is available and authenticated
   */
  private async checkAvailability(): Promise<void> {
    try {
      const { stdout } = await execAsync('claude --version', { timeout: 5000 });
      this.claudeVersion = stdout.trim();
      this.isAvailable = true;
      logger.info('Claude CLI available', { version: this.claudeVersion });
    } catch (error) {
      this.isAvailable = false;
      logger.warn('Claude CLI not available', { error });
    }
  }

  /**
   * Execute a complex search query using Claude
   */
  async executeComplexSearch(
    query: string,
    lifelogs: Phase2Lifelog[],
    options: ClaudeOrchestratorOptions = {}
  ): Promise<ClaudeSearchResult> {
    if (!this.isAvailable) {
      throw new Error('Claude CLI is not available. Please install and authenticate Claude Code.');
    }

    const startTime = Date.now();
    const {
      maxTurns = 3,
      timeout = this.defaultTimeout,
      allowedTools = ['Read', 'Bash(rg:*)'],
      streamCallback,
    } = options;

    try {
      // Prepare the prompt with context
      const prompt = this.buildSearchPrompt(query, lifelogs);

      if (streamCallback) {
        return await this.executeStreamingSearch(prompt, {
          maxTurns,
          timeout,
          allowedTools,
          streamCallback,
        });
      } else {
        return await this.executeJsonSearch(prompt, { maxTurns, timeout, allowedTools });
      }
    } catch (error) {
      logger.error('Claude orchestration failed', { error, query });
      throw error;
    } finally {
      const executionTime = Date.now() - startTime;
      logger.info('Claude search completed', { query, executionTime });
    }
  }

  /**
   * Execute search with JSON output
   */
  private async executeJsonSearch(
    prompt: string,
    options: {
      maxTurns: number;
      timeout: number;
      allowedTools: string[];
    }
  ): Promise<ClaudeSearchResult> {
    const args = [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--max-turns',
      options.maxTurns.toString(),
      '--allowedTools',
      options.allowedTools.join(','),
    ];

    try {
      const { stdout } = await execAsync(`claude ${args.map((arg) => `"${arg}"`).join(' ')}`, {
        timeout: options.timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      const response = JSON.parse(stdout);
      return this.parseClaudeResponse(response);
    } catch (error) {
      if ((error as any).code === 'ETIMEDOUT') {
        throw new Error(`Claude search timed out after ${options.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Execute search with streaming output
   */
  private async executeStreamingSearch(
    prompt: string,
    options: {
      maxTurns: number;
      timeout: number;
      allowedTools: string[];
      streamCallback: (chunk: any) => void;
    }
  ): Promise<ClaudeSearchResult> {
    return new Promise((resolve, reject) => {
      const args = [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--max-turns',
        options.maxTurns.toString(),
        '--allowedTools',
        options.allowedTools.join(','),
      ];

      const claude = spawn('claude', args);
      const chunks: any[] = [];
      let buffer = '';

      const timeout = setTimeout(() => {
        claude.kill();
        reject(new Error(`Claude search timed out after ${options.timeout}ms`));
      }, options.timeout);

      claude.stdout.on('data', (data) => {
        buffer += data.toString();

        // Try to parse complete JSON messages from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              chunks.push(chunk);
              options.streamCallback(chunk);
            } catch (error) {
              logger.debug('Failed to parse streaming chunk', { line });
            }
          }
        }
      });

      claude.stderr.on('data', (data) => {
        logger.error('Claude stderr', { data: data.toString() });
      });

      claude.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new Error(`Claude process exited with code ${code}`));
          return;
        }

        try {
          const result = this.parseStreamingChunks(chunks);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      claude.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Build a search prompt for Claude
   */
  private buildSearchPrompt(query: string, lifelogs: Phase2Lifelog[]): string {
    const context = this.prepareLifelogContext(lifelogs);

    return `You are helping search through Limitless AI Pendant recordings (lifelogs). 

User Query: "${query}"

Available Lifelogs:
${context}

Instructions:
1. Analyze the user's search query to understand their intent
2. Search through the provided lifelogs to find relevant information
3. If the query asks for summaries, action items, or insights, extract them
4. Return structured results with:
   - Relevant lifelogs (full objects)
   - Key insights or findings
   - Action items (if requested)
   - Summary (if requested)
   - Confidence score (0-1)

Output Format:
{
  "query": "${query}",
  "results": {
    "lifelogs": [...],
    "insights": "...",
    "actionItems": [...],
    "summary": "..."
  },
  "metadata": {
    "toolsUsed": [...],
    "confidence": 0.95
  }
}`;
  }

  /**
   * Prepare lifelog context for Claude
   */
  private prepareLifelogContext(lifelogs: Phase2Lifelog[]): string {
    return lifelogs
      .slice(0, 20)
      .map((log, index) => {
        return `${index + 1}. [${log.id}] ${log.title} (${new Date(log.createdAt).toLocaleDateString()})
   Duration: ${Math.floor(log.duration / 60)} minutes
   Preview: ${log.content.substring(0, 200)}...`;
      })
      .join('\n\n');
  }

  /**
   * Parse Claude's JSON response
   */
  private parseClaudeResponse(response: any): ClaudeSearchResult {
    // Handle different response formats from Claude
    if (response.results) {
      return {
        query: response.query || '',
        results: response.results,
        metadata: {
          executionTime: 0,
          toolsUsed: response.metadata?.toolsUsed || [],
          confidence: response.metadata?.confidence || 0.5,
        },
      };
    }

    // Fallback parsing
    return {
      query: '',
      results: {
        lifelogs: [],
        insights: response.message || response.content || '',
      },
      metadata: {
        executionTime: 0,
        toolsUsed: [],
        confidence: 0.5,
      },
    };
  }

  /**
   * Parse streaming chunks into a result
   */
  private parseStreamingChunks(chunks: any[]): ClaudeSearchResult {
    const result: ClaudeSearchResult = {
      query: '',
      results: {
        lifelogs: [],
        insights: '',
      },
      metadata: {
        executionTime: 0,
        toolsUsed: [],
        confidence: 0.5,
      },
    };

    // Aggregate information from chunks
    for (const chunk of chunks) {
      if (chunk.type === 'result' || chunk.type === 'final') {
        Object.assign(result, this.parseClaudeResponse(chunk));
      } else if (chunk.type === 'tool_use') {
        result.metadata.toolsUsed.push(chunk.tool);
      }
    }

    return result;
  }

  /**
   * Execute analytical queries on lifelogs
   */
  async analyzeLifelogs(
    analysisType: 'summary' | 'action-items' | 'topics' | 'trends',
    lifelogs: Phase2Lifelog[],
    options: ClaudeOrchestratorOptions = {}
  ): Promise<ClaudeSearchResult> {
    const prompts = {
      summary:
        'Provide a comprehensive summary of these lifelogs, highlighting key discussions and decisions.',
      'action-items':
        'Extract all action items, tasks, and commitments mentioned in these lifelogs.',
      topics: 'Identify and list the main topics discussed across these lifelogs.',
      trends: 'Analyze patterns and trends in these lifelogs over time.',
    };

    const query = prompts[analysisType];
    return await this.executeComplexSearch(query, lifelogs, options);
  }

  /**
   * Compare lifelogs to find similarities or differences
   */
  async compareLifelogs(
    lifelogs: Phase2Lifelog[],
    comparisonType: 'similarity' | 'differences' | 'evolution',
    options: ClaudeOrchestratorOptions = {}
  ): Promise<ClaudeSearchResult> {
    const prompts = {
      similarity: 'Find and highlight similarities between these lifelogs.',
      differences: 'Identify key differences and contrasts between these lifelogs.',
      evolution: 'Show how topics and discussions evolved across these lifelogs over time.',
    };

    const query = prompts[comparisonType];
    return await this.executeComplexSearch(query, lifelogs, options);
  }

  /**
   * Generate insights from patterns in lifelogs
   */
  async generateInsights(
    lifelogs: Phase2Lifelog[],
    insightType: 'productivity' | 'collaboration' | 'focus-areas',
    options: ClaudeOrchestratorOptions = {}
  ): Promise<ClaudeSearchResult> {
    const prompts = {
      productivity: 'Analyze these lifelogs for productivity patterns and provide recommendations.',
      collaboration: 'Identify collaboration patterns and suggest improvements.',
      'focus-areas': 'Determine main focus areas and time allocation across these lifelogs.',
    };

    const query = prompts[insightType];
    return await this.executeComplexSearch(query, lifelogs, options);
  }

  /**
   * Check if Claude CLI is available
   */
  isClaudeAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Get Claude CLI version
   */
  getClaudeVersion(): string {
    return this.claudeVersion;
  }

  /**
   * Authenticate Claude CLI (opens browser)
   */
  async authenticateClaude(): Promise<void> {
    try {
      logger.info('Opening Claude authentication in browser...');
      await execAsync('claude auth login');
      await this.checkAvailability();
    } catch (error) {
      logger.error('Claude authentication failed', { error });
      throw error;
    }
  }
}
