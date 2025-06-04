import { FileManager } from './file-manager.js';
import { logger } from '../utils/logger.js';
import type { Phase2Lifelog } from '../types/phase2.js';
import { promises as fs } from 'fs';
import path from 'path';

export interface AggregationPeriod {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start: Date;
  end: Date;
}

export interface AggregatedData {
  period: AggregationPeriod;
  lifelogCount: number;
  totalDuration: number; // seconds
  avgDuration: number;
  topKeywords: Array<{ word: string; count: number }>;
  topTopics: string[];
  actionItems: string[];
  summary?: string;
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    version: string;
  };
}

export interface AggregationOptions {
  enableSummaries?: boolean;
  enableActionItems?: boolean;
  enableKeywords?: boolean;
  maxKeywords?: number;
  maxTopics?: number;
}

export class AggregationService {
  private fileManager: FileManager;
  private aggregationsDir: string;
  private options: Required<AggregationOptions>;

  constructor(
    fileManager: FileManager,
    baseDir: string = './data',
    options: AggregationOptions = {}
  ) {
    this.fileManager = fileManager;
    this.aggregationsDir = path.join(baseDir, 'aggregations');

    this.options = {
      enableSummaries: options.enableSummaries ?? true,
      enableActionItems: options.enableActionItems ?? true,
      enableKeywords: options.enableKeywords ?? true,
      maxKeywords: options.maxKeywords || 50,
      maxTopics: options.maxTopics || 20,
    };
  }

  /**
   * Initialize the aggregation service
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.aggregationsDir, { recursive: true });
    logger.info('Aggregation service initialized', { dir: this.aggregationsDir });
  }

  /**
   * Aggregate lifelogs for a specific period
   */
  async aggregatePeriod(period: AggregationPeriod): Promise<AggregatedData> {
    const startTime = Date.now();
    logger.info('Starting aggregation', {
      type: period.type,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    });

    // Fetch lifelogs for the period
    const lifelogs = await this.fetchLifelogsForPeriod(period);

    if (lifelogs.length === 0) {
      return this.createEmptyAggregation(period);
    }

    // Calculate basic statistics
    const stats = this.calculateStatistics(lifelogs);

    // Extract keywords if enabled
    const topKeywords = this.options.enableKeywords ? await this.extractTopKeywords(lifelogs) : [];

    // Extract topics
    const topTopics = await this.extractTopTopics(lifelogs);

    // Extract action items if enabled
    const actionItems = this.options.enableActionItems
      ? await this.extractActionItems(lifelogs)
      : [];

    // Generate summary if enabled
    const summary = this.options.enableSummaries
      ? await this.generatePeriodSummary(lifelogs, period)
      : undefined;

    const aggregation: AggregatedData = {
      period,
      lifelogCount: lifelogs.length,
      totalDuration: stats.totalDuration,
      avgDuration: stats.avgDuration,
      topKeywords,
      topTopics,
      actionItems,
      summary,
      metadata: {
        createdAt: new Date(),
        lastUpdated: new Date(),
        version: '1.0.0',
      },
    };

    // Save aggregation
    await this.saveAggregation(aggregation);

    const aggregationTime = Date.now() - startTime;
    logger.info('Aggregation completed', {
      type: period.type,
      lifelogCount: lifelogs.length,
      aggregationTime,
    });

    return aggregation;
  }

  /**
   * Fetch lifelogs for a period
   */
  private async fetchLifelogsForPeriod(period: AggregationPeriod): Promise<Phase2Lifelog[]> {
    const lifelogRefs = await this.fileManager.listLifelogsByDateRange(period.start, period.end);

    const lifelogs: Phase2Lifelog[] = [];

    for (const ref of lifelogRefs) {
      const lifelog = await this.fileManager.loadLifelog(ref.id, ref.date);
      if (lifelog) {
        lifelogs.push(lifelog);
      }
    }

    return lifelogs;
  }

  /**
   * Calculate basic statistics
   */
  private calculateStatistics(lifelogs: Phase2Lifelog[]): {
    totalDuration: number;
    avgDuration: number;
  } {
    const totalDuration = lifelogs.reduce((sum, log) => sum + log.duration, 0);
    const avgDuration = lifelogs.length > 0 ? totalDuration / lifelogs.length : 0;

    return { totalDuration, avgDuration };
  }

  /**
   * Extract top keywords from lifelogs
   */
  private async extractTopKeywords(
    lifelogs: Phase2Lifelog[]
  ): Promise<Array<{ word: string; count: number }>> {
    const wordFreq = new Map<string, number>();

    // Common words to exclude
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'up',
      'about',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
      'is',
      'are',
      'was',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'ought',
      'i',
      'me',
      'my',
      'we',
      'us',
      'our',
      'you',
      'your',
      'he',
      'him',
      'his',
      'she',
      'her',
      'it',
      'its',
      'they',
      'them',
      'their',
      'this',
      'that',
      'these',
      'those',
      'what',
      'which',
      'who',
      'whom',
      'whose',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'some',
      'any',
      'many',
      'much',
      'most',
      'other',
      'another',
      'such',
      'no',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'now',
      'also',
      'well',
    ]);

    for (const lifelog of lifelogs) {
      const words = lifelog.content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word: string) => word.length > 3 && !stopWords.has(word));

      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.options.maxKeywords)
      .map(([word, count]) => ({ word, count }));
  }

  /**
   * Extract top topics from lifelogs
   */
  private async extractTopTopics(lifelogs: Phase2Lifelog[]): Promise<string[]> {
    const topicFreq = new Map<string, number>();

    for (const lifelog of lifelogs) {
      // Use headings as topics
      if (lifelog.headings) {
        for (const heading of lifelog.headings) {
          const topic = heading.trim();
          if (topic.length > 0) {
            topicFreq.set(topic, (topicFreq.get(topic) || 0) + 1);
          }
        }
      }

      // Extract capitalized phrases as potential topics
      const capitalizedPhrases = lifelog.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
      for (const phrase of capitalizedPhrases) {
        if (phrase.length > 5) {
          topicFreq.set(phrase, (topicFreq.get(phrase) || 0) + 1);
        }
      }
    }

    return Array.from(topicFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.options.maxTopics)
      .map(([topic]) => topic);
  }

  /**
   * Extract action items from lifelogs
   */
  private async extractActionItems(lifelogs: Phase2Lifelog[]): Promise<string[]> {
    const actionItems = new Set<string>();

    const actionPatterns = [
      /(?:need to|must|should|have to|got to)\s+([^.,;]+)/gi,
      /(?:action item:|todo:|task:)\s*([^.,;]+)/gi,
      /(?:remind me to|remember to)\s+([^.,;]+)/gi,
      /(?:follow up on|follow up with)\s+([^.,;]+)/gi,
      /(?:\[\s*\]\s*|☐\s*)([^[\n]+)/gi, // Checkbox patterns
    ];

    for (const lifelog of lifelogs) {
      for (const pattern of actionPatterns) {
        const matches = lifelog.content.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            const item = match[1].trim();
            if (item.length > 5 && item.length < 200) {
              actionItems.add(item);
            }
          }
        }
      }
    }

    return Array.from(actionItems);
  }

  /**
   * Generate a summary for the period
   */
  private async generatePeriodSummary(
    lifelogs: Phase2Lifelog[],
    period: AggregationPeriod
  ): Promise<string> {
    // Simple summary generation - can be enhanced with AI later
    const totalHours = Math.round(lifelogs.reduce((sum, log) => sum + log.duration, 0) / 3600);

    const topics = await this.extractTopTopics(lifelogs);
    const topicsList = topics.slice(0, 5).join(', ');

    const dateRange = `${period.start.toLocaleDateString()} - ${period.end.toLocaleDateString()}`;

    return (
      `During the ${period.type} period (${dateRange}), there were ${lifelogs.length} recordings ` +
      `totaling ${totalHours} hours. Main topics discussed: ${topicsList}.`
    );
  }

  /**
   * Create empty aggregation for periods with no data
   */
  private createEmptyAggregation(period: AggregationPeriod): AggregatedData {
    return {
      period,
      lifelogCount: 0,
      totalDuration: 0,
      avgDuration: 0,
      topKeywords: [],
      topTopics: [],
      actionItems: [],
      summary: `No recordings found for the ${period.type} period.`,
      metadata: {
        createdAt: new Date(),
        lastUpdated: new Date(),
        version: '1.0.0',
      },
    };
  }

  /**
   * Save aggregation to disk
   */
  private async saveAggregation(aggregation: AggregatedData): Promise<void> {
    const filename = this.getAggregationFilename(aggregation.period);
    const filepath = path.join(this.aggregationsDir, filename);

    await fs.writeFile(filepath, JSON.stringify(aggregation, null, 2), 'utf8');
    logger.debug('Saved aggregation', { file: filename });
  }

  /**
   * Load aggregation from disk
   */
  async loadAggregation(period: AggregationPeriod): Promise<AggregatedData | null> {
    const filename = this.getAggregationFilename(period);
    const filepath = path.join(this.aggregationsDir, filename);

    try {
      const content = await fs.readFile(filepath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get aggregation filename
   */
  private getAggregationFilename(period: AggregationPeriod): string {
    const start = period.start.toISOString().split('T')[0];
    const end = period.end.toISOString().split('T')[0];
    return `${period.type}_${start}_${end}.json`;
  }

  /**
   * Aggregate all historical data
   */
  async aggregateHistoricalData(startDate: Date, endDate: Date): Promise<void> {
    logger.info('Starting historical aggregation', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    // Daily aggregations
    const current = new Date(startDate);
    while (current <= endDate) {
      const dayStart = new Date(current);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(current);
      dayEnd.setHours(23, 59, 59, 999);

      await this.aggregatePeriod({
        type: 'daily',
        start: dayStart,
        end: dayEnd,
      });

      current.setDate(current.getDate() + 1);
    }

    // Weekly aggregations
    await this.aggregateWeeks(startDate, endDate);

    // Monthly aggregations
    await this.aggregateMonths(startDate, endDate);

    logger.info('Historical aggregation completed');
  }

  /**
   * Aggregate weeks
   */
  private async aggregateWeeks(startDate: Date, endDate: Date): Promise<void> {
    const current = new Date(startDate);
    current.setDate(current.getDate() - current.getDay()); // Start of week

    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      if (weekEnd >= startDate) {
        await this.aggregatePeriod({
          type: 'weekly',
          start: weekStart,
          end: weekEnd,
        });
      }

      current.setDate(current.getDate() + 7);
    }
  }

  /**
   * Aggregate months
   */
  private async aggregateMonths(startDate: Date, endDate: Date): Promise<void> {
    const current = new Date(startDate);
    current.setDate(1); // Start of month

    while (current <= endDate) {
      const monthStart = new Date(current);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      await this.aggregatePeriod({
        type: 'monthly',
        start: monthStart,
        end: monthEnd,
      });

      current.setMonth(current.getMonth() + 1);
    }
  }

  /**
   * Get aggregation statistics
   */
  async getStats(): Promise<{
    totalAggregations: number;
    byType: Record<string, number>;
    totalSize: number;
  }> {
    const files = await fs.readdir(this.aggregationsDir);
    const stats = {
      totalAggregations: 0,
      byType: {
        daily: 0,
        weekly: 0,
        monthly: 0,
        yearly: 0,
      },
      totalSize: 0,
    };

    for (const file of files) {
      if (file.endsWith('.json')) {
        stats.totalAggregations++;

        // Count by type
        if (file.startsWith('daily_')) stats.byType.daily++;
        else if (file.startsWith('weekly_')) stats.byType.weekly++;
        else if (file.startsWith('monthly_')) stats.byType.monthly++;
        else if (file.startsWith('yearly_')) stats.byType.yearly++;

        // Calculate size
        const filepath = path.join(this.aggregationsDir, file);
        const fileStats = await fs.stat(filepath);
        stats.totalSize += fileStats.size;
      }
    }

    return stats;
  }
}
