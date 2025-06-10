/**
 * Query Decomposer
 *
 * Breaks down complex multi-part queries into executable sub-queries
 * while maintaining context between parts.
 */

import { logger } from '../utils/logger.js';
import { QueryIntent } from './query-preprocessor.js';

export interface SubQuery {
  id: string;
  text: string;
  type: SubQueryType;
  intent: QueryIntent;
  dependencies: string[]; // IDs of queries that must execute first
  context?: {
    referencesPreviousResults?: boolean;
    temporalContext?: string;
    entityContext?: string[];
  };
}

export enum SubQueryType {
  SEARCH = 'search',
  FILTER = 'filter',
  SUMMARIZE = 'summarize',
  COMPARE = 'compare',
  ANALYZE = 'analyze',
  EXTRACT = 'extract',
}

export interface DecomposedQuery {
  original: string;
  subQueries: SubQuery[];
  executionOrder: string[]; // Ordered list of sub-query IDs
  requiresContextualSummary: boolean;
  metadata: {
    complexity: number;
    estimatedExecutionTime: number;
  };
}

export class QueryDecomposer {
  // Patterns for identifying multi-part queries
  private multiPartPatterns = [
    // Conjunction patterns
    /\band\s+(?:also\s+)?(?:can you|could you|please|I'd like|show me|tell me|what)/gi,
    /\b(?:additionally|furthermore|moreover|also),?\s+/gi,
    /\b(?:plus|as well as|along with)\s+/gi,

    // Sequential patterns
    /\b(?:then|after that|subsequently|following that)\s+/gi,
    /\b(?:first|second|third|finally|lastly)\s+/gi,

    // Conditional patterns
    /\bif\s+.+?,\s*(?:then\s+)?(?:what|how|when|where)/gi,
    /\b(?:based on|given|considering)\s+.+?,\s*(?:what|how)/gi,

    // Question chains
    /\?.*?\?/g,
    /\?.*?\band\s+(?:what|how|when|where|who|why)/gi,
  ];

  // Patterns for identifying query relationships
  private relationshipPatterns = {
    causal: /\b(?:because|since|as|therefore|so|thus|hence)\b/gi,
    comparative: /\b(?:compare|versus|vs|differ|similar|like|unlike)\b/gi,
    temporal: /\b(?:before|after|during|while|when|then)\b/gi,
    conditional: /\b(?:if|unless|provided|assuming|given)\b/gi,
  };

  /**
   * Decompose a complex query into sub-queries
   */
  decompose(query: string): DecomposedQuery {
    // Check if this is actually a complex query
    if (!this.isComplexQuery(query)) {
      return this.createSimpleDecomposition(query);
    }

    // Split the query into potential parts
    const parts = this.splitQuery(query);

    // Create sub-queries from parts
    const subQueries = this.createSubQueries(parts, query);

    // Determine execution order based on dependencies
    const executionOrder = this.determineExecutionOrder(subQueries);

    // Calculate metadata
    const complexity = this.calculateComplexity(subQueries);
    const estimatedTime = this.estimateExecutionTime(subQueries);
    const requiresSummary = this.requiresContextualSummary(subQueries);

    const result: DecomposedQuery = {
      original: query,
      subQueries,
      executionOrder,
      requiresContextualSummary: requiresSummary,
      metadata: {
        complexity,
        estimatedExecutionTime: estimatedTime,
      },
    };

    logger.debug('Query decomposition complete', {
      original: query,
      parts: subQueries.length,
      complexity,
      requiresSummary,
    });

    return result;
  }

  /**
   * Check if a query is complex enough to need decomposition
   */
  private isComplexQuery(query: string): boolean {
    // Check length
    if (query.length < 50) {
      return false;
    }

    // Check for multi-part patterns
    for (const pattern of this.multiPartPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(query)) {
        return true;
      }
    }

    // Check for multiple questions
    const questionMarks = (query.match(/\?/g) || []).length;
    if (questionMarks > 1) {
      return true;
    }

    // Check for relationship words
    let relationshipCount = 0;
    for (const patterns of Object.values(this.relationshipPatterns)) {
      patterns.lastIndex = 0;
      if (patterns.test(query)) {
        relationshipCount++;
        if (relationshipCount >= 2) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Create a simple decomposition for non-complex queries
   */
  private createSimpleDecomposition(query: string): DecomposedQuery {
    const subQuery: SubQuery = {
      id: 'q1',
      text: query,
      type: SubQueryType.SEARCH,
      intent: QueryIntent.SEARCH,
      dependencies: [],
    };

    return {
      original: query,
      subQueries: [subQuery],
      executionOrder: ['q1'],
      requiresContextualSummary: false,
      metadata: {
        complexity: 1,
        estimatedExecutionTime: 1000,
      },
    };
  }

  /**
   * Split query into logical parts
   */
  private splitQuery(query: string): string[] {
    const parts: string[] = [];

    // First, try splitting by question marks
    if (query.includes('?')) {
      const questions = query.split(/\?/).filter((p) => p.trim());
      for (const q of questions) {
        if (q.trim()) {
          parts.push(q.trim() + '?');
        }
      }
      return parts;
    }

    // Try splitting by conjunctions
    const conjunctionSplit = query.split(/\b(?:and|then|also|additionally|furthermore)\b/i);
    if (conjunctionSplit.length > 1) {
      return conjunctionSplit.map((p) => p.trim()).filter((p) => p.length > 10);
    }

    // Try splitting by punctuation
    const punctuationSplit = query.split(/[.;,]/).filter((p) => p.trim().length > 10);
    if (punctuationSplit.length > 1) {
      return punctuationSplit.map((p) => p.trim());
    }

    // If no clear splits, look for topic changes
    return this.splitByTopicChange(query);
  }

  /**
   * Split by detecting topic changes
   */
  private splitByTopicChange(query: string): string[] {
    const sentences = query.match(/[^.!?]+[.!?]+/g) || [query];
    const parts: string[] = [];
    let currentPart = '';
    let lastTopic = '';

    for (const sentence of sentences) {
      // Extract main topic words
      const topicWords = this.extractTopicWords(sentence);
      const currentTopic = topicWords.join(' ');

      // Check if topic changed significantly
      if (lastTopic && this.topicSimilarity(lastTopic, currentTopic) < 0.3) {
        if (currentPart) {
          parts.push(currentPart.trim());
          currentPart = sentence;
        }
      } else {
        currentPart += ' ' + sentence;
      }

      lastTopic = currentTopic;
    }

    if (currentPart) {
      parts.push(currentPart.trim());
    }

    return parts.length > 1 ? parts : [query];
  }

  /**
   * Create sub-queries from parts
   */
  private createSubQueries(parts: string[], originalQuery: string): SubQuery[] {
    const subQueries: SubQuery[] = [];
    const context = this.extractGlobalContext(originalQuery);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const id = `q${i + 1}`;

      const subQuery: SubQuery = {
        id,
        text: part,
        type: this.determineSubQueryType(part, i, parts),
        intent: this.determineIntent(part),
        dependencies: this.determineDependencies(part, i, parts),
        context: {
          referencesPreviousResults: this.referencesPrevious(part),
          temporalContext: context.temporal,
          entityContext: context.entities,
        },
      };

      subQueries.push(subQuery);
    }

    return subQueries;
  }

  /**
   * Determine the type of sub-query
   */
  private determineSubQueryType(part: string, index: number, _allParts: string[]): SubQueryType {
    const lowerPart = part.toLowerCase();

    // Check for specific patterns
    if (lowerPart.includes('compare') || lowerPart.includes('versus')) {
      return SubQueryType.COMPARE;
    }

    if (lowerPart.includes('summarize') || lowerPart.includes('recap')) {
      return SubQueryType.SUMMARIZE;
    }

    if (lowerPart.includes('analyze') || lowerPart.includes('insights')) {
      return SubQueryType.ANALYZE;
    }

    if (
      lowerPart.includes('extract') ||
      lowerPart.includes('action items') ||
      lowerPart.includes('next steps')
    ) {
      return SubQueryType.EXTRACT;
    }

    if (index > 0 && this.isFilterQuery(part)) {
      return SubQueryType.FILTER;
    }

    return SubQueryType.SEARCH;
  }

  /**
   * Determine query intent
   */
  private determineIntent(query: string): QueryIntent {
    if (/^(what|where|when|who|why|how|did|does|is|are|was|were)\b/i.test(query)) {
      return QueryIntent.QUESTION;
    }

    if (/\b(analyze|summary|insights|patterns|trends)\b/i.test(query)) {
      return QueryIntent.ANALYTICAL;
    }

    if (/\b(with|about|from|to)\s+[A-Z][a-z]+\b/.test(query)) {
      return QueryIntent.PERSON_QUERY;
    }

    if (/\b(today|yesterday|tomorrow|week|month|ago)\b/i.test(query)) {
      return QueryIntent.TEMPORAL_QUERY;
    }

    return QueryIntent.SEARCH;
  }

  /**
   * Determine dependencies between sub-queries
   */
  private determineDependencies(part: string, index: number, _allParts: string[]): string[] {
    const dependencies: string[] = [];

    // First query has no dependencies
    if (index === 0) {
      return dependencies;
    }

    // Check if this query references previous results
    if (this.referencesPrevious(part)) {
      // Depends on the immediately previous query
      dependencies.push(`q${index}`);
    }

    // Check for explicit references
    const references = part.match(/\b(?:that|those|these|this|it|them)\b/gi);
    if (references && references.length > 0) {
      // Likely depends on previous query
      dependencies.push(`q${index}`);
    }

    // Check for conditional dependencies
    if (part.match(/\bif\s+.+?\s+then\b/i)) {
      // Depends on the condition being evaluated first
      dependencies.push(`q${index}`);
    }

    return dependencies;
  }

  /**
   * Determine execution order based on dependencies
   */
  private determineExecutionOrder(subQueries: SubQuery[]): string[] {
    const order: string[] = [];
    const executed = new Set<string>();
    const maxIterations = subQueries.length * 2;
    let iterations = 0;

    while (order.length < subQueries.length && iterations < maxIterations) {
      iterations++;

      for (const query of subQueries) {
        if (executed.has(query.id)) continue;

        // Check if all dependencies are satisfied
        const dependenciesSatisfied = query.dependencies.every((dep) => executed.has(dep));

        if (dependenciesSatisfied) {
          order.push(query.id);
          executed.add(query.id);
        }
      }
    }

    // If we couldn't resolve all dependencies, add remaining in order
    for (const query of subQueries) {
      if (!executed.has(query.id)) {
        order.push(query.id);
      }
    }

    return order;
  }

  /**
   * Extract global context from the original query
   */
  private extractGlobalContext(query: string): { temporal?: string; entities: string[] } {
    const context: { temporal?: string; entities: string[] } = {
      entities: [],
    };

    // Extract temporal context
    const temporalMatch = query.match(
      /\b(today|yesterday|tomorrow|last\s+week|this\s+week|next\s+week|last\s+month)\b/i
    );
    if (temporalMatch) {
      context.temporal = temporalMatch[1];
    }

    // Extract entity names
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    let match;
    while ((match = entityPattern.exec(query)) !== null) {
      if (!this.isCommonWord(match[1])) {
        context.entities.push(match[1]);
      }
    }

    return context;
  }

  /**
   * Check if a query references previous results
   */
  private referencesPrevious(query: string): boolean {
    const referencePatterns = [
      /\b(?:that|those|these|this|it|them|their|its)\b/i,
      /\b(?:the same|similar|related|associated)\b/i,
      /\b(?:from|in|within)\s+(?:the|those|these)\s+(?:results|findings|documents)\b/i,
      /\b(?:based on|according to|from)\s+(?:what|the)\b/i,
    ];

    for (const pattern of referencePatterns) {
      if (pattern.test(query)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if this is a filter query
   */
  private isFilterQuery(query: string): boolean {
    const filterPatterns = [
      /\b(?:only|just|specifically|especially)\s+(?:the|those|ones)\b/i,
      /\b(?:filter|narrow|limit|restrict)\s+(?:to|by)\b/i,
      /\b(?:from|within|among)\s+(?:these|those|the)\s+results\b/i,
    ];

    for (const pattern of filterPatterns) {
      if (pattern.test(query)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate query complexity
   */
  private calculateComplexity(subQueries: SubQuery[]): number {
    let complexity = subQueries.length;

    // Add complexity for dependencies
    for (const query of subQueries) {
      complexity += query.dependencies.length * 0.5;
    }

    // Add complexity for certain query types
    for (const query of subQueries) {
      if (query.type === SubQueryType.ANALYZE || query.type === SubQueryType.COMPARE) {
        complexity += 1;
      }
    }

    return Math.min(complexity, 10); // Cap at 10
  }

  /**
   * Estimate execution time
   */
  private estimateExecutionTime(subQueries: SubQuery[]): number {
    let time = 0;

    for (const query of subQueries) {
      switch (query.type) {
        case SubQueryType.SEARCH:
          time += 500;
          break;
        case SubQueryType.FILTER:
          time += 200;
          break;
        case SubQueryType.SUMMARIZE:
          time += 1000;
          break;
        case SubQueryType.COMPARE:
          time += 1500;
          break;
        case SubQueryType.ANALYZE:
          time += 2000;
          break;
        case SubQueryType.EXTRACT:
          time += 800;
          break;
      }
    }

    return time;
  }

  /**
   * Determine if results need contextual summary
   */
  private requiresContextualSummary(subQueries: SubQuery[]): boolean {
    // Multiple analytical queries need summary
    const analyticalCount = subQueries.filter((q) =>
      [SubQueryType.ANALYZE, SubQueryType.COMPARE, SubQueryType.SUMMARIZE].includes(q.type)
    ).length;

    if (analyticalCount >= 2) {
      return true;
    }

    // Complex dependency chains need summary
    const maxDependencyDepth = Math.max(...subQueries.map((q) => q.dependencies.length));
    if (maxDependencyDepth >= 2) {
      return true;
    }

    // Many sub-queries need summary
    if (subQueries.length >= 4) {
      return true;
    }

    return false;
  }

  /**
   * Extract topic words from text
   */
  private extractTopicWords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
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
      'about',
      'as',
      'is',
      'was',
      'are',
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
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'we',
      'they',
      'he',
      'she',
      'it',
      'me',
      'him',
      'her',
    ]);

    return words.filter((word) => word.length > 3 && !stopWords.has(word) && /^[a-z]+$/.test(word));
  }

  /**
   * Calculate topic similarity
   */
  private topicSimilarity(topic1: string, topic2: string): number {
    const words1 = new Set(topic1.split(' '));
    const words2 = new Set(topic2.split(' '));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Check if word is too common
   */
  private isCommonWord(word: string): boolean {
    const common = new Set([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]);
    return common.has(word);
  }
}

// Singleton instance
export const queryDecomposer = new QueryDecomposer();
