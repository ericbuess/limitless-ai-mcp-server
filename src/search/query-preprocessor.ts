import {
  format,
  subDays,
  subWeeks,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { speakerEnhancer } from './speaker-attribution-enhancer.js';

export interface PreprocessedQuery {
  original: string;
  normalized: string;
  expandedQueries: string[];
  temporalInfo: {
    dates: string[];
    dateRanges: Array<{ start: string; end: string }>;
    relativeTime?: string;
  };
  entities: {
    people: string[];
    places: string[];
    topics: string[];
    actions: string[];
  };
  intent: QueryIntent;
  keywords: string[];
}

export enum QueryIntent {
  SEARCH = 'search',
  QUESTION = 'question',
  COMMAND = 'command',
  TEMPORAL_QUERY = 'temporal_query',
  PERSON_QUERY = 'person_query',
  ANALYTICAL = 'analytical',
}

interface SynonymMap {
  [key: string]: string[];
}

export class QueryPreprocessor {
  private synonymMap: SynonymMap = {
    // Meeting-related synonyms
    meeting: ['meeting', 'discussion', 'conversation', 'chat', 'talk', 'call', 'conference'],
    discuss: ['discuss', 'talk about', 'mentioned', 'conversation about', 'chat about'],

    // Action-related synonyms
    decide: ['decide', 'decided', 'decision', 'chose', 'selected', 'determined'],
    plan: ['plan', 'planning', 'planned', 'schedule', 'scheduled', 'organize'],
    review: ['review', 'reviewed', 'examine', 'check', 'look at', 'analyze'],

    // People-related synonyms
    team: ['team', 'group', 'colleagues', 'coworkers', 'staff'],
    client: ['client', 'customer', 'user', 'patron'],

    // Document-related synonyms
    document: ['document', 'file', 'report', 'paper', 'doc'],
    proposal: ['proposal', 'proposition', 'suggestion', 'plan', 'pitch'],
    budget: ['budget', 'financial plan', 'expenses', 'costs', 'spending'],

    // Time-related synonyms
    urgent: ['urgent', 'important', 'critical', 'asap', 'priority', 'immediate'],
    deadline: ['deadline', 'due date', 'due', 'by when', 'timeline'],
  };

  private temporalPatterns = [
    // Relative days
    { pattern: /\b(today|todays?)\b/gi, handler: () => format(new Date(), 'yyyy-MM-dd') },
    {
      pattern: /\b(yesterday|yesterdays?)\b/gi,
      handler: () => format(subDays(new Date(), 1), 'yyyy-MM-dd'),
    },
    {
      pattern: /\b(tomorrow|tomorrows?)\b/gi,
      handler: () => format(subDays(new Date(), -1), 'yyyy-MM-dd'),
    },

    // Relative weeks
    {
      pattern: /\bthis week\b/gi,
      handler: () => ({
        start: format(startOfWeek(new Date()), 'yyyy-MM-dd'),
        end: format(endOfWeek(new Date()), 'yyyy-MM-dd'),
      }),
    },
    {
      pattern: /\blast week\b/gi,
      handler: () => ({
        start: format(startOfWeek(subWeeks(new Date(), 1)), 'yyyy-MM-dd'),
        end: format(endOfWeek(subWeeks(new Date(), 1)), 'yyyy-MM-dd'),
      }),
    },

    // Relative months
    {
      pattern: /\bthis month\b/gi,
      handler: () => ({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      }),
    },
    {
      pattern: /\blast month\b/gi,
      handler: () => ({
        start: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'),
        end: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'),
      }),
    },

    // Days ago
    {
      pattern: /\b(\d+) days? ago\b/gi,
      handler: (match: RegExpMatchArray) => {
        const days = parseInt(match[1]);
        return format(subDays(new Date(), days), 'yyyy-MM-dd');
      },
    },

    // Last N days
    {
      pattern: /\blast (\d+) days?\b/gi,
      handler: (match: RegExpMatchArray) => {
        const days = parseInt(match[1]);
        return {
          start: format(subDays(new Date(), days), 'yyyy-MM-dd'),
          end: format(new Date(), 'yyyy-MM-dd'),
        };
      },
    },
  ];

  preprocess(query: string): PreprocessedQuery {
    const normalized = this.normalizeTemporalExpressions(query);
    const expandedQueries = this.expandQueryWithSynonyms(query);
    const intent = this.detectQueryIntent(query);
    const entities = this.extractNamedEntities(query);
    const keywords = this.extractKeywords(normalized);
    const temporalInfo = this.extractTemporalInfo(query);

    // Add speaker-enhanced query variations
    const speakerEnhancedQueries = speakerEnhancer.enhanceQuery(query);
    const allExpandedQueries = [...new Set([...expandedQueries, ...speakerEnhancedQueries])];

    return {
      original: query,
      normalized,
      expandedQueries: allExpandedQueries,
      temporalInfo,
      entities,
      intent,
      keywords,
    };
  }

  normalizeTemporalExpressions(query: string): string {
    let normalized = query;
    const dates: string[] = [];
    const dateRanges: Array<{ start: string; end: string }> = [];

    for (const { pattern, handler } of this.temporalPatterns) {
      normalized = normalized.replace(pattern, (match, ...args) => {
        const result = handler([match, ...args]);

        if (typeof result === 'string') {
          dates.push(result);
          return result;
        } else if (result && typeof result === 'object' && 'start' in result && 'end' in result) {
          dateRanges.push(result);
          return `${result.start} to ${result.end}`;
        }

        return match;
      });
    }

    return normalized;
  }

  expandQueryWithSynonyms(query: string): string[] {
    const words = query.toLowerCase().split(/\s+/);
    const expandedQueries = new Set<string>([query]);

    // Generate variations by replacing each word with synonyms
    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Check if this word has synonyms
      for (const [key, synonyms] of Object.entries(this.synonymMap)) {
        if (key === word || synonyms.includes(word)) {
          // Generate a variation for each synonym
          for (const synonym of synonyms) {
            if (synonym !== word) {
              const newWords = [...words];
              newWords[i] = synonym;
              expandedQueries.add(newWords.join(' '));
            }
          }
        }
      }
    }

    // Also generate variations with multiple synonym replacements (max 2 to avoid explosion)
    const synonymPositions: number[] = [];

    for (let i = 0; i < words.length; i++) {
      for (const [key, synonyms] of Object.entries(this.synonymMap)) {
        if (key === words[i] || synonyms.includes(words[i])) {
          synonymPositions.push(i);
          break;
        }
      }
    }

    // Generate variations with 2 synonym replacements
    if (synonymPositions.length >= 2) {
      for (let i = 0; i < synonymPositions.length - 1; i++) {
        for (let j = i + 1; j < synonymPositions.length; j++) {
          const pos1 = synonymPositions[i];
          const pos2 = synonymPositions[j];
          const word1 = words[pos1];
          const word2 = words[pos2];

          // Find synonyms for each word
          let synonyms1: string[] = [];
          let synonyms2: string[] = [];

          for (const [key, syns] of Object.entries(this.synonymMap)) {
            if (key === word1 || syns.includes(word1)) synonyms1 = syns;
            if (key === word2 || syns.includes(word2)) synonyms2 = syns;
          }

          // Generate combinations (limit to 3 synonyms each to avoid explosion)
          for (const syn1 of synonyms1.slice(0, 3)) {
            for (const syn2 of synonyms2.slice(0, 3)) {
              if (syn1 !== word1 || syn2 !== word2) {
                const newWords = [...words];
                newWords[pos1] = syn1;
                newWords[pos2] = syn2;
                expandedQueries.add(newWords.join(' '));
              }
            }
          }
        }
      }
    }

    return Array.from(expandedQueries);
  }

  detectQueryIntent(query: string): QueryIntent {
    // Question patterns
    if (/^(what|where|when|who|why|how|did|does|is|are|was|were)\b/i.test(query)) {
      return QueryIntent.QUESTION;
    }

    // Command patterns
    if (/^(find|show|list|get|search|look for|display)\b/i.test(query)) {
      return QueryIntent.COMMAND;
    }

    // Temporal focus
    if (/\b(today|yesterday|tomorrow|this week|last week|ago|recent)\b/i.test(query)) {
      return QueryIntent.TEMPORAL_QUERY;
    }

    // Person focus
    if (
      /\b(with|about|from|to)\s+[A-Z][a-z]+\b/.test(query) ||
      /\b[A-Z][a-z]+('s|s')?\s+(meeting|call|discussion|email)\b/.test(query)
    ) {
      return QueryIntent.PERSON_QUERY;
    }

    // Analytical patterns
    if (/\b(analyze|summary|insights|patterns|trends|statistics)\b/i.test(query)) {
      return QueryIntent.ANALYTICAL;
    }

    // Default to search
    return QueryIntent.SEARCH;
  }

  extractNamedEntities(query: string): PreprocessedQuery['entities'] {
    const entities = {
      people: [] as string[],
      places: [] as string[],
      topics: [] as string[],
      actions: [] as string[],
    };

    // Extract people (simple capitalized word heuristic)
    // Look for patterns like "with John", "John's meeting", "Sarah and Mike"
    const peoplePatterns = [
      /\b(?:with|from|to|about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\b/g,
      /\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\b/g,
    ];

    for (const pattern of peoplePatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        if (match[1] && !this.isCommonWord(match[1])) {
          entities.people.push(match[1]);
        }
        if (match[2] && !this.isCommonWord(match[2])) {
          entities.people.push(match[2]);
        }
      }
    }

    // Extract topics (noun phrases)
    const topicPatterns = [
      /\b(project|proposal|budget|report|presentation|document|plan|strategy|review)\b/gi,
      /\b(\w+\s+(?:project|proposal|meeting|discussion|review))\b/gi,
    ];

    for (const pattern of topicPatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        entities.topics.push(match[1].toLowerCase());
      }
    }

    // Extract actions
    const actionPatterns = [
      /\b(decide|decided|plan|planned|review|reviewed|discuss|discussed|schedule|scheduled)\b/gi,
      /\b(action item|follow up|todo|task|reminder)\b/gi,
    ];

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        entities.actions.push(match[1].toLowerCase());
      }
    }

    // Remove duplicates
    entities.people = [...new Set(entities.people)];
    entities.topics = [...new Set(entities.topics)];
    entities.actions = [...new Set(entities.actions)];

    return entities;
  }

  private extractKeywords(query: string): string[] {
    // Remove temporal expressions and common words
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
      'find',
      'show',
      'get',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    return [...new Set(words)];
  }

  private extractTemporalInfo(query: string): PreprocessedQuery['temporalInfo'] {
    const dates: string[] = [];
    const dateRanges: Array<{ start: string; end: string }> = [];
    let relativeTime: string | undefined;

    // Extract explicit dates (YYYY-MM-DD)
    const datePattern = /\b(\d{4}-\d{2}-\d{2})\b/g;
    let match;
    while ((match = datePattern.exec(query)) !== null) {
      dates.push(match[1]);
    }

    // Extract date ranges
    const rangePattern = /\b(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\b/g;
    while ((match = rangePattern.exec(query)) !== null) {
      dateRanges.push({ start: match[1], end: match[2] });
    }

    // Extract relative time expressions
    for (const { pattern } of this.temporalPatterns) {
      if (pattern.test(query)) {
        relativeTime = query.match(pattern)?.[0];
        break;
      }
    }

    return { dates, dateRanges, relativeTime };
  }

  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
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
      'The',
      'This',
      'That',
    ]);

    return commonWords.has(word);
  }
}
