import { logger } from '../utils/logger.js';
import { meetingSummaryExtractor, MeetingSummary } from './meeting-summary-extractor.js';
import { Phase2Lifelog } from '../types/phase2.js';

export interface ChunkMetadata {
  chunkIndex: number;
  sentenceRange: [number, number];
  temporalContext?: string[];
  entities?: string[];
  foodMentions?: string[];
  summary?: string;
  originalDocumentId: string;
  originalMetadata?: any;
  // Meeting-specific metadata
  isMeetingContent?: boolean;
  meetingTopics?: string[];
  actionItems?: Array<{ description: string; owner?: string }>;
  decisions?: string[];
  participants?: string[];
}

export interface SemanticChunk {
  content: string;
  metadata: ChunkMetadata;
}

/**
 * Semantic chunker that creates overlapping chunks with context preservation
 * Optimized for lifelog/transcript content
 */
export class SemanticChunker {
  private chunkSize: number;
  private overlap: number;
  private minChunkSize: number;
  private maxChunkSize: number;
  private includeMeetingSummaries: boolean;

  constructor(
    options: {
      chunkSize?: number;
      overlap?: number;
      minChunkSize?: number;
      maxChunkSize?: number;
      includeMeetingSummaries?: boolean;
    } = {}
  ) {
    this.chunkSize = options.chunkSize || 5; // 5 sentences by default
    this.overlap = options.overlap || 2; // 2 sentence overlap
    this.minChunkSize = options.minChunkSize || 50; // Min 50 characters
    this.maxChunkSize = options.maxChunkSize || 2000; // Max 2000 characters
    this.includeMeetingSummaries = options.includeMeetingSummaries ?? true; // Default to true
  }

  /**
   * Chunk a document into semantic units with overlap
   */
  async chunkDocument(
    content: string,
    documentId: string,
    metadata?: any
  ): Promise<SemanticChunk[]> {
    // Extract meeting summary if enabled
    let meetingSummary: MeetingSummary | null = null;
    if (this.includeMeetingSummaries) {
      const lifelog: Phase2Lifelog = {
        id: documentId,
        content,
        title: metadata?.title || '',
        createdAt: metadata?.date || new Date().toISOString(),
        duration: metadata?.duration || 0,
        startTime: metadata?.date || new Date().toISOString(),
        endTime: metadata?.date || new Date().toISOString(),
      };
      meetingSummary = meetingSummaryExtractor.extractSummary(lifelog);
    }

    // Split into sentences
    const sentences = this.splitIntoSentences(content);

    if (sentences.length === 0) {
      return [];
    }

    const chunks: SemanticChunk[] = [];
    const stride = Math.max(1, this.chunkSize - this.overlap);

    for (let i = 0; i < sentences.length; i += stride) {
      const chunkSentences = sentences.slice(i, i + this.chunkSize);
      const chunkContent = chunkSentences.join(' ').trim();

      // Skip chunks that are too small
      if (chunkContent.length < this.minChunkSize && i + this.chunkSize < sentences.length) {
        continue;
      }

      // Split chunks that are too large
      if (chunkContent.length > this.maxChunkSize) {
        const subChunks = this.splitLargeChunk(chunkContent, documentId, metadata, i);
        chunks.push(...subChunks);
        continue;
      }

      // Extract temporal context
      const temporalContext = this.extractTemporalContext(chunkContent);

      // Extract entities
      const entities = this.extractEntities(chunkContent);

      // Extract food mentions
      const foodMentions = this.extractFoodMentions(chunkContent);

      // Generate chunk summary (first sentence or key terms)
      const summary = this.generateChunkSummary(chunkContent);

      // Create base metadata
      const chunkMetadata: ChunkMetadata = {
        chunkIndex: i,
        sentenceRange: [i, Math.min(i + this.chunkSize, sentences.length)] as [number, number],
        temporalContext: temporalContext.length > 0 ? temporalContext : undefined,
        entities: entities.length > 0 ? entities : undefined,
        foodMentions: foodMentions.length > 0 ? foodMentions : undefined,
        summary,
        originalDocumentId: documentId,
        originalMetadata: metadata,
      };

      // Add meeting metadata if this document has meeting content
      if (meetingSummary) {
        chunkMetadata.isMeetingContent = true;

        // Add relevant meeting metadata to chunks that might contain meeting content
        // We'll check if this chunk contains any action items or decision keywords
        const chunkLower = chunkContent.toLowerCase();
        const hasMeetingIndicators =
          chunkLower.includes('action') ||
          chunkLower.includes('decided') ||
          chunkLower.includes('agreed') ||
          chunkLower.includes('next step') ||
          chunkLower.includes('will') ||
          chunkLower.includes('should');

        if (hasMeetingIndicators || i === 0) {
          // Include in first chunk always
          chunkMetadata.participants = meetingSummary.participants;
          chunkMetadata.meetingTopics = meetingSummary.mainTopics;

          // Only include action items that might be in this chunk
          const relevantActionItems = meetingSummary.actionItems
            .filter((item) => {
              const itemLower = item.description.toLowerCase();
              return chunkLower.includes(itemLower.substring(0, 20)); // Check first 20 chars
            })
            .map((item) => ({
              description: item.description,
              owner: item.owner,
            }));

          if (relevantActionItems.length > 0) {
            chunkMetadata.actionItems = relevantActionItems;
          }

          // Only include decisions that might be in this chunk
          const relevantDecisions = meetingSummary.decisions.filter((decision) => {
            const decisionLower = decision.toLowerCase();
            return chunkLower.includes(decisionLower.substring(0, 20));
          });

          if (relevantDecisions.length > 0) {
            chunkMetadata.decisions = relevantDecisions;
          }
        }
      }

      chunks.push({
        content: chunkContent,
        metadata: chunkMetadata,
      });
    }

    logger.debug('Document chunked', {
      documentId,
      originalLength: content.length,
      sentences: sentences.length,
      chunks: chunks.length,
    });

    return chunks;
  }

  /**
   * Split text into sentences using multiple heuristics
   */
  private splitIntoSentences(text: string): string[] {
    // First, try using Intl.Segmenter if available
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      try {
        const segmenter = new (Intl as any).Segmenter('en', { granularity: 'sentence' });
        const sentences = Array.from(segmenter.segment(text))
          .map((segment: any) => segment.segment.trim())
          .filter((s: string) => s.length > 0);

        if (sentences.length > 0) {
          return sentences;
        }
      } catch {
        // Fall through to regex-based approach
      }
    }

    // Fallback: Enhanced regex-based sentence splitting
    // Handle common abbreviations and edge cases
    const abbreviations = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sr', 'Jr', 'vs', 'etc', 'i.e', 'e.g'];

    // Protect abbreviations by replacing dots temporarily
    let protectedText = text;
    abbreviations.forEach((abbr) => {
      const pattern = new RegExp(`\\b${abbr}\\.`, 'gi');
      protectedText = protectedText.replace(pattern, `${abbr}¤`);
    });

    // Protect decimal numbers
    protectedText = protectedText.replace(/(\d)\.(\d)/g, '$1¤$2');

    // Split on sentence boundaries
    const sentences = protectedText
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/¤/g, '.')); // Restore protected dots

    // If regex splitting fails, fall back to simple approach
    if (sentences.length === 0) {
      return text
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    return sentences;
  }

  /**
   * Split large chunks into smaller pieces
   */
  private splitLargeChunk(
    content: string,
    documentId: string,
    metadata: any,
    startIndex: number
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const words = content.split(/\s+/);
    const wordsPerChunk = Math.ceil(this.maxChunkSize / 5); // Approximate words

    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      const chunkContent = chunkWords.join(' ');

      chunks.push({
        content: chunkContent,
        metadata: {
          chunkIndex: startIndex + i / wordsPerChunk,
          sentenceRange: [startIndex, startIndex + 1] as [number, number],
          summary: this.generateChunkSummary(chunkContent),
          originalDocumentId: documentId,
          originalMetadata: metadata,
        },
      });
    }

    return chunks;
  }

  /**
   * Extract temporal context from chunk
   */
  private extractTemporalContext(text: string): string[] {
    const contexts: string[] = [];

    // Time of day patterns
    const timePatterns = [
      /\b(morning|afternoon|evening|night|midnight|noon)\b/gi,
      /\b\d{1,2}:\d{2}\s*(am|pm|AM|PM)?\b/g,
      /\b(today|yesterday|tomorrow)\b/gi,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
      /\b(last|next|this)\s+(week|month|year|weekend)\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
    ];

    for (const pattern of timePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        contexts.push(...matches.map((m) => m.toLowerCase()));
      }
    }

    // Deduplicate and return
    return [...new Set(contexts)];
  }

  /**
   * Generate a summary for the chunk
   */
  private generateChunkSummary(content: string): string {
    // Simple approach: Use first sentence or extract key terms
    const sentences = this.splitIntoSentences(content);
    if (sentences.length > 0) {
      // Return first sentence, truncated if necessary
      const firstSentence = sentences[0];
      if (firstSentence.length <= 100) {
        return firstSentence;
      }
      return firstSentence.substring(0, 97) + '...';
    }

    // Fallback: Extract most common significant words
    const words = content.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();
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
      'including',
      'until',
      'against',
      'among',
      'throughout',
      'despite',
      'towards',
      'upon',
      'concerning',
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
      'should',
      'could',
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
      'he',
      'she',
      'it',
      'we',
      'they',
      'them',
      'their',
      'what',
      'which',
      'who',
      'whom',
      'whose',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'some',
      'any',
      'few',
      'more',
      'most',
      'other',
      'another',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
    ]);

    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Get top 5 most common words
    const topWords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    return topWords.join(', ') || content.substring(0, 50) + '...';
  }

  /**
   * Extract entities (people, places, etc.) from text
   */
  private extractEntities(text: string): string[] {
    const entities = new Set<string>();

    // Extract people names
    const peoplePatterns = [
      // Family members
      /\b(?:Eric|Jordan|Ella|Evy|Emmy|Asa)\b/gi,
      // Common names
      /\b(?:Sarah|John|Mary|James|Jennifer|Michael|Lisa|David)\b/gi,
      // Pronouns that might indicate people
      /\b(?:I|me|my|we|us|our|he|she|they|him|her|them)\b/gi,
    ];

    // Extract places
    const placePatterns = [
      // Restaurants and stores
      /\b(?:Smoothie King|Chick-fil-A|McDonald's|Starbucks|Subway|Wendy's|Burger King|Taco Bell)\b/gi,
      /\b(?:Target|Walmart|HEB|Whole Foods|Costco|Sam's Club)\b/gi,
      // Locations
      /\b(?:home|house|school|work|office|store|restaurant|park|gym)\b/gi,
      // Cities
      /\b(?:Waco|Temple|Dallas|Austin|Houston|San Antonio|Fort Worth)\b/gi,
    ];

    const allPatterns = [...peoplePatterns, ...placePatterns];

    for (const pattern of allPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          // Normalize pronouns
          const normalized = match.toLowerCase();
          if (['i', 'me', 'my'].includes(normalized)) {
            entities.add('Eric'); // User is Eric
          } else if (['we', 'us', 'our'].includes(normalized)) {
            entities.add('family');
          } else {
            entities.add(match);
          }
        });
      }
    }

    return Array.from(entities);
  }

  /**
   * Extract food and restaurant mentions from text
   */
  private extractFoodMentions(text: string): string[] {
    const foodMentions = new Set<string>();

    // Restaurant names
    const restaurantPatterns = [
      /\b(?:Smoothie King|Chick-fil-A|McDonald's|Starbucks|Subway|Wendy's|Burger King|Taco Bell)\b/gi,
      /\b(?:Pizza Hut|Domino's|Papa John's|Little Caesars)\b/gi,
      /\b(?:Chipotle|Qdoba|Panera|Five Guys|In-N-Out)\b/gi,
    ];

    // Food items
    const foodPatterns = [
      // Drinks
      /\b(?:smoothie|coffee|tea|juice|soda|water|milk|shake|latte|cappuccino)\b/gi,
      // Main dishes
      /\b(?:burger|sandwich|pizza|pasta|salad|soup|burrito|taco|nuggets|chicken|steak)\b/gi,
      // Sides and snacks
      /\b(?:fries|chips|nuggets|wings|bread|rice|beans|vegetables)\b/gi,
      // Desserts
      /\b(?:ice cream|cake|cookie|brownie|donut|candy)\b/gi,
      // Meal types
      /\b(?:breakfast|lunch|dinner|snack|meal|food)\b/gi,
    ];

    // Eating actions
    const eatingPatterns = [
      /\b(?:eat|ate|eating|had|having|ordered|ordering|got|getting|stopped at|went to)\s+(?:at\s+)?(\w+(?:\s+\w+)*)/gi,
    ];

    // Extract restaurant names
    for (const pattern of restaurantPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => foodMentions.add(match));
      }
    }

    // Extract food items
    for (const pattern of foodPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => foodMentions.add(match.toLowerCase()));
      }
    }

    // Extract eating actions with context
    for (const pattern of eatingPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const action = match[0];
        const location = match[1];
        if (location && location.length < 50) {
          foodMentions.add(action);
        }
      }
    }

    return Array.from(foodMentions);
  }

  /**
   * Create chunks specifically for conversational/transcript content
   */
  async chunkTranscript(
    content: string,
    documentId: string,
    metadata?: any
  ): Promise<SemanticChunk[]> {
    // For transcripts, we want to preserve conversation flow
    // Look for speaker changes or topic shifts

    const lines = content.split('\n');
    const chunks: SemanticChunk[] = [];
    let currentChunk: string[] = [];
    let currentSpeaker: string | null = null;
    let chunkIndex = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Detect speaker changes (common patterns)
      const speakerMatch = trimmedLine.match(/^[-•]\s*([^:]+):\s*(.*)$/);
      const newSpeaker = speakerMatch ? speakerMatch[1] : null;

      // Create new chunk on speaker change or size limit
      const shouldCreateChunk =
        (newSpeaker && newSpeaker !== currentSpeaker && currentChunk.length > 0) ||
        currentChunk.join(' ').length > this.maxChunkSize;

      if (shouldCreateChunk) {
        const chunkContent = currentChunk.join('\n').trim();
        if (chunkContent.length >= this.minChunkSize) {
          const temporalContext = this.extractTemporalContext(chunkContent);
          const entities = this.extractEntities(chunkContent);
          const foodMentions = this.extractFoodMentions(chunkContent);

          chunks.push({
            content: chunkContent,
            metadata: {
              chunkIndex: chunkIndex++,
              sentenceRange: [chunkIndex, chunkIndex + 1] as [number, number],
              temporalContext: temporalContext.length > 0 ? temporalContext : undefined,
              entities: entities.length > 0 ? entities : undefined,
              foodMentions: foodMentions.length > 0 ? foodMentions : undefined,
              summary: this.generateChunkSummary(chunkContent),
              originalDocumentId: documentId,
              originalMetadata: {
                ...metadata,
                speaker: currentSpeaker,
              },
            },
          });
        }
        currentChunk = [];
      }

      if (trimmedLine) {
        currentChunk.push(trimmedLine);
        if (newSpeaker) {
          currentSpeaker = newSpeaker;
        }
      }
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n').trim();
      if (chunkContent.length >= this.minChunkSize) {
        const temporalContext = this.extractTemporalContext(chunkContent);
        const entities = this.extractEntities(chunkContent);
        const foodMentions = this.extractFoodMentions(chunkContent);

        chunks.push({
          content: chunkContent,
          metadata: {
            chunkIndex: chunkIndex++,
            sentenceRange: [chunkIndex, chunkIndex + 1] as [number, number],
            temporalContext: temporalContext.length > 0 ? temporalContext : undefined,
            entities: entities.length > 0 ? entities : undefined,
            foodMentions: foodMentions.length > 0 ? foodMentions : undefined,
            summary: this.generateChunkSummary(chunkContent),
            originalDocumentId: documentId,
            originalMetadata: {
              ...metadata,
              speaker: currentSpeaker,
            },
          },
        });
      }
    }

    return chunks;
  }
}
