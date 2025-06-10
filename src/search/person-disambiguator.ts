/**
 * Person Disambiguator
 *
 * Handles disambiguation of people in queries, especially when they share
 * the same first name as the user (e.g., "Eric B" vs "Eric" the user)
 */

import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

export interface DisambiguatedPerson {
  original: string; // Original text (e.g., "Eric B")
  canonical: string; // Canonical name (e.g., "Eric B")
  isThirdParty: boolean; // True if not the user or family
  confidence: number;
  context?: string; // Additional context
}

export interface DisambiguationResult {
  people: DisambiguatedPerson[];
  modifiedQuery: string;
  hasThirdPartyPeople: boolean;
}

export class PersonDisambiguator {
  private userNames: Set<string> = new Set();
  private familyNames: Set<string> = new Set();
  private knownThirdParties: Map<string, string[]> = new Map();
  private entityConfig: any;

  constructor() {
    // Load entity relationships
    try {
      const configPath = path.join(process.cwd(), 'config/entity-relationships.json');
      const configData = fs.readFileSync(configPath, 'utf-8');
      this.entityConfig = JSON.parse(configData);

      this.initializeFromConfig();
    } catch (error) {
      logger.warn('Failed to load entity config for disambiguation', { error });
      this.initializeDefaults();
    }
  }

  private initializeFromConfig() {
    this.userNames = new Set();
    this.familyNames = new Set();
    this.knownThirdParties = new Map();

    if (this.entityConfig.entities?.people) {
      for (const [name, info] of Object.entries(this.entityConfig.entities.people)) {
        const personInfo = info as any;

        // Find the primary user (has aliases like "I", "me")
        if (
          personInfo.aliases?.some((alias: string) =>
            ['i', 'me', 'my', 'myself'].includes(alias.toLowerCase())
          )
        ) {
          this.userNames.add(name.toLowerCase());
          // Also add their first name
          const firstName = name.split(' ')[0];
          if (firstName) {
            this.userNames.add(firstName.toLowerCase());
          }
        } else if (personInfo.relationships) {
          // Family members have relationships defined
          this.familyNames.add(name.toLowerCase());
        }
      }
    }

    // Initialize known third parties from a separate section if it exists
    if (this.entityConfig.thirdParties) {
      for (const [canonical, aliases] of Object.entries(this.entityConfig.thirdParties)) {
        this.knownThirdParties.set(canonical, aliases as string[]);
      }
    }
  }

  private initializeDefaults() {
    // Default initialization if config fails
    this.userNames = new Set(['eric']);
    this.familyNames = new Set(['jordan', 'ella', 'emmy', 'evy', 'asa', 'mimi']);
    this.knownThirdParties = new Map();
  }

  /**
   * Disambiguate people mentioned in a query
   */
  disambiguate(query: string): DisambiguationResult {
    const people: DisambiguatedPerson[] = [];
    let modifiedQuery = query;

    // Pattern 1: Name with initial or last name (e.g., "Eric B", "John Smith")
    const nameWithQualifierPattern = /\b([A-Z][a-z]+)\s+([A-Z]\.?|\b[A-Z][a-z]+)\b/g;
    let match;

    while ((match = nameWithQualifierPattern.exec(query)) !== null) {
      const firstName = match[1];
      const qualifier = match[2];
      const fullMatch = match[0];

      // Check if this is a disambiguation case
      if (this.userNames.has(firstName.toLowerCase())) {
        // This first name matches the user, so with a qualifier it's likely someone else
        const canonical = fullMatch;
        people.push({
          original: fullMatch,
          canonical: canonical,
          isThirdParty: true,
          confidence: 0.9,
          context: `Distinguished from user by qualifier "${qualifier}"`,
        });

        // Modify query to make it clear this is a different person
        modifiedQuery = modifiedQuery.replace(
          new RegExp(`\\b${fullMatch}\\b`, 'g'),
          `[${canonical}:third-party]`
        );
      }
    }

    // Pattern 2: Explicit disambiguation phrases (e.g., "Eric (not me)")
    const explicitPattern =
      /\b([A-Z][a-z]+)\s*\(\s*(?:not\s+me|someone\s+else|another\s+person|colleague|friend)\s*\)/gi;

    while ((match = explicitPattern.exec(query)) !== null) {
      const name = match[1];
      const fullMatch = match[0];

      people.push({
        original: fullMatch,
        canonical: name,
        isThirdParty: true,
        confidence: 1.0,
        context: 'Explicitly marked as third party',
      });

      modifiedQuery = modifiedQuery.replace(
        new RegExp(fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        `[${name}:third-party]`
      );
    }

    // Pattern 3: Check context clues (e.g., "meeting with Eric")
    const contextualPattern =
      /\b(?:meeting|call|discussion|conversation|lunch|dinner)\s+with\s+([A-Z][a-z]+)\b/gi;

    while ((match = contextualPattern.exec(query)) !== null) {
      const name = match[1];

      // If it's the user's name in a "meeting with" context, it might be ambiguous
      if (
        this.userNames.has(name.toLowerCase()) &&
        !people.some((p) => p.original.includes(name))
      ) {
        // Check if there's additional context
        const surroundingText = query.substring(
          Math.max(0, match.index - 50),
          Math.min(query.length, match.index + match[0].length + 50)
        );

        // Look for clues that it's a different person
        if (surroundingText.match(/colleague|client|friend|contact|external/i)) {
          people.push({
            original: name,
            canonical: name,
            isThirdParty: true,
            confidence: 0.7,
            context: 'Meeting context suggests third party',
          });
        }
      }
    }

    // Pattern 4: Names that are definitely not the user or family
    const allNamesPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

    while ((match = allNamesPattern.exec(query)) !== null) {
      const name = match[1];
      const nameLower = name.toLowerCase();

      // Skip if already processed
      if (people.some((p) => p.original === name || p.canonical === name)) {
        continue;
      }

      // Check if it's a known third party
      if (
        !this.userNames.has(nameLower) &&
        !this.familyNames.has(nameLower) &&
        !this.isCommonWord(name)
      ) {
        // Check surrounding context for person indicators
        const beforeIndex = Math.max(0, match.index - 20);
        const afterIndex = Math.min(query.length, match.index + name.length + 20);
        const context = query.substring(beforeIndex, afterIndex);

        if (
          context.match(/\b(said|told|asked|mentioned|explained|suggested)\b/i) ||
          context.match(/\b(with|from|to)\s+/i)
        ) {
          people.push({
            original: name,
            canonical: name,
            isThirdParty: true,
            confidence: 0.5,
            context: 'Unknown person in conversational context',
          });
        }
      }
    }

    return {
      people,
      modifiedQuery,
      hasThirdPartyPeople: people.some((p) => p.isThirdParty),
    };
  }

  /**
   * Extract search terms for third-party people
   */
  getThirdPartySearchTerms(result: DisambiguationResult): string[] {
    const terms: string[] = [];

    for (const person of result.people.filter((p) => p.isThirdParty)) {
      // Add the canonical name
      terms.push(person.canonical);

      // Add variations
      if (person.canonical.includes(' ')) {
        // For "Eric B", also search for "Eric B." and "Eric B"
        const parts = person.canonical.split(' ');
        if (parts[1].length === 1) {
          terms.push(`${parts[0]} ${parts[1]}.`);
        }
      }

      // Add contextual search terms
      terms.push(`${person.canonical} said`);
      terms.push(`with ${person.canonical}`);
      terms.push(`${person.canonical}'s`);
    }

    return [...new Set(terms)];
  }

  private isCommonWord(word: string): boolean {
    const common = new Set([
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
      'Meeting',
      'Discussion',
      'Project',
      'Review',
      'Update',
      'Report',
      'Summary',
      'Analysis',
      'Presentation',
      'Document',
      'Email',
    ]);

    return common.has(word);
  }

  /**
   * Check if a search result likely contains a third-party person
   */
  scoreThirdPartyRelevance(content: string, person: DisambiguatedPerson): number {
    const contentLower = content.toLowerCase();
    const personLower = person.canonical.toLowerCase();

    let score = 0;

    // Direct mention
    if (contentLower.includes(personLower)) {
      score += 0.5;

      // Check context around mention
      const index = contentLower.indexOf(personLower);
      const contextStart = Math.max(0, index - 100);
      const contextEnd = Math.min(content.length, index + personLower.length + 100);
      const context = content.substring(contextStart, contextEnd).toLowerCase();

      // Conversation indicators
      if (context.match(/\b(said|told|asked|mentioned|explained|suggested|proposed)\b/)) {
        score += 0.2;
      }

      // Meeting indicators
      if (context.match(/\b(meeting|call|discussion|conversation|talked)\b/)) {
        score += 0.15;
      }

      // Possessive or action
      if (
        context.includes(`${personLower}'s`) ||
        context.includes(`${personLower} is`) ||
        context.includes(`${personLower} will`)
      ) {
        score += 0.15;
      }
    }

    return Math.min(score, 1.0);
  }
}

// Singleton instance
export const personDisambiguator = new PersonDisambiguator();
