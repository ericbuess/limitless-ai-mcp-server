import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

export class ClaudeInvoker {
  constructor(options = {}) {
    this.claudePath = options.claudePath || 'claude';
    this.baseDir = options.baseDir || './data/search-history';
    this.timeout = options.timeout || 120000;
  }

  async createSession(query, context = {}) {
    const sessionId = `session-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const sessionDir = path.join(this.baseDir, new Date().toISOString().split('T')[0], sessionId);

    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(path.join(sessionDir, 'iterations'), { recursive: true });

    await fs.writeFile(path.join(sessionDir, 'query.txt'), query);
    await fs.writeFile(path.join(sessionDir, 'context.json'), JSON.stringify(context, null, 2));

    logger.info('Created search session', { sessionId, query });

    return { sessionId, sessionDir };
  }

  async invoke(prompt, options = {}) {
    const {
      sessionDir,
      iterationNum = 1,
      allowedTools = ['Read', 'Bash(rg:*)', 'Grep', 'LS'],
      outputFormat = 'json',
      maxTurns = 3,
    } = options;

    const iterationDir = sessionDir
      ? path.join(
          sessionDir,
          'iterations',
          String(iterationNum).padStart(3, '0') + '-' + (options.iterationName || 'search')
        )
      : null;

    if (iterationDir) {
      await fs.mkdir(iterationDir, { recursive: true });
      await fs.writeFile(path.join(iterationDir, 'prompt.txt'), prompt);
    }

    return new Promise((resolve, reject) => {
      const args = ['-p', prompt, '--output-format', outputFormat, '--max-turns', String(maxTurns)];

      // TEMPORARY: Use --dangerously-skip-permissions to avoid hanging
      // TODO: Fix --allowedTools issue with Claude CLI
      if (allowedTools.length > 0) {
        args.push('--dangerously-skip-permissions');
      }

      logger.debug('Invoking Claude CLI', { args: args.slice(0, 4) }); // Don't log full prompt

      const child = spawn(this.claudePath, args, {
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        logger.error('Failed to spawn Claude', { error: error.message });
        reject(new Error(`Failed to spawn Claude: ${error.message}`));
      });

      child.on('close', async (code) => {
        if (code !== 0) {
          logger.error('Claude exited with error', { code, stderr });
          reject(new Error(`Claude exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          // Claude CLI might return plain text or JSON depending on the output format
          let response;
          if (outputFormat === 'json') {
            response = JSON.parse(stdout);
          } else {
            response = { content: stdout };
          }

          if (iterationDir) {
            await fs.writeFile(
              path.join(iterationDir, 'response.json'),
              JSON.stringify(response, null, 2)
            );
          }

          logger.debug('Claude invocation successful');
          resolve(response);
        } catch (error) {
          logger.error('Failed to parse Claude output', {
            error: error.message,
            output: stdout.slice(0, 200),
          });
          // If JSON parsing fails, return as plain text
          resolve({ content: stdout });
        }
      });
    });
  }

  async loadPreviousContext(sessionDir) {
    const contextPath = path.join(sessionDir, 'context.json');
    try {
      const content = await fs.readFile(contextPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.debug('No previous context found', { sessionDir });
      return {};
    }
  }

  async saveContext(sessionDir, context) {
    const contextPath = path.join(sessionDir, 'context.json');
    await fs.writeFile(contextPath, JSON.stringify(context, null, 2));
    logger.debug('Saved session context', { sessionDir });
  }

  async getSessionHistory(sessionDir) {
    const iterationsDir = path.join(sessionDir, 'iterations');
    try {
      const iterations = await fs.readdir(iterationsDir);
      const history = [];

      for (const iteration of iterations.sort()) {
        const iterationPath = path.join(iterationsDir, iteration);
        try {
          const prompt = await fs.readFile(path.join(iterationPath, 'prompt.txt'), 'utf-8');
          const response = JSON.parse(
            await fs.readFile(path.join(iterationPath, 'response.json'), 'utf-8')
          );
          history.push({ iteration, prompt, response });
        } catch (error) {
          logger.debug('Could not load iteration', { iteration, error: error.message });
        }
      }

      return history;
    } catch (error) {
      logger.debug('No iteration history found', { sessionDir });
      return [];
    }
  }
}
