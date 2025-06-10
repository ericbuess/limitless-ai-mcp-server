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
  // Action item patterns - more specific to avoid casual conversation
  private actionPatterns = [
    // Explicit action items
    /\b(?:action items?|todo|task|follow ups?):\s*(.+?)(?:\.|$)/gi,
    /\b(?:next steps?):\s*(.+?)(?:\.|$)/gi,
    /\b(?:assigned|assign)\s+to\s+(\w+)\s*:?\s*(.+?)(?:\.|$)/gi,
    /\btake\s+(?:the\s+)?action\s+(?:to\s+)?(.+?)(?:\.|$)/gi,

    // Project/work commitments
    /\b(?:I|we)\s+(?:will|need to|should|must)\s+(?:update|create|implement|fix|review|send|schedule|prepare|complete|finish)\s+(.+?)(?:\.|$)/gi,
    /\b(?:make sure to|don't forget to|remember to)\s+(.+?)(?:\.|$)/gi,
    /\b(?:deadline|due|by)\s+(\w+\s+\d+|\d+\s+\w+|tomorrow|next week|end of day|EOD|COB)/gi,
  ];

  // Decision patterns - focus on business/project decisions
  private decisionPatterns = [
    /\b(?:we|the team)\s+(?:decided|agreed|concluded|determined|resolved)\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
    /\b(?:decision|agreement|conclusion|resolution):\s*(.+?)(?:\.|$)/gi,
    /\bit['']s\s+(?:been\s+)?(?:decided|agreed|confirmed)\s+(?:that\s+)?(.+?)(?:\.|$)/gi,
    /\b(?:final|the)\s+decision\s+(?:is|was)\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
    /\b(?:approved|confirmed|finalized)\s+(.+?)(?:\.|$)/gi,
    /\bwe['']re\s+(?:going with|moving forward with|proceeding with)\s+(.+?)(?:\.|$)/gi,
  ];

  // Topic patterns - focus on substantive topics
  private topicPatterns = [
    // Technical/project discussions
    /\b(?:discussed|talked about|reviewed|covered)\s+(?:the\s+)?(.+?(?:project|feature|implementation|design|architecture|plan|strategy|approach))(?:\.|$)/gi,
    /\b(?:topic|subject|agenda item):\s*(.+?)(?:\.|$)/gi,
    /\b(?:meeting|discussion|conversation)\s+about\s+(.+?)(?:\.|$)/gi,
    /\bregarding\s+(?:the\s+)?(.+?(?:project|issue|problem|solution|proposal)),?\s+(?:we|they|I)/gi,
    /\b(?:presented|presenting|presentation)\s+(?:on|about)\s+(.+?)(?:\.|$)/gi,
    /\b(?:working on|focusing on|prioritizing)\s+(.+?)(?:\.|$)/gi,
  ];

  // Question patterns - focus on substantive questions
  private questionPatterns = [
    /\b(?:asked|wondered|questioned|inquired)\s+(?:about\s+)?(.+?)(?:\?|\.|$)/gi,
    /\b(?:question|clarification|concern):\s*(.+?)(?:\?|\.|$)/gi,
    /\b(?:can|could|should|would)\s+(?:we|you|they)\s+(.+?)(?:\?|\.|$)/gi,
    /\bwhat\s+(?:about|if|are|is)\s+(.+?)(?:\?|\.|$)/gi,
    /\bhow\s+(?:do|does|will|would|should|can|could)\s+(?:we|you|they)\s+(.+?)(?:\?|\.|$)/gi,
  ];

  // Additional patterns to filter out
  private casualPhrases = new Set([
    'oreos',
    'donuts',
    'lunch',
    'dinner',
    'breakfast',
    'snack',
    'food',
    'sunscreen',
    'pool',
    'swimming',
    'beach',
    'vacation',
    'kids',
    'children',
    'family',
    'home',
    'house',
    'yeah',
    'okay',
    'alright',
    'sure',
    'maybe',
    'thing',
    'stuff',
    'something',
    'whatever',
  ]);

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
    // Strong meeting indicators (any one is sufficient)
    const strongIndicators = [
      /\baction items?\b/i,
      /\bnext steps?\b/i,
      /\bagenda\b/i,
      /\bmeeting notes?\b/i,
      /\bproject (?:update|review|planning|discussion)\b/i,
      /\bstatus update\b/i,
      /\bteam (?:meeting|sync|standup|discussion)\b/i,
    ];

    for (const pattern of strongIndicators) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // Weak indicators (need multiple)
    const weakIndicators = [
      /\bmeeting\b/i,
      /\bdiscussion\b/i,
      /\btalked?\s+about\b/i,
      /\bdecided\b/i,
      /\bagreed\b/i,
      /\breviewed\b/i,
      /\bpresented\b/i,
      /\bproposal\b/i,
      /\bproject\b/i,
      /\bdeadline\b/i,
      /\bdeliverable\b/i,
      /\bupdate\b/i,
    ];

    let indicatorCount = 0;
    for (const pattern of weakIndicators) {
      if (pattern.test(content)) {
        indicatorCount++;
      }
    }

    // Need at least 3 weak indicators
    if (indicatorCount >= 3) {
      // But also check it's not purely casual conversation
      const casualIndicators = [
        /\b(?:breakfast|lunch|dinner|snack|food|meal)\b/i,
        /\b(?:kids?|children|family|home)\b/i,
        /\b(?:vacation|holiday|weekend|beach|pool)\b/i,
        /\b(?:movie|show|game|sport)\b/i,
      ];

      let casualCount = 0;
      for (const pattern of casualIndicators) {
        if (pattern.test(content)) {
          casualCount++;
        }
      }

      // If too much casual content relative to meeting content, skip
      return casualCount < indicatorCount / 2;
    }

    return false;
  }

  /**
   * Extract participants from content
   */
  private extractParticipants(content: string): string[] {
    const participants = new Set<string>();
    const unknownSpeakers = new Set<string>();

    // First pass: count Unknown speakers
    const unknownPattern = /Unknown\s*\(([^)]+)\)/g;
    let match;
    while ((match = unknownPattern.exec(content)) !== null) {
      unknownSpeakers.add(match[1]);
    }

    // Look for speaker patterns (but skip Unknown)
    const speakerPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\([^)]+\))?\s*:/gm;
    while ((match = speakerPattern.exec(content)) !== null) {
      if (!this.isCommonWord(match[1]) && match[1] !== 'Unknown') {
        participants.add(match[1]);
      }
    }

    // Look for "with X" patterns
    const withPattern =
      /\b(?:with|joined by|meeting with)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?)\b/g;
    while ((match = withPattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (!this.isCommonWord(name) && name !== 'Unknown') {
        participants.add(name);
      }
    }

    // Look for "X said/mentioned" patterns
    const saidPattern =
      /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?)\s+(?:said|mentioned|suggested|proposed|asked|presented|discussed)\b/g;
    while ((match = saidPattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (!this.isCommonWord(name) && name !== 'Unknown') {
        participants.add(name);
      }
    }

    // Look for names in possessive form
    const possessivePattern =
      /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?)'s\s+(?:idea|proposal|suggestion|team|project)\b/g;
    while ((match = possessivePattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (!this.isCommonWord(name) && name !== 'Unknown') {
        participants.add(name);
      }
    }

    // If we only found Unknown speakers, include count info
    if (participants.size === 0 && unknownSpeakers.size > 0) {
      participants.add(`${unknownSpeakers.size} participants (identities unclear)`);
    }

    return Array.from(participants);
  }

  /**
   * Extract main topics discussed
   */
  private extractTopics(content: string): string[] {
    const topicScores = new Map<string, number>();

    for (const pattern of this.topicPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const topic = this.cleanExtractedText(match[1]);
        if (topic && topic.length > 15 && topic.length < 100) {
          // Score topics based on keywords
          let score = 1;
          const topicLower = topic.toLowerCase();

          // Boost for technical/business terms
          if (
            topicLower.match(
              /\b(?:project|feature|implementation|design|architecture|strategy|plan|proposal|update|review|status)\b/
            )
          ) {
            score += 2;
          }

          // Boost for action-oriented topics
          if (
            topicLower.match(
              /\b(?:develop|implement|build|create|improve|optimize|refactor|migrate|deploy)\b/
            )
          ) {
            score += 1;
          }

          // Penalize casual topics
          if (topicLower.match(/\b(?:lunch|dinner|breakfast|pool|vacation|kids?|family)\b/)) {
            score -= 2;
          }

          if (score > 0) {
            topicScores.set(topic, (topicScores.get(topic) || 0) + score);
          }
        }
      }
    }

    // Sort by score and take top topics
    const sortedTopics = Array.from(topicScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
      .slice(0, 5);

    return sortedTopics;
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
        const rawText = match[1] || match[2] || match[0];
        const description = this.cleanExtractedText(rawText);

        // More stringent validation
        if (!description || description.length < 20 || seen.has(description)) {
          continue;
        }

        // Skip if it contains too many casual words
        const descLower = description.toLowerCase();
        if (
          descLower.match(
            /\b(?:oreos?|donuts?|lunch|dinner|breakfast|snack|pool|swimming|kids?|family)\b/
          )
        ) {
          continue;
        }

        // Must contain at least one action verb
        if (
          !descLower.match(
            /\b(?:update|create|implement|fix|review|send|schedule|prepare|complete|finish|develop|build|deploy|test|document|analyze|design|refactor|optimize|migrate|configure|setup|investigate|research|contact|follow\s*up|coordinate|organize|draft|submit|approve|verify|validate|check|ensure|monitor|track|report|present|discuss|meet|call|email)\b/
          )
        ) {
          continue;
        }

        seen.add(description);

        const actionItem: ActionItem = {
          description,
          confidence: 0.8,
        };

        // Try to extract owner (more specific patterns)
        const ownerPatterns = [
          /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:will|should|needs?\s+to|must)\b/,
          /\bassigned?\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
          /\b(?:owner|responsible):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
        ];

        for (const ownerPattern of ownerPatterns) {
          const ownerMatch = description.match(ownerPattern);
          if (ownerMatch) {
            actionItem.owner = ownerMatch[1];
            actionItem.confidence = 0.9;
            break;
          }
        }

        // Try to extract deadline
        const deadlineMatch = description.match(/\b(?:by|before|until|due)\s+([^,.]+?)(?:\.|,|$)/i);
        if (deadlineMatch) {
          const deadline = deadlineMatch[1].trim();
          // Validate deadline looks reasonable
          if (
            deadline.match(
              /\b(?:monday|tuesday|wednesday|thursday|friday|tomorrow|next\s+week|end\s+of|EOD|COB|\d+)/i
            )
          ) {
            actionItem.deadline = deadline;
          }
        }

        actionItems.push(actionItem);
      }
    }

    // Sort by confidence
    return actionItems.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
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
    let cleaned = text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[,.\s]+|[,.\s]+$/g, '')
      // Remove filler words and fragments
      .replace(
        /\b(?:um|uh|like|you know|yeah|okay|alright|so|well|just|actually|basically|literally|obviously|clearly|simply|merely|really)\b/gi,
        ''
      )
      // Remove transcription artifacts
      .replace(/\b(?:Unknown|Speaker)\s*\([^)]+\):\s*/g, '')
      // Remove leading dashes, commas, etc.
      .replace(/^[-,.\s]+/, '')
      // Remove repeated words
      .replace(/\b(\w+)\s+\1\b/gi, '$1')
      .trim();

    // Filter out if too short or too generic
    if (cleaned.length < 15) return '';

    // Check for too many casual phrases
    const words = cleaned.toLowerCase().split(/\s+/);
    const casualCount = words.filter((w) => this.casualPhrases.has(w)).length;
    if (casualCount > words.length * 0.3) return ''; // Too casual

    return cleaned;
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
