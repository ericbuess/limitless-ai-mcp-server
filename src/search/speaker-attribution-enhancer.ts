/**
 * Speaker Attribution Enhancer
 *
 * Enhances search queries and embeddings to handle speaker attribution
 * when all speakers are labeled as "Unknown" in the transcripts.
 */

export interface SpeakerContext {
  firstPersonIndicators: string[];
  relationshipMappings: Map<string, string>;
  contextClues: Map<string, string[]>;
}

export class SpeakerAttributionEnhancer {
  private speakerContext: SpeakerContext;

  constructor() {
    // Initialize speaker context patterns
    this.speakerContext = {
      // First person indicators that suggest Eric is speaking
      firstPersonIndicators: [
        'I think',
        'I believe',
        'I said',
        'I mentioned',
        'I told',
        'my opinion',
        'my idea',
        'my thought',
        'I feel',
        'I want',
        'I need',
        'I have',
        'I am',
        "I'm",
        "I've",
        "I'll",
        "I'd",
        'my wife',
        'my kids',
        'my daughter',
        'my son',
        'my children',
      ],

      // Relationship mappings
      relationshipMappings: new Map([
        ['my wife', 'Jordan'],
        ['my daughter', 'Ella Emmy Evy'],
        ['my son', 'Asa'],
        ['my kids', 'Ella Emmy Evy Asa'],
        ['my children', 'Ella Emmy Evy Asa'],
      ]),

      // Context clues for identifying speakers
      contextClues: new Map([
        ['Eric', ['I', 'me', 'my', 'myself']],
        ['Jordan', ['wife', 'mom', 'mommy']],
        ['Ella', ['daughter', 'sister']],
        ['Emmy', ['daughter', 'sister']],
        ['Evy', ['daughter', 'sister']],
        ['Asa', ['son', 'brother']],
      ]),
    };
  }

  /**
   * Enhance a search query to handle speaker attribution
   */
  enhanceQuery(query: string): string[] {
    const queries = [query]; // Always include original
    const lowerQuery = query.toLowerCase();

    // Handle "what did I say/mention/think"
    if (
      lowerQuery.includes('what did i') ||
      lowerQuery.includes('i said') ||
      lowerQuery.includes('i mentioned') ||
      lowerQuery.includes('my opinion')
    ) {
      // Add variations that look for first-person indicators
      queries.push(query.replace(/\bI\b/gi, 'Unknown'));
      queries.push('Unknown "I think"');
      queries.push('Unknown "my opinion"');
      queries.push('Unknown "I believe"');
    }

    // Handle "what did my wife say"
    if (lowerQuery.includes('my wife')) {
      queries.push(query.replace('my wife', 'Jordan'));
      queries.push(query.replace('my wife', 'Unknown') + ' Jordan');
      queries.push('Jordan said');
      queries.push('Unknown wife');
    }

    // Handle "Ella or my wife said"
    if (lowerQuery.includes('or my wife')) {
      queries.push(query.replace('or my wife', 'or Jordan'));
      queries.push('Ella said Jordan said');
    }

    // Handle generic "who did I meet"
    if (lowerQuery.includes('who did i meet') || lowerQuery.includes('people i met')) {
      queries.push('Unknown conversation discussion meeting');
      queries.push('talked with discussed with met with');
    }

    return [...new Set(queries)]; // Remove duplicates
  }

  /**
   * Add speaker attribution context to text before embedding
   */
  addSpeakerContext(text: string, metadata?: any): string {
    const contexts: string[] = [];
    const lowerText = text.toLowerCase();

    // Check if this chunk contains first-person indicators
    let likelyEricSpeaking = false;
    for (const indicator of this.speakerContext.firstPersonIndicators) {
      if (lowerText.includes(indicator)) {
        likelyEricSpeaking = true;
        break;
      }
    }

    if (likelyEricSpeaking) {
      contexts.push('Speaker: Eric (based on first-person references)');
    }

    // Check for relationship mentions
    for (const [relationship, person] of this.speakerContext.relationshipMappings) {
      if (lowerText.includes(relationship)) {
        contexts.push(`Context: "${relationship}" refers to ${person}`);
      }
    }

    // Look for conversation patterns
    const unknownCount = (text.match(/Unknown \(/g) || []).length;
    if (unknownCount > 1) {
      contexts.push(`Conversation: ${unknownCount} speakers`);

      // Try to identify speakers by context
      const identifiedSpeakers = new Set<string>();
      for (const [person, clues] of this.speakerContext.contextClues) {
        for (const clue of clues) {
          if (lowerText.includes(clue + ' ') || lowerText.includes(' ' + clue)) {
            identifiedSpeakers.add(person);
          }
        }
      }

      if (identifiedSpeakers.size > 0) {
        contexts.push(`Likely participants: ${Array.from(identifiedSpeakers).join(', ')}`);
      }
    }

    // Add temporal meeting context
    if (metadata?.date && lowerText.match(/meeting|discuss|conversation/)) {
      const date = new Date(metadata.date);
      contexts.push(`Meeting date: ${date.toLocaleDateString()}`);
    }

    return contexts.length > 0 ? contexts.join('. ') + '\n\n' + text : text;
  }

  /**
   * Extract speaker information from a lifelog chunk
   */
  extractSpeakerInfo(text: string): {
    speakerCount: number;
    hasFirstPerson: boolean;
    likelyEric: boolean;
    mentionedPeople: string[];
  } {
    const lowerText = text.toLowerCase();

    // Count Unknown speakers
    const speakerCount = (text.match(/Unknown \(/g) || []).length;

    // Check for first person
    const hasFirstPerson = this.speakerContext.firstPersonIndicators.some((indicator) =>
      lowerText.includes(indicator)
    );

    // Determine if likely Eric speaking
    const likelyEric = hasFirstPerson && speakerCount > 0;

    // Find mentioned people
    const peopleNames = ['jordan', 'ella', 'emmy', 'evy', 'asa', 'eric'];
    const mentionedPeople = peopleNames.filter((name) => lowerText.includes(name));

    return {
      speakerCount,
      hasFirstPerson,
      likelyEric,
      mentionedPeople,
    };
  }

  /**
   * Analyze search results to identify speaker patterns
   */
  analyzeResultsForSpeakers(results: any[]): {
    ericLikelyIn: string[];
    conversationDocs: string[];
    peopleMetIn: string[];
  } {
    const ericLikelyIn: string[] = [];
    const conversationDocs: string[] = [];
    const peopleMetIn: string[] = [];
    const peopleSet = new Set<string>();

    for (const result of results) {
      const content = result.lifelog?.content || result.content || '';
      const info = this.extractSpeakerInfo(content);

      if (info.likelyEric) {
        ericLikelyIn.push(result.id);
      }

      if (info.speakerCount > 1) {
        conversationDocs.push(result.id);
      }

      if (info.mentionedPeople.length > 0) {
        info.mentionedPeople.forEach((p) => peopleSet.add(p));
        peopleMetIn.push(result.id);
      }
    }

    return {
      ericLikelyIn,
      conversationDocs,
      peopleMetIn,
    };
  }
}

// Singleton instance
export const speakerEnhancer = new SpeakerAttributionEnhancer();
