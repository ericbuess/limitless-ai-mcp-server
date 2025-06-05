import { FileManager } from '../storage/file-manager.js';
import { ClaudeInvoker } from '../utils/claude-invoker.js';
import { TaskExecutor } from '../tasks/task-executor.js';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

export class TriggerMonitor {
  constructor(config) {
    this.config = config;
    this.fileManager = new FileManager({
      baseDir: './data',
      enableEmbeddings: false,
      enableMetadata: true,
    });
    this.claudeInvoker = new ClaudeInvoker();
    this.taskExecutor = new TaskExecutor(config);
    this.lastProcessedTime = null;
    this.checkpointFile = './data/trigger-checkpoint.json';
    this.isRunning = false;
    this.checkInterval = null;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Trigger monitoring already running');
      return;
    }

    logger.info('Starting trigger monitoring...', {
      keyword: this.config.trigger.keyword,
      pollInterval: this.config.monitoring.pollInterval,
    });

    this.isRunning = true;
    await this.fileManager.initialize();
    await this.loadCheckpoint();

    // Run initial check
    await this.checkForTriggers();

    // Set up interval for checking
    this.checkInterval = setInterval(() => {
      this.checkForTriggers().catch((error) => {
        logger.error('Error in trigger check', { error: error.message });
      });
    }, this.config.monitoring.pollInterval);

    logger.info('Trigger monitoring active');
  }

  async stop() {
    logger.info('Stopping trigger monitoring...');
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    await this.saveCheckpoint();
    logger.info('Trigger monitoring stopped');
  }

  async loadCheckpoint() {
    try {
      const data = await fs.readFile(this.checkpointFile, 'utf-8');
      const checkpoint = JSON.parse(data);
      this.lastProcessedTime = new Date(checkpoint.lastProcessedTime);
      logger.info('Loaded checkpoint', { lastProcessedTime: this.lastProcessedTime.toISOString() });
    } catch {
      // Default to 5 minutes ago if no checkpoint
      this.lastProcessedTime = new Date(
        Date.now() - this.config.monitoring.lookbackMinutes * 60000
      );
      logger.info('No checkpoint found, starting from', {
        time: this.lastProcessedTime.toISOString(),
      });
    }
  }

  async saveCheckpoint() {
    await fs.writeFile(
      this.checkpointFile,
      JSON.stringify(
        {
          lastProcessedTime: this.lastProcessedTime.toISOString(),
          lastSaved: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }

  async checkForTriggers() {
    const endTime = new Date();
    const startTime = new Date(this.lastProcessedTime);

    logger.debug('Checking for triggers', {
      from: startTime.toISOString(),
      to: endTime.toISOString(),
    });

    try {
      // Get recent lifelogs
      const recentLogs = await this.getRecentLifelogs(startTime, endTime);
      logger.debug(`Found ${recentLogs.length} lifelogs to check`);

      let triggersFound = 0;

      for (const lifelog of recentLogs) {
        const triggers = await this.detectTriggers(lifelog);

        for (const trigger of triggers) {
          triggersFound++;
          logger.info('Trigger detected', {
            id: lifelog.id,
            text: trigger.text.substring(0, 100) + '...',
          });

          if (this.config.trigger.preAssessment.enabled) {
            const assessment = await this.preAssessTrigger(trigger);
            if (!assessment.isValidRequest) {
              logger.info('Pre-assessment: Not a valid task request, skipping', {
                confidence: assessment.confidence,
                taskType: assessment.taskType,
              });
              continue;
            }

            logger.info('Pre-assessment: Valid request detected', {
              taskType: assessment.taskType,
              confidence: assessment.confidence,
              request: assessment.extractedRequest,
            });

            // Enhance trigger with assessment results
            trigger.assessment = assessment;
          }

          await this.processTrigger(trigger, lifelog);
        }
      }

      if (triggersFound > 0) {
        logger.info(`Processed ${triggersFound} triggers`);
      }

      this.lastProcessedTime = endTime;
      await this.saveCheckpoint();
    } catch (error) {
      logger.error('Error checking for triggers', { error: error.message, stack: error.stack });
    }
  }

  async getRecentLifelogs(startTime, endTime) {
    const lifelogs = [];
    const currentDate = new Date(startTime);

    // Iterate through each day
    while (currentDate <= endTime) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayLogs = await this.fileManager.listLifelogsByDate(currentDate);

      for (const logId of dayLogs) {
        try {
          const lifelog = await this.fileManager.loadLifelog(logId, currentDate);
          if (!lifelog) continue;

          // Check if lifelog is within our time range
          const logTime = new Date(lifelog.createdAt);
          if (logTime >= startTime && logTime <= endTime) {
            lifelogs.push(lifelog);
          }
        } catch (error) {
          logger.error('Error loading lifelog', { id: logId, error: error.message });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by timestamp
    return lifelogs.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async detectTriggers(lifelog) {
    const triggers = [];
    const keyword = this.config.trigger.caseSensitive
      ? this.config.trigger.keyword
      : this.config.trigger.keyword.toLowerCase();
    const content = this.config.trigger.caseSensitive
      ? lifelog.content
      : lifelog.content.toLowerCase();

    let index = 0;
    while ((index = content.indexOf(keyword, index)) !== -1) {
      // Extract context around the trigger
      const contextStart = Math.max(0, index - this.config.trigger.contextWindow);
      const contextEnd = Math.min(
        lifelog.content.length,
        index + keyword.length + this.config.trigger.contextWindow
      );

      const contextText = lifelog.content.substring(contextStart, contextEnd);

      triggers.push({
        position: index,
        text: contextText,
        fullContext: lifelog.content,
        metadata: {
          id: lifelog.id,
          title: lifelog.title,
          date: lifelog.createdAt,
          duration: lifelog.duration,
        },
      });

      index += keyword.length;
    }

    return triggers;
  }

  async preAssessTrigger(trigger) {
    const prompt = `You detected the trigger word "${this.config.trigger.keyword}" in this context:

"${trigger.text}"

Analyze if this is a genuine request for assistance or task. Consider:
1. Is there an actionable request following the trigger word?
2. Is it directed at the assistant (not just mentioning the word)?
3. Does it contain a clear task or question?

Respond with JSON:
{
  "isValidRequest": true/false,
  "taskType": "memory_search" | "reminder" | "message" | "none",
  "confidence": 0.0-1.0,
  "extractedRequest": "the actual request if found"
}`;

    try {
      const response = await this.claudeInvoker.invoke(prompt, {
        maxTurns: 1,
        allowedTools: [],
        outputFormat: 'json',
      });

      // Handle both direct JSON response and content wrapper
      const content = response.content || response;
      if (typeof content === 'string') {
        return JSON.parse(content);
      }
      return content;
    } catch (error) {
      logger.error('Pre-assessment failed', { error: error.message });
      return {
        isValidRequest: false,
        taskType: 'none',
        confidence: 0,
        extractedRequest: '',
      };
    }
  }

  async processTrigger(trigger, lifelog) {
    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: trigger.assessment?.taskType || 'memory_search',
      trigger,
      lifelog: {
        id: lifelog.id,
        date: lifelog.createdAt,
        title: lifelog.title,
      },
      createdAt: new Date().toISOString(),
    };

    logger.info('Executing task', { taskId: task.id, type: task.type });

    try {
      await this.taskExecutor.execute(task);
    } catch (error) {
      logger.error('Task execution failed', {
        taskId: task.id,
        error: error.message,
      });
    }
  }

  async getStatus() {
    return {
      isRunning: this.isRunning,
      lastProcessedTime: this.lastProcessedTime?.toISOString(),
      config: {
        keyword: this.config.trigger.keyword,
        pollInterval: this.config.monitoring.pollInterval,
        lookbackMinutes: this.config.monitoring.lookbackMinutes,
      },
    };
  }
}
