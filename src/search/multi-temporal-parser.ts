/**
 * Multi-Temporal Query Parser
 *
 * Handles queries with multiple time references like:
 * "I met with Eric B last week and we're meeting again today"
 */

import { logger } from '../utils/logger.js';

export interface TemporalReference {
  text: string; // Original text (e.g., "last week", "today")
  type: 'relative' | 'absolute' | 'range';
  startDate: Date;
  endDate: Date;
  confidence: number;
}

export interface MultiTemporalResult {
  references: TemporalReference[];
  hasMultiple: boolean;
  primaryTimeframe?: TemporalReference; // The main timeframe for the query
  secondaryTimeframes: TemporalReference[];
}

export class MultiTemporalParser {
  private readonly now: Date;

  constructor(referenceDate?: Date) {
    this.now = referenceDate || new Date();
  }

  /**
   * Parse multiple temporal references from a query
   */
  parse(query: string): MultiTemporalResult {
    const references: TemporalReference[] = [];

    // Pattern for relative time expressions
    const relativePatterns = [
      { pattern: /\btoday\b/gi, handler: () => this.getToday() },
      { pattern: /\byesterday\b/gi, handler: () => this.getYesterday() },
      { pattern: /\btomorrow\b/gi, handler: () => this.getTomorrow() },
      { pattern: /\bthis week\b/gi, handler: () => this.getThisWeek() },
      { pattern: /\blast week\b/gi, handler: () => this.getLastWeek() },
      { pattern: /\bnext week\b/gi, handler: () => this.getNextWeek() },
      { pattern: /\bthis month\b/gi, handler: () => this.getThisMonth() },
      { pattern: /\blast month\b/gi, handler: () => this.getLastMonth() },
      {
        pattern: /\b(\d+) days? ago\b/gi,
        handler: (match: RegExpMatchArray) => this.getDaysAgo(parseInt(match[1])),
      },
      {
        pattern: /\b(\d+) weeks? ago\b/gi,
        handler: (match: RegExpMatchArray) => this.getWeeksAgo(parseInt(match[1])),
      },
      {
        pattern: /\blast (\w+day)\b/gi,
        handler: (match: RegExpMatchArray) => this.getLastWeekday(match[1]),
      },
      {
        pattern: /\bthis (\w+day)\b/gi,
        handler: (match: RegExpMatchArray) => this.getThisWeekday(match[1]),
      },
    ];

    // Extract all relative time references
    for (const { pattern, handler } of relativePatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const result = handler(match);
        if (result) {
          references.push({
            text: match[0],
            type: 'relative',
            ...result,
            confidence: 0.9,
          });
        }
      }
    }

    // Pattern for absolute dates
    const absolutePatterns = [
      // MM/DD/YYYY or MM-DD-YYYY
      /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/g,
      // Month DD, YYYY
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})?\b/gi,
      // DD Month YYYY
      /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})?\b/gi,
    ];

    // Extract absolute dates
    for (const pattern of absolutePatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const dateResult = this.parseAbsoluteDate(match);
        if (dateResult) {
          references.push({
            text: match[0],
            type: 'absolute',
            ...dateResult,
            confidence: 0.95,
          });
        }
      }
    }

    // Sort by position in query (maintain order)
    references.sort((a, b) => {
      const posA = query.toLowerCase().indexOf(a.text.toLowerCase());
      const posB = query.toLowerCase().indexOf(b.text.toLowerCase());
      return posA - posB;
    });

    // Deduplicate overlapping references
    const deduped = this.deduplicateReferences(references, query);

    // Determine primary and secondary timeframes
    const result: MultiTemporalResult = {
      references: deduped,
      hasMultiple: deduped.length > 1,
      primaryTimeframe: deduped[0], // First mentioned is primary
      secondaryTimeframes: deduped.slice(1),
    };

    logger.debug('Multi-temporal parse result', {
      query,
      referenceCount: result.references.length,
      primary: result.primaryTimeframe?.text,
      secondary: result.secondaryTimeframes.map((r) => r.text),
    });

    return result;
  }

  private getToday(): { startDate: Date; endDate: Date } {
    const start = new Date(this.now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(this.now);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  private getYesterday(): { startDate: Date; endDate: Date } {
    const start = new Date(this.now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  private getTomorrow(): { startDate: Date; endDate: Date } {
    const start = new Date(this.now);
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  private getThisWeek(): { startDate: Date; endDate: Date } {
    const start = new Date(this.now);
    const dayOfWeek = start.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday start
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { startDate: start, endDate: end };
  }

  private getLastWeek(): { startDate: Date; endDate: Date } {
    const thisWeek = this.getThisWeek();
    const start = new Date(thisWeek.startDate);
    start.setDate(start.getDate() - 7);
    const end = new Date(thisWeek.endDate);
    end.setDate(end.getDate() - 7);
    return { startDate: start, endDate: end };
  }

  private getNextWeek(): { startDate: Date; endDate: Date } {
    const thisWeek = this.getThisWeek();
    const start = new Date(thisWeek.startDate);
    start.setDate(start.getDate() + 7);
    const end = new Date(thisWeek.endDate);
    end.setDate(end.getDate() + 7);
    return { startDate: start, endDate: end };
  }

  private getThisMonth(): { startDate: Date; endDate: Date } {
    const start = new Date(this.now.getFullYear(), this.now.getMonth(), 1);
    const end = new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  private getLastMonth(): { startDate: Date; endDate: Date } {
    const start = new Date(this.now.getFullYear(), this.now.getMonth() - 1, 1);
    const end = new Date(this.now.getFullYear(), this.now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  private getDaysAgo(days: number): { startDate: Date; endDate: Date } {
    const date = new Date(this.now);
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { startDate: date, endDate: end };
  }

  private getWeeksAgo(weeks: number): { startDate: Date; endDate: Date } {
    const date = new Date(this.now);
    date.setDate(date.getDate() - weeks * 7);
    // Get the week containing this date
    const dayOfWeek = date.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { startDate: date, endDate: end };
  }

  private getLastWeekday(weekday: string): { startDate: Date; endDate: Date } | null {
    const targetDay = this.parseWeekday(weekday);
    if (targetDay === -1) return null;

    const date = new Date(this.now);
    const currentDay = date.getDay();

    // Calculate days to go back
    let daysBack = currentDay - targetDay;
    if (daysBack <= 0) daysBack += 7;

    date.setDate(date.getDate() - daysBack);
    date.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return { startDate: date, endDate: end };
  }

  private getThisWeekday(weekday: string): { startDate: Date; endDate: Date } | null {
    const targetDay = this.parseWeekday(weekday);
    if (targetDay === -1) return null;

    const date = new Date(this.now);
    const currentDay = date.getDay();

    // Calculate days to target within this week
    let daysForward = targetDay - currentDay;
    if (daysForward < -3) daysForward += 7; // If more than 3 days ago, assume next week
    if (daysForward > 3) daysForward -= 7; // If more than 3 days ahead, assume last week

    date.setDate(date.getDate() + daysForward);
    date.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return { startDate: date, endDate: end };
  }

  private parseWeekday(weekday: string): number {
    const days: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    return days[weekday.toLowerCase()] ?? -1;
  }

  private parseAbsoluteDate(match: RegExpMatchArray): { startDate: Date; endDate: Date } | null {
    try {
      let date: Date;

      if (match[0].includes('/') || match[0].includes('-')) {
        // MM/DD/YYYY format
        const month = parseInt(match[1]) - 1;
        const day = parseInt(match[2]);
        const year = parseInt(match[3]) || this.now.getFullYear();
        date = new Date(year, month, day);
      } else {
        // Month name format
        const monthNames: Record<string, number> = {
          january: 0,
          february: 1,
          march: 2,
          april: 3,
          may: 4,
          june: 5,
          july: 6,
          august: 7,
          september: 8,
          october: 9,
          november: 10,
          december: 11,
        };

        let month: number, day: number, year: number;

        if (match[1] && !isNaN(parseInt(match[1]))) {
          // DD Month format
          day = parseInt(match[1]);
          month = monthNames[match[2].toLowerCase()];
          year = match[3] ? parseInt(match[3]) : this.now.getFullYear();
        } else {
          // Month DD format
          month = monthNames[match[1].toLowerCase()];
          day = parseInt(match[2]);
          year = match[3] ? parseInt(match[3]) : this.now.getFullYear();
        }

        date = new Date(year, month, day);
      }

      if (isNaN(date.getTime())) return null;

      date.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      return { startDate: date, endDate: end };
    } catch (error) {
      logger.warn('Failed to parse absolute date', { match: match[0], error });
      return null;
    }
  }

  private deduplicateReferences(
    references: TemporalReference[],
    query: string
  ): TemporalReference[] {
    if (references.length <= 1) return references;

    const deduped: TemporalReference[] = [];
    const queryLower = query.toLowerCase();

    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      let isOverlapping = false;

      // Check if this reference overlaps with any already added
      for (const existing of deduped) {
        const refPos = queryLower.indexOf(ref.text.toLowerCase());
        const existingPos = queryLower.indexOf(existing.text.toLowerCase());

        // Check if one is contained within the other
        if (refPos >= existingPos && refPos < existingPos + existing.text.length) {
          isOverlapping = true;
          break;
        }
        if (existingPos >= refPos && existingPos < refPos + ref.text.length) {
          // Current reference contains existing, replace if higher confidence
          if (ref.confidence > existing.confidence) {
            const index = deduped.indexOf(existing);
            deduped[index] = ref;
          }
          isOverlapping = true;
          break;
        }
      }

      if (!isOverlapping) {
        deduped.push(ref);
      }
    }

    return deduped;
  }

  /**
   * Get all date ranges to search for a multi-temporal query
   */
  getSearchDateRanges(result: MultiTemporalResult): Array<{ start: Date; end: Date }> {
    return result.references.map((ref) => ({
      start: ref.startDate,
      end: ref.endDate,
    }));
  }
}
