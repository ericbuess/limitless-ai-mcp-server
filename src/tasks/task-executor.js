import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

// Use optimized version if available, otherwise fall back to iterative
let MemorySearchTool;
try {
  const { OptimizedMemorySearchTool } = await import('../../scripts/memory-search-optimized.js');
  MemorySearchTool = OptimizedMemorySearchTool;
  logger.info('Using optimized memory search tool');
} catch {
  const { IterativeMemorySearchTool } = await import('../../scripts/memory-search-iterative.js');
  MemorySearchTool = IterativeMemorySearchTool;
  logger.info('Using iterative memory search tool');
}

export class TaskExecutor {
  constructor(config) {
    this.config = config;
    this.handlers = {};

    // Initialize handlers based on config
    if (config.tasks.memory_search.enabled) {
      this.handlers.memory_search = new MemorySearchTool(config);
    }

    // Placeholder for future task types
    if (config.tasks.create_reminder?.enabled) {
      logger.info('Reminder creation enabled but not yet implemented');
    }

    if (config.tasks.send_message?.enabled) {
      logger.info('Message sending enabled but not yet implemented');
    }
  }

  async execute(task) {
    logger.info('Executing task', {
      id: task.id,
      type: task.type,
      lifelogId: task.lifelog.id,
    });

    const handler = this.handlers[task.type];
    if (!handler) {
      const error = new Error(`No handler for task type: ${task.type}`);
      logger.error('Task handler not found', { taskType: task.type });
      await this.saveTaskError(task, error);
      throw error;
    }

    try {
      const startTime = Date.now();
      const result = await handler.execute(task);
      const duration = Date.now() - startTime;

      logger.info('Task completed successfully', {
        taskId: task.id,
        duration: `${duration}ms`,
        resultSummary: {
          hasAnswer: !!result.answer,
          iterations: result.iterations,
          confidence: result.confidence,
        },
      });

      await this.saveTaskResult(task, result);
      return result;
    } catch (error) {
      logger.error('Task execution failed', {
        taskId: task.id,
        error: error.message,
        stack: error.stack,
      });
      await this.saveTaskError(task, error);
      throw error;
    }
  }

  async saveTaskResult(task, result) {
    const taskDir = path.join('./data/tasks', new Date().toISOString().split('T')[0]);
    await fs.mkdir(taskDir, { recursive: true });

    const timestamp = task.createdAt.replace(/[:.]/g, '-');
    const taskFile = path.join(taskDir, `${timestamp}-${task.type}-success.json`);

    const taskRecord = {
      ...task,
      status: 'completed',
      result: {
        sessionId: result.sessionId,
        query: result.query,
        answer: result.answer,
        confidence: result.confidence,
        iterations: result.iterations,
        resultCount: result.resultCount,
      },
      completedAt: new Date().toISOString(),
    };

    await fs.writeFile(taskFile, JSON.stringify(taskRecord, null, 2));
    logger.debug('Task result saved', { file: taskFile });
  }

  async saveTaskError(task, error) {
    const taskDir = path.join('./data/tasks', new Date().toISOString().split('T')[0]);
    await fs.mkdir(taskDir, { recursive: true });

    const timestamp = task.createdAt.replace(/[:.]/g, '-');
    const taskFile = path.join(taskDir, `${timestamp}-${task.type}-error.json`);

    const taskRecord = {
      ...task,
      status: 'failed',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
      },
      failedAt: new Date().toISOString(),
    };

    await fs.writeFile(taskFile, JSON.stringify(taskRecord, null, 2));
    logger.debug('Task error saved', { file: taskFile });
  }

  async getTaskHistory(days = 7) {
    const tasks = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const currentDate = new Date();
    while (currentDate >= startDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const taskDir = path.join('./data/tasks', dateStr);

      try {
        const files = await fs.readdir(taskDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const content = await fs.readFile(path.join(taskDir, file), 'utf-8');
            tasks.push(JSON.parse(content));
          }
        }
      } catch (error) {
        // Directory might not exist for some dates
        if (error.code !== 'ENOENT') {
          logger.error('Error reading task history', { date: dateStr, error: error.message });
        }
      }

      currentDate.setDate(currentDate.getDate() - 1);
    }

    return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getEnabledTasks() {
    return Object.keys(this.handlers);
  }
}
