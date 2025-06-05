import type { Lifelog } from './limitless.js';
import { convertUTCTimestampsToLocal } from '../utils/date.js';

/**
 * Extended Lifelog type for Phase 2 internal use
 * Maps the API response to a more convenient format
 */
export interface Phase2Lifelog extends Lifelog {
  content: string; // Extracted from markdown or contents
  createdAt: string; // ISO date string from startTime
  duration: number; // Duration in seconds
  headings?: string[]; // Extracted headings
}

/**
 * Convert API Lifelog to Phase2Lifelog
 */
export function toPhase2Lifelog(lifelog: Lifelog): Phase2Lifelog {
  // Extract content from markdown or contents
  let content = '';
  const headings: string[] = [];

  if (lifelog.markdown) {
    // Convert UTC timestamps in the markdown to local time
    content = convertUTCTimestampsToLocal(lifelog.markdown);
    // Extract headings from markdown
    const headingMatches = content.match(/^#{1,3}\s+(.+)$/gm);
    if (headingMatches) {
      headings.push(...headingMatches.map((h) => h.replace(/^#{1,3}\s+/, '')));
    }
  } else if (lifelog.contents) {
    // Build content from contents array
    const contentParts: string[] = [];
    const extractContent = (items: any[]): void => {
      for (const item of items) {
        if (item.content) {
          contentParts.push(item.content);
          if (item.type.startsWith('heading')) {
            headings.push(item.content);
          }
        }
        if (item.children) {
          extractContent(item.children);
        }
      }
    };
    extractContent(lifelog.contents);
    content = contentParts.join('\n\n');
  }

  // Calculate duration
  const startTime = new Date(lifelog.startTime);
  const endTime = new Date(lifelog.endTime);
  const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

  return {
    ...lifelog,
    content,
    createdAt: lifelog.startTime,
    duration,
    headings: headings.length > 0 ? headings : undefined,
  };
}
