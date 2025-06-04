import { logger } from '../utils/logger.js';

export enum QueryType {
  SIMPLE_KEYWORD = 'simple_keyword',
  DATE_BASED = 'date_based',
  SEMANTIC = 'semantic',
  COMPLEX_ANALYTICAL = 'complex_analytical',
  ACTION_ITEM = 'action_item',
  SUMMARY = 'summary',
}

export interface QueryClassification {
  type: QueryType;
  confidence: number;
  extractedEntities: {
    keywords?: string[];
    dates?: Date[];
    timeRanges?: { start: Date; end: Date }[];
    actions?: string[];
    topics?: string[];
  };
  suggestedStrategy: 'fast' | 'vector' | 'hybrid' | 'claude';
  estimatedResponseTime: number; // milliseconds
}

export class QueryRouter {
  private keywordPatterns: Map<string, RegExp[]>;
  private queryHistory: Map<string, QueryClassification>;
  private performanceMetrics: Map<QueryType, { avgTime: number; count: number }>;

  constructor() {
    this.keywordPatterns = this.initializePatterns();
    this.queryHistory = new Map();
    this.performanceMetrics = new Map();
    this.initializeMetrics();
  }

  private initializePatterns(): Map<string, RegExp[]> {
    const patterns = new Map<string, RegExp[]>();

    // Simple keyword patterns
    patterns.set('simple_keyword', [
      /^[\w\s]{1,20}$/i, // Single or few words
      /^(find|search|show|get)\s+[\w\s]+$/i,
      /^"[^"]{1,50}"$/i, // Exact phrase search
    ]);

    // Date-based patterns
    patterns.set('date_based', [
      /\b(today|yesterday|tomorrow)\b/i,
      /\b(this|last|next)\s+(week|month|year)\b/i,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
      /\b\d{4}-\d{2}-\d{2}\b/,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    ]);

    // Action item patterns
    patterns.set('action_item', [
      /\b(action items?|todo|task|reminder|follow up)\b/i,
      /\b(need to|must|should|have to|got to)\b/i,
      /\b(deadline|due date|by when)\b/i,
      /\bremind me\b/i,
    ]);

    // Summary patterns
    patterns.set('summary', [
      /\b(summar|overview|recap|brief|highlight|key point)\b/i,
      /\b(what happened|what was discussed|main topic)\b/i,
      /\b(meeting notes|conversation about)\b/i,
    ]);

    // Complex analytical patterns
    patterns.set('complex_analytical', [
      /\b(analy[sz]e|compare|contrast|evaluate|assess)\b/i,
      /\b(trend|pattern|insight|correlation)\b/i,
      /\b(how many|how often|frequency|statistics)\b/i,
      /\b(relationship between|impact of|effect on)\b/i,
    ]);

    return patterns;
  }

  private initializeMetrics(): void {
    for (const type of Object.values(QueryType)) {
      this.performanceMetrics.set(type, { avgTime: 0, count: 0 });
    }

    // Set initial estimates based on expected performance
    this.performanceMetrics.set(QueryType.SIMPLE_KEYWORD, { avgTime: 50, count: 0 });
    this.performanceMetrics.set(QueryType.DATE_BASED, { avgTime: 100, count: 0 });
    this.performanceMetrics.set(QueryType.SEMANTIC, { avgTime: 200, count: 0 });
    this.performanceMetrics.set(QueryType.ACTION_ITEM, { avgTime: 150, count: 0 });
    this.performanceMetrics.set(QueryType.SUMMARY, { avgTime: 300, count: 0 });
    this.performanceMetrics.set(QueryType.COMPLEX_ANALYTICAL, { avgTime: 2000, count: 0 });
  }

  async classifyQuery(query: string): Promise<QueryClassification> {
    const startTime = Date.now();

    // Check cache first
    const cached = this.queryHistory.get(query);
    if (cached) {
      logger.debug('Query classification cache hit', { query });
      return cached;
    }

    const classification = this.performClassification(query);

    // Cache the result
    this.queryHistory.set(query, classification);

    // Limit cache size
    if (this.queryHistory.size > 1000) {
      const firstKey = this.queryHistory.keys().next().value;
      if (firstKey) {
        this.queryHistory.delete(firstKey);
      }
    }

    const classificationTime = Date.now() - startTime;
    logger.debug('Query classified', {
      query,
      type: classification.type,
      strategy: classification.suggestedStrategy,
      time: classificationTime,
    });

    return classification;
  }

  private performClassification(query: string): QueryClassification {
    const scores = new Map<QueryType, number>();
    const extractedEntities: QueryClassification['extractedEntities'] = {};

    // Calculate scores for each query type
    for (const [type, patterns] of this.keywordPatterns) {
      let score = 0;
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          score += 1;
        }
      }
      scores.set(type as QueryType, score);
    }

    // Extract entities
    extractedEntities.keywords = this.extractKeywords(query);
    extractedEntities.dates = this.extractDates(query);
    extractedEntities.timeRanges = this.extractTimeRanges(query);
    extractedEntities.actions = this.extractActions(query);
    extractedEntities.topics = this.extractTopics(query);

    // Determine query type based on scores and query complexity
    let queryType = QueryType.SIMPLE_KEYWORD;
    let maxScore = 0;

    for (const [type, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        queryType = type;
      }
    }

    // Override based on query complexity
    const wordCount = query.split(/\s+/).length;
    if (wordCount > 15 || query.includes(' AND ') || query.includes(' OR ')) {
      queryType = QueryType.COMPLEX_ANALYTICAL;
    }

    // Determine strategy
    let strategy: QueryClassification['suggestedStrategy'] = 'fast';

    switch (queryType) {
      case QueryType.SIMPLE_KEYWORD:
        strategy = extractedEntities.keywords!.length <= 3 ? 'fast' : 'hybrid';
        break;
      case QueryType.DATE_BASED:
        strategy = 'fast';
        break;
      case QueryType.SEMANTIC:
        strategy = 'vector';
        break;
      case QueryType.ACTION_ITEM:
      case QueryType.SUMMARY:
        strategy = 'hybrid';
        break;
      case QueryType.COMPLEX_ANALYTICAL:
        strategy = 'claude';
        break;
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(queryType, scores, extractedEntities);

    // Get estimated response time
    const metrics = this.performanceMetrics.get(queryType)!;
    const estimatedResponseTime = metrics.avgTime || 100;

    return {
      type: queryType,
      confidence,
      extractedEntities,
      suggestedStrategy: strategy,
      estimatedResponseTime,
    };
  }

  private calculateConfidence(
    type: QueryType,
    scores: Map<QueryType, number>,
    entities: QueryClassification['extractedEntities']
  ): number {
    const typeScore = scores.get(type) || 0;
    const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);

    if (totalScore === 0) return 0.5;

    let confidence = typeScore / totalScore;

    // Boost confidence based on extracted entities
    if (type === QueryType.DATE_BASED && entities.dates && entities.dates.length > 0) {
      confidence = Math.min(confidence + 0.2, 1);
    }
    if (type === QueryType.ACTION_ITEM && entities.actions && entities.actions.length > 0) {
      confidence = Math.min(confidence + 0.2, 1);
    }

    return Math.round(confidence * 100) / 100;
  }

  private extractKeywords(query: string): string[] {
    // Remove common words and extract meaningful keywords
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
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    return [...new Set(words)];
  }

  private extractDates(query: string): Date[] {
    const dates: Date[] = [];
    const now = new Date();

    // Relative dates
    if (/\btoday\b/i.test(query)) {
      dates.push(new Date(now));
    }
    if (/\byesterday\b/i.test(query)) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      dates.push(yesterday);
    }
    if (/\btomorrow\b/i.test(query)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dates.push(tomorrow);
    }

    // ISO dates (YYYY-MM-DD)
    const isoMatches = query.match(/\b\d{4}-\d{2}-\d{2}\b/g);
    if (isoMatches) {
      for (const match of isoMatches) {
        const date = new Date(match);
        if (!isNaN(date.getTime())) {
          dates.push(date);
        }
      }
    }

    // US dates (MM/DD/YYYY)
    const usMatches = query.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g);
    if (usMatches) {
      for (const match of usMatches) {
        const date = new Date(match);
        if (!isNaN(date.getTime())) {
          dates.push(date);
        }
      }
    }

    return dates;
  }

  private extractTimeRanges(query: string): { start: Date; end: Date }[] {
    const ranges: { start: Date; end: Date }[] = [];
    const now = new Date();

    // This week
    if (/\bthis week\b/i.test(query)) {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      ranges.push({ start, end });
    }

    // Last week
    if (/\blast week\b/i.test(query)) {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay() - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      ranges.push({ start, end });
    }

    // This month
    if (/\bthis month\b/i.test(query)) {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      ranges.push({ start, end });
    }

    // Last month
    if (/\blast month\b/i.test(query)) {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      ranges.push({ start, end });
    }

    return ranges;
  }

  private extractActions(query: string): string[] {
    const actions: string[] = [];

    // Extract action items mentioned in the query
    const actionPatterns = [
      /(?:need to|must|should|have to|got to)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(?:remind me to|remember to)\s+(\w+(?:\s+\w+){0,3})/gi,
      /(?:action item:|todo:|task:)\s*([^,.;]+)/gi,
    ];

    for (const pattern of actionPatterns) {
      const matches = query.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          actions.push(match[1].trim());
        }
      }
    }

    return actions;
  }

  private extractTopics(query: string): string[] {
    const topics: string[] = [];

    // Extract topics using noun phrases and quoted strings
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      topics.push(...quotedMatches.map((m) => m.replace(/"/g, '')));
    }

    // Extract capitalized phrases (likely proper nouns/topics)
    const capitalizedMatches = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
    if (capitalizedMatches) {
      topics.push(...capitalizedMatches);
    }

    return [...new Set(topics)];
  }

  updatePerformanceMetrics(type: QueryType, responseTime: number): void {
    const metrics = this.performanceMetrics.get(type)!;
    const newCount = metrics.count + 1;
    const newAvg = (metrics.avgTime * metrics.count + responseTime) / newCount;

    this.performanceMetrics.set(type, {
      avgTime: Math.round(newAvg),
      count: newCount,
    });

    logger.debug('Updated performance metrics', { type, newAvg, count: newCount });
  }

  getPerformanceReport(): Record<QueryType, { avgTime: number; count: number }> {
    const report: Record<QueryType, { avgTime: number; count: number }> = {} as any;

    for (const [type, metrics] of this.performanceMetrics) {
      report[type] = { ...metrics };
    }

    return report;
  }

  clearCache(): void {
    this.queryHistory.clear();
    logger.info('Query router cache cleared');
  }
}
