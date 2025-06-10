/**
 * Meeting Summary Extractor
 *
 * Extracts structured meeting information from lifelogs including:
 * - Participants and their contributions
 * - Main discussion topics
 * - Action items and owners
 * - Decisions made
 * - Next steps
 */

import { logger } from '../utils/logger.js';
import { Phase2Lifelog } from '../types/phase2.js';

export interface ActionItem {
  description: string;
  owner?: string;
  deadline?: string;
  confidence: number;
}

export interface MeetingSummary {
  participants: string[];
  mainTopics: string[];
  keyPoints: string[];
  actionItems: ActionItem[];
  decisions: string[];
  questions: string[];
  nextSteps: string[];
  metadata: {
    confidence: number;
    extractedAt: Date;
    lifelogId: string;
  };
}

export class MeetingSummaryExtractor {
  // Action item patterns
  private actionPatterns = [
    /\b(?:I|we|you|they?)\s+(?:will|should|need to|must|have to|got to|ought to)\s+(.+?)(?:\.|$)/gi,
    /\b(?:action items?|todo|follow ups?):\s*(.+?)(?:\.|$)/gi,
    /\b(?:next steps?):\s*(.+?)(?:\.|$)/gi,
    /\b(?:deadline|due|by)\s+(\w+\s+\d+|\d+\s+\w+|tomorrow|next week|end of day)/gi,
    /\btake\s+(?:the\s+)?action\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
    /\b(?:assigned|assign)\s+to\s+(\w+)\s*:?\s*(.+?)(?:\.|$)/gi,
  ];

  // Decision patterns
  private decisionPatterns = [
    /\b(?:we|they?)\s+(?:decided|agreed|concluded|determined|resolved)\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
    /\b(?:decision|agreement|conclusion):\s*(.+?)(?:\.|$)/gi,
    /\bit['']s\s+(?:been\s+)?(?:decided|agreed)\s+(?:that\s+)?(.+?)(?:\.|$)/gi,
    /\b(?:final|the)\s+decision\s+(?:is|was)\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
    /\bapproved\s+(.+?)(?:\.|$)/gi,
  ];

  // Topic patterns
  private topicPatterns = [
    /\b(?:discussed|talked about|reviewed|covered|went over)\s+(.+?)(?:\.|$)/gi,
    /\b(?:topic|subject|agenda item):\s*(.+?)(?:\.|$)/gi,
    /\b(?:meeting|discussion|conversation)\s+about\s+(.+?)(?:\.|$)/gi,
    /\bregarding\s+(.+?),?\s+(?:we|they|I)/gi,
    /\b(?:presented|presenting|presentation)\s+(?:on|about)\s+(.+?)(?:\.|$)/gi,
  ];

  // Question patterns
  private questionPatterns = [
    /\b(?:asked|wondered|questioned|inquired)\s+(?:about\s+)?(.+?)(?:\?|\.|$)/gi,
    /\b(?:question|clarification):\s*(.+?)(?:\?|\.|$)/gi,
    /\bdo(?:es)?\s+(?:anyone|someone|we)\s+know\s+(.+?)(?:\?|\.|$)/gi,
    /\bwhat\s+(?:about|if)\s+(.+?)(?:\?|\.|$)/gi,
    /\bhow\s+(?:do|does|will|would|should)\s+(.+?)(?:\?|\.|$)/gi,
  ];

  /**
   * Extract meeting summary from a lifelog
   */
  extractSummary(lifelog: Phase2Lifelog): MeetingSummary | null {
    const content = lifelog.content || '';

    // Check if this looks like a meeting/discussion
    if (!this.isMeetingContent(content)) {
      return null;
    }

    const summary: MeetingSummary = {
      participants: this.extractParticipants(content),
      mainTopics: this.extractTopics(content),
      keyPoints: this.extractKeyPoints(content),
      actionItems: this.extractActionItems(content),
      decisions: this.extractDecisions(content),
      questions: this.extractQuestions(content),
      nextSteps: this.extractNextSteps(content),
      metadata: {
        confidence: 0,
        extractedAt: new Date(),
        lifelogId: lifelog.id,
      },
    };

    // Calculate confidence based on how much we extracted
    const extractedCount =
      summary.participants.length +
      summary.mainTopics.length +
      summary.actionItems.length +
      summary.decisions.length;

    summary.metadata.confidence = Math.min(extractedCount / 10, 1.0);

    // Only return if we found meaningful content
    if (extractedCount < 2) {
      return null;
    }

    logger.debug('Extracted meeting summary', {
      lifelogId: lifelog.id,
      participants: summary.participants.length,
      topics: summary.mainTopics.length,
      actionItems: summary.actionItems.length,
      decisions: summary.decisions.length,
      confidence: summary.metadata.confidence,
    });

    return summary;
  }

  /**
   * Check if content appears to be meeting-related
   */
  private isMeetingContent(content: string): boolean {
    const meetingIndicators = [
      /\bmeeting\b/i,
      /\bdiscussion\b/i,
      /\bconversation\b/i,
      /\btalked?\s+(?:with|to|about)\b/i,
      /\bagenda\b/i,
      /\baction items?\b/i,
      /\bnext steps?\b/i,
      /\bdecided\b/i,
      /\bagreed\b/i,
      /\breviewed\b/i,
      /\bpresented\b/i,
    ];

    let indicatorCount = 0;
    for (const pattern of meetingIndicators) {
      if (pattern.test(content)) {
        indicatorCount++;
        if (indicatorCount >= 2) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extract participants from content
   */
  private extractParticipants(content: string): string[] {
    const participants = new Set<string>();

    // Look for speaker patterns
    const speakerPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*:/gm;
    let match;
    while ((match = speakerPattern.exec(content)) !== null) {
      if (!this.isCommonWord(match[1])) {
        participants.add(match[1]);
      }
    }

    // Look for "with X" patterns
    const withPattern = /\b(?:with|joined by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    while ((match = withPattern.exec(content)) !== null) {
      if (!this.isCommonWord(match[1])) {
        participants.add(match[1]);
      }
    }

    // Look for "X said/mentioned" patterns
    const saidPattern =
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|mentioned|suggested|proposed|asked)\b/g;
    while ((match = saidPattern.exec(content)) !== null) {
      if (!this.isCommonWord(match[1])) {
        participants.add(match[1]);
      }
    }

    return Array.from(participants);
  }

  /**
   * Extract main topics discussed
   */
  private extractTopics(content: string): string[] {
    const topics = new Set<string>();

    for (const pattern of this.topicPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const topic = this.cleanExtractedText(match[1]);
        if (topic && topic.length > 10 && topic.length < 100) {
          topics.add(topic);
        }
      }
    }

    return Array.from(topics);
  }

  /**
   * Extract key points (important statements)
   */
  private extractKeyPoints(content: string): string[] {
    const keyPoints: string[] = [];

    // Split into sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];

    for (const sentence of sentences) {
      // Check for importance indicators
      if (
        sentence.match(/\b(?:important|critical|key|main|primary|essential|significant)\b/i) ||
        sentence.match(/\b(?:point|takeaway|highlight|conclusion)\b/i) ||
        sentence.match(/\b(?:remember|note|keep in mind)\b/i)
      ) {
        const cleaned = this.cleanExtractedText(sentence);
        if (cleaned && cleaned.length > 20) {
          keyPoints.push(cleaned);
        }
      }
    }

    return keyPoints.slice(0, 5); // Limit to top 5
  }

  /**
   * Extract action items
   */
  private extractActionItems(content: string): ActionItem[] {
    const actionItems: ActionItem[] = [];
    const seen = new Set<string>();

    for (const pattern of this.actionPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const description = this.cleanExtractedText(match[1] || match[2] || match[0]);
        if (description && description.length > 10 && !seen.has(description)) {
          seen.add(description);

          const actionItem: ActionItem = {
            description,
            confidence: 0.7,
          };

          // Try to extract owner
          const ownerMatch = description.match(/\b(?:I|we|you|[A-Z][a-z]+)\b/);
          if (ownerMatch) {
            actionItem.owner = ownerMatch[0];
          }

          // Try to extract deadline
          const deadlineMatch = description.match(/\b(?:by|before|until)\s+(.+?)(?:\.|,|$)/i);
          if (deadlineMatch) {
            actionItem.deadline = deadlineMatch[1];
          }

          actionItems.push(actionItem);
        }
      }
    }

    return actionItems;
  }

  /**
   * Extract decisions made
   */
  private extractDecisions(content: string): string[] {
    const decisions = new Set<string>();

    for (const pattern of this.decisionPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const decision = this.cleanExtractedText(match[1]);
        if (decision && decision.length > 10 && decision.length < 150) {
          decisions.add(decision);
        }
      }
    }

    return Array.from(decisions);
  }

  /**
   * Extract questions asked
   */
  private extractQuestions(content: string): string[] {
    const questions = new Set<string>();

    for (const pattern of this.questionPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const question = this.cleanExtractedText(match[1] || match[0]);
        if (question && question.length > 10) {
          questions.add(question);
        }
      }
    }

    // Also look for literal questions
    const literalQuestions = content.match(/[^.!?]*\?/g) || [];
    for (const q of literalQuestions) {
      const cleaned = this.cleanExtractedText(q);
      if (cleaned && cleaned.length > 10) {
        questions.add(cleaned);
      }
    }

    return Array.from(questions).slice(0, 5); // Limit to top 5
  }

  /**
   * Extract next steps (similar to action items but more forward-looking)
   */
  private extractNextSteps(content: string): string[] {
    const nextSteps = new Set<string>();

    // Look for explicit next steps sections
    const nextStepsSection = content.match(/\bnext steps?:?\s*([^.]+(?:\.[^.]+)*)/i);
    if (nextStepsSection) {
      const steps = nextStepsSection[1].split(/[;,.]/).filter((s) => s.trim());
      steps.forEach((step) => {
        const cleaned = this.cleanExtractedText(step);
        if (cleaned) {
          nextSteps.add(cleaned);
        }
      });
    }

    // Look for future-oriented statements
    const futurePattern = /\b(?:will|going to|plan to|planning|scheduled?)\s+(.+?)(?:\.|$)/gi;
    let match;
    while ((match = futurePattern.exec(content)) !== null) {
      const step = this.cleanExtractedText(match[1]);
      if (step && step.length > 10 && step.length < 100) {
        nextSteps.add(step);
      }
    }

    return Array.from(nextSteps).slice(0, 5);
  }

  /**
   * Clean extracted text
   */
  private cleanExtractedText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[,.\s]+|[,.\s]+$/g, '')
      .replace(/\b(?:um|uh|like|you know)\b/gi, '')
      .trim();
  }

  /**
   * Check if a word is too common to be a participant name
   */
  private isCommonWord(word: string): boolean {
    const common = new Set([
      'Unknown',
      'Speaker',
      'Person',
      'Meeting',
      'Discussion',
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

  /**
   * Format summary for natural language output
   */
  formatSummaryAsText(summary: MeetingSummary): string {
    const parts: string[] = [];

    if (summary.participants.length > 0) {
      parts.push(`Participants: ${summary.participants.join(', ')}`);
    }

    if (summary.mainTopics.length > 0) {
      parts.push(`\nMain topics discussed:\n${summary.mainTopics.map((t) => `• ${t}`).join('\n')}`);
    }

    if (summary.keyPoints.length > 0) {
      parts.push(`\nKey points:\n${summary.keyPoints.map((p) => `• ${p}`).join('\n')}`);
    }

    if (summary.decisions.length > 0) {
      parts.push(`\nDecisions made:\n${summary.decisions.map((d) => `• ${d}`).join('\n')}`);
    }

    if (summary.actionItems.length > 0) {
      parts.push(`\nAction items:`);
      for (const item of summary.actionItems) {
        let line = `• ${item.description}`;
        if (item.owner) line += ` (Owner: ${item.owner})`;
        if (item.deadline) line += ` [Due: ${item.deadline}]`;
        parts.push(line);
      }
    }

    if (summary.nextSteps.length > 0) {
      parts.push(`\nNext steps:\n${summary.nextSteps.map((s) => `• ${s}`).join('\n')}`);
    }

    return parts.join('\n');
  }
}

// Singleton instance
export const meetingSummaryExtractor = new MeetingSummaryExtractor();
