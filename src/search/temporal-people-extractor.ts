/**
 * Temporal People Extractor
 *
 * Extracts people and meeting information from search results
 * with temporal context for queries like "who did I meet today"
 */

import { Phase2Lifelog } from '../types/phase2.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

export interface PersonMention {
  name: string;
  context: string;
  confidence: number;
  timestamp?: Date;
}

export interface MeetingInfo {
  date: Date;
  people: PersonMention[];
  topics: string[];
  duration?: number;
  isConversation: boolean;
}

export class TemporalPeopleExtractor {
  private knownPeople: Set<string>;
  private entityConfig: any;
  private meetingIndicators: string[];

  constructor() {
    // Load entity relationships from config
    try {
      const configPath = path.join(process.cwd(), 'config/entity-relationships.json');
      const configData = fs.readFileSync(configPath, 'utf-8');
      this.entityConfig = JSON.parse(configData);

      // Initialize known people from config
      this.knownPeople = new Set();
      if (this.entityConfig.entities?.people) {
        for (const person of Object.keys(this.entityConfig.entities.people)) {
          this.knownPeople.add(person.toLowerCase());

          // Also add aliases
          const aliases = this.entityConfig.entities.people[person].aliases || [];
          for (const alias of aliases) {
            this.knownPeople.add(alias.toLowerCase());
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to load entity config, using defaults', { error });
      // Fallback to default known people
      this.knownPeople = new Set(['eric', 'jordan', 'ella', 'emmy', 'evy', 'asa', 'mimi']);
      this.entityConfig = { entities: { people: {} }, groupMappings: {} };
    }

    this.meetingIndicators = [
      'meeting',
      'discussion',
      'conversation',
      'talked with',
      'met with',
      'spoke to',
      'chatted with',
      'call with',
      'conference',
      'interview',
      'presentation',
      'lunch with',
      'dinner with',
      'breakfast with',
      'coffee with',
    ];
  }

  /**
   * Extract people and meeting information from search results
   */
  extractFromResults(results: Array<{ lifelog?: Phase2Lifelog; metadata?: any }>): MeetingInfo[] {
    const meetings: MeetingInfo[] = [];

    for (const result of results) {
      if (!result.lifelog) continue;

      const meetingInfo = this.extractMeetingInfo(result.lifelog);
      if (meetingInfo && (meetingInfo.people.length > 0 || meetingInfo.isConversation)) {
        meetings.push(meetingInfo);
      }
    }

    // Merge meetings that are close in time (within 30 minutes)
    return this.mergeSimilarMeetings(meetings);
  }

  /**
   * Extract meeting information from a single lifelog
   */
  private extractMeetingInfo(lifelog: Phase2Lifelog): MeetingInfo | null {
    const content = lifelog.content.toLowerCase();
    const title = lifelog.title.toLowerCase();

    // Check if this is likely a meeting/conversation
    const isMeeting = this.meetingIndicators.some(
      (indicator) => content.includes(indicator) || title.includes(indicator)
    );

    // Count speakers to detect conversations
    const speakerCount = (lifelog.content.match(/Unknown \(/g) || []).length;
    const isConversation = speakerCount > 5; // Multiple exchanges

    if (!isMeeting && !isConversation && speakerCount < 2) {
      return null;
    }

    // Extract people mentioned
    const people = this.extractPeople(lifelog.content, lifelog.title);

    // Extract topics
    const topics = this.extractTopics(lifelog.content, lifelog.title);

    // Get date
    const date = lifelog.createdAt ? new Date(lifelog.createdAt) : new Date();

    return {
      date,
      people,
      topics,
      duration: lifelog.duration,
      isConversation,
    };
  }

  /**
   * Extract people from text
   */
  private extractPeople(content: string, title: string): PersonMention[] {
    const people: PersonMention[] = [];
    const contentLower = content.toLowerCase();
    const titleLower = title.toLowerCase();

    // Check for known people
    for (const person of this.knownPeople) {
      if (contentLower.includes(person) || titleLower.includes(person)) {
        // Find context around the mention
        const context = this.extractContext(content, person);

        // Get proper name from config or capitalize
        const properName = this.getProperName(person);

        // Check if we already have this person (avoid duplicates)
        if (!people.some((p) => p.name.toLowerCase() === properName.toLowerCase())) {
          people.push({
            name: properName,
            context,
            confidence: 0.9, // High confidence for exact matches
          });
        }
      }
    }

    // Extract capitalized names (potential people) - only single names for unknown people
    const namePattern = /\b([A-Z][a-z]+)\b/g;
    let match;

    while ((match = namePattern.exec(content)) !== null) {
      const potentialName = match[1];

      // Skip common words and already found names
      if (!this.isCommonWord(potentialName) && !people.some((p) => p.name === potentialName)) {
        // Check if it's in a person-like context
        const context = this.extractContext(content, potentialName);

        // For unknown names, require strong person context
        if (this.isStrongPersonContext(context, potentialName)) {
          people.push({
            name: potentialName,
            context,
            confidence: 0.6, // Lower confidence for pattern-based matches
          });
        }
      }
    }

    // Deduplicate and sort by confidence
    const uniquePeople = this.deduplicatePeople(people);
    return uniquePeople.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract topics from content
   */
  private extractTopics(content: string, title: string): string[] {
    const topics: string[] = [];

    // Add title as a topic if it's informative
    if (title.length > 10 && !title.includes('unknown')) {
      topics.push(title.substring(0, 100));
    }

    // Look for topic indicators
    const topicPatterns = [
      /discussed? (?:about )?(.+?)(?:\.|,|;|\n|$)/gi,
      /talked? about (.+?)(?:\.|,|;|\n|$)/gi,
      /meeting about (.+?)(?:\.|,|;|\n|$)/gi,
      /regarding (.+?)(?:\.|,|;|\n|$)/gi,
      /\btopic:?\s*(.+?)(?:\.|,|;|\n|$)/gi,
    ];

    for (const pattern of topicPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const topic = match[1].trim();
        if (topic.length > 5 && topic.length < 100) {
          topics.push(topic);
        }
      }
    }

    return [...new Set(topics)].slice(0, 5); // Max 5 topics
  }

  /**
   * Extract context around a mention
   */
  private extractContext(content: string, term: string): string {
    const index = content.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return '';

    const contextRadius = 50;
    const start = Math.max(0, index - contextRadius);
    const end = Math.min(content.length, index + term.length + contextRadius);

    let context = content.substring(start, end).trim();

    // Clean up context
    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';

    return context.replace(/\s+/g, ' ');
  }

  /**
   * Check if context strongly suggests this is a person (for unknown names)
   */
  private isStrongPersonContext(context: string, name: string): boolean {
    const contextLower = context.toLowerCase();
    const nameLower = name.toLowerCase();

    // Very strong indicators that almost certainly indicate a person
    const veryStrongPatterns = [
      new RegExp(`\\b${nameLower}\\s+(said|told|asked|mentioned|explained)\\b`),
      new RegExp(`\\b(meeting|conversation|discussion|talk)\\s+with\\s+${nameLower}\\b`),
      new RegExp(`\\b${nameLower}'s\\s+(idea|opinion|thought|comment)\\b`),
      new RegExp(`\\b(spoke|talked|met)\\s+(to|with)\\s+${nameLower}\\b`),
      new RegExp(`\\b${nameLower}\\s+and\\s+(I|me|my)\\b`),
      new RegExp(`\\b(I|me|my)\\s+and\\s+${nameLower}\\b`),
    ];

    // Check very strong patterns
    for (const pattern of veryStrongPatterns) {
      if (pattern.test(contextLower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Merge meetings that are close in time
   */
  private mergeSimilarMeetings(meetings: MeetingInfo[]): MeetingInfo[] {
    if (meetings.length <= 1) return meetings;

    // Sort by date
    meetings.sort((a, b) => a.date.getTime() - b.date.getTime());

    const merged: MeetingInfo[] = [];
    let current = meetings[0];

    for (let i = 1; i < meetings.length; i++) {
      const next = meetings[i];
      const timeDiff = next.date.getTime() - current.date.getTime();

      // If within 30 minutes, merge
      if (timeDiff < 30 * 60 * 1000) {
        current = {
          date: current.date, // Keep earlier date
          people: this.mergePeople(current.people, next.people),
          topics: [...new Set([...current.topics, ...next.topics])],
          duration: (current.duration || 0) + (next.duration || 0),
          isConversation: current.isConversation || next.isConversation,
        };
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * Merge people lists, keeping highest confidence for duplicates
   */
  private mergePeople(people1: PersonMention[], people2: PersonMention[]): PersonMention[] {
    const merged = [...people1];

    for (const person of people2) {
      const existing = merged.find((p) => p.name.toLowerCase() === person.name.toLowerCase());

      if (existing) {
        // Keep the one with higher confidence
        if (person.confidence > existing.confidence) {
          existing.confidence = person.confidence;
          existing.context = person.context;
        }
      } else {
        merged.push(person);
      }
    }

    return merged;
  }

  /**
   * Deduplicate people by name
   */
  private deduplicatePeople(people: PersonMention[]): PersonMention[] {
    const seen = new Map<string, PersonMention>();

    for (const person of people) {
      const key = person.name.toLowerCase();
      const existing = seen.get(key);

      if (!existing || person.confidence > existing.confidence) {
        seen.set(key, person);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Check if a word is common (not a name)
   */
  private isCommonWord(word: string): boolean {
    const common = new Set([
      // Articles and determiners
      'The',
      'This',
      'That',
      'These',
      'Those',
      'A',
      'An',

      // Days and months
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

      // Common nouns
      'Unknown',
      'Discussion',
      'Meeting',
      'Conversation',
      'Summary',
      'Overview',
      'Introduction',
      'Conclusion',
      'Topic',
      'Subject',
      'Question',
      'Answer',
      'Problem',
      'Solution',
      'Issue',
      'Idea',
      'Opinion',
      'Thought',
      'Comment',
      'Note',
      'Point',
      'View',
      'Perspective',
      'Analysis',
      'Review',
      'Update',
      'Status',
      'Progress',
      'Plan',
      'Project',
      'Task',
      'Action',
      'Item',
      'Time',
      'Date',
      'Day',
      'Week',
      'Month',
      'Year',
      'Today',
      'Yesterday',
      'Tomorrow',
      'Now',
      'Later',
      'Earlier',
      'Recently',
      'Currently',
      'Previously',
      'Finally',
      'Initially',
      'Eventually',

      // Tech/product terms often capitalized
      'Apple',
      'Google',
      'Microsoft',
      'Amazon',
      'Facebook',
      'Twitter',
      'Instagram',
      'YouTube',
      'LinkedIn',
      'GitHub',
      'Slack',
      'Zoom',
      'iPhone',
      'Android',
      'Windows',
      'Mac',
      'iOS',
      'Chrome',
      'Safari',
      'Firefox',
      'Edge',
      'Excel',
      'Word',
      'PowerPoint',
      'Outlook',
      'Gmail',
      'Drive',
      'Dropbox',
      'OneDrive',
      'iCloud',

      // Common action words
      'Create',
      'Read',
      'Update',
      'Delete',
      'Add',
      'Remove',
      'Edit',
      'Change',
      'Modify',
      'Save',
      'Load',
      'Open',
      'Close',
      'Start',
      'Stop',
      'Begin',
      'End',
      'Continue',
      'Pause',
      'Resume',
      'Cancel',
      'Submit',
      'Send',
      'Receive',
      'Download',
      'Upload',
      'Share',
      'Copy',
      'Move',
      'Rename',
      'Search',
      'Find',
      'Replace',
      'Filter',

      // Common descriptors
      'New',
      'Old',
      'Good',
      'Bad',
      'Best',
      'Worst',
      'Better',
      'Worse',
      'More',
      'Less',
      'Most',
      'Least',
      'Many',
      'Few',
      'Some',
      'All',
      'None',
      'Any',
      'Each',
      'Every',
      'Both',
      'Either',
      'Neither',
      'Other',
      'Another',
      'Same',
      'Different',
      'Similar',
      'Various',
      'Several',
      'Multiple',
      'Single',
      'Double',
      'Triple',
      'First',
      'Second',
      'Third',
      'Last',
      'Next',
      'Previous',
      'Current',

      // Common words that might be capitalized in transcripts
      'Yes',
      'No',
      'Maybe',
      'Okay',
      'OK',
      'Sure',
      'Right',
      'Wrong',
      'True',
      'False',
      'Hello',
      'Hi',
      'Hey',
      'Bye',
      'Goodbye',
      'Thanks',
      'Thank',
      'Please',
      'Sorry',
      'Excuse',
      'Pardon',
      'What',
      'Where',
      'When',
      'Who',
      'Why',
      'How',
      'Which',
      'Because',
      'Since',
      'Although',
      'Though',
      'While',
      'Until',
      'Unless',
      'If',
      'Then',
      'Else',
      'Otherwise',
      'However',
      'Therefore',
      'Thus',
      'Hence',
      'Moreover',
      'Furthermore',
      'Additionally',
      'Also',
      'Too',
      'As',
      'Well',
      'Very',
      'Really',
      'Just',
      'Only',
      'Even',
      'Still',
      'Yet',
      'Already',
      'Soon',

      // Common business/work terms
      'Company',
      'Business',
      'Work',
      'Office',
      'Team',
      'Group',
      'Department',
      'Division',
      'Manager',
      'Director',
      'Executive',
      'Employee',
      'Staff',
      'Client',
      'Customer',
      'Partner',
      'Vendor',
      'Supplier',
      'Contract',
      'Agreement',
      'Deal',
      'Proposal',
      'Budget',
      'Revenue',
      'Cost',
      'Profit',
      'Loss',
      'Sales',
      'Marketing',
      'Finance',
      'Operations',
      'Strategy',
      'Goal',
      'Objective',
      'Target',
      'Deadline',
      'Schedule',
      'Calendar',

      // Other common words that shouldn't be names
      'It',
      'Its',
      'And',
      'Or',
      'But',
      'So',
      'For',
      'To',
      'From',
      'With',
      'Without',
      'About',
      'Over',
      'Under',
      'Above',
      'Below',
      'Between',
      'Among',
      'Through',
      'During',
      'Before',
      'After',
      'By',
      'In',
      'On',
      'At',
      'Of',
      'Up',
      'Down',
      'Out',
      'Off',
      'Is',
      'Are',
      'Was',
      'Were',
      'Been',
      'Being',
      'Be',
      'Am',
      'Have',
      'Has',
      'Had',
      'Do',
      'Does',
      'Did',
      'Will',
      'Would',
      'Could',
      'Should',
      'May',
      'Might',
      'Must',
      'Can',
      'Cannot',
      'Could',
      'Would',
      'Should',
    ]);

    return common.has(word);
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get proper name from config or capitalize
   */
  private getProperName(name: string): string {
    // Check if it's a main person name in config
    if (this.entityConfig.entities?.people) {
      for (const personName of Object.keys(this.entityConfig.entities.people)) {
        if (personName.toLowerCase() === name.toLowerCase()) {
          return personName;
        }

        // Check aliases
        const person = this.entityConfig.entities.people[personName];
        if (person.aliases?.some((alias: string) => alias.toLowerCase() === name.toLowerCase())) {
          return personName; // Return the canonical name
        }
      }
    }

    // Default to capitalizing first letter
    return this.capitalizeFirst(name);
  }

  /**
   * Process temporal people query (e.g., "who did I meet today")
   */
  processTemporalPeopleQuery(
    query: string,
    searchResults: any[]
  ): {
    timeframe: string;
    meetings: MeetingInfo[];
    summary: string;
  } {
    // Extract timeframe from query
    const timeframe = this.extractTimeframe(query);

    // Extract meetings from search results
    const meetings = this.extractFromResults(searchResults);

    // Generate summary
    const summary = this.generatePeopleSummary(meetings);

    return {
      timeframe,
      meetings,
      summary,
    };
  }

  /**
   * Extract timeframe from query
   */
  private extractTimeframe(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('today')) return 'today';
    if (lowerQuery.includes('yesterday')) return 'yesterday';
    if (lowerQuery.includes('this week')) return 'this week';
    if (lowerQuery.includes('last week')) return 'last week';
    if (lowerQuery.includes('this month')) return 'this month';
    if (lowerQuery.includes('last month')) return 'last month';

    // Check for specific dates
    const dateMatch = query.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (dateMatch) return dateMatch[1];

    return 'recent';
  }

  /**
   * Generate a summary of people met in a time period
   */
  generatePeopleSummary(meetings: MeetingInfo[]): string {
    if (meetings.length === 0) {
      return 'No meetings or conversations found in this time period.';
    }

    // Collect all unique people
    const allPeople = new Map<string, { count: number; contexts: string[] }>();

    for (const meeting of meetings) {
      for (const person of meeting.people) {
        const key = person.name.toLowerCase();
        const existing = allPeople.get(key);

        if (existing) {
          existing.count++;
          if (!existing.contexts.includes(person.context)) {
            existing.contexts.push(person.context);
          }
        } else {
          allPeople.set(key, {
            count: 1,
            contexts: [person.context],
          });
        }
      }
    }

    // Build summary
    const peopleList = Array.from(allPeople.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, info]) => {
        const properName = this.capitalizeFirst(name);
        if (info.count > 1) {
          return `${properName} (${info.count} interactions)`;
        }
        return properName;
      });

    let summary = `Found ${meetings.length} meetings/conversations`;

    if (peopleList.length > 0) {
      summary += ` with: ${peopleList.join(', ')}`;
    } else {
      summary += ' (participants unclear due to "Unknown" speaker labels)';
    }

    // Add topic summary if available
    const allTopics = [...new Set(meetings.flatMap((m) => m.topics))];
    if (allTopics.length > 0) {
      summary += `\n\nTopics discussed: ${allTopics.slice(0, 5).join('; ')}`;
    }

    return summary;
  }
}

// Singleton instance
export const temporalPeopleExtractor = new TemporalPeopleExtractor();
