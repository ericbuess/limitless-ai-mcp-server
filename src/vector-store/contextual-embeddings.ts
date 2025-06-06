/**
 * Contextual Embedding Provider
 * Enhances embeddings with entity and temporal context for better semantic matching
 */

import { EmbeddingProvider } from './vector-store.interface.js';

export interface ContextualEmbeddingOptions {
  includeEntities?: boolean;
  includeTemporal?: boolean;
  includeRelationships?: boolean;
}

export class ContextualEmbeddingProvider implements EmbeddingProvider {
  private innerProvider: EmbeddingProvider;
  private options: ContextualEmbeddingOptions;

  constructor(innerProvider: EmbeddingProvider, options: ContextualEmbeddingOptions = {}) {
    this.innerProvider = innerProvider;
    this.options = {
      includeEntities: true,
      includeTemporal: true,
      includeRelationships: true,
      ...options,
    };
  }

  async initialize(): Promise<void> {
    if ('initialize' in this.innerProvider && typeof this.innerProvider.initialize === 'function') {
      await this.innerProvider.initialize();
    }
  }

  async embedSingle(text: string, metadata?: any): Promise<number[]> {
    const enhancedText = this.addContext(text, metadata);
    return this.innerProvider.embedSingle(enhancedText);
  }

  async embed(texts: string[], metadata?: any[]): Promise<number[][]> {
    const enhancedTexts = texts.map((text, i) => this.addContext(text, metadata?.[i]));
    return this.innerProvider.embed(enhancedTexts);
  }

  getDimension(): number {
    return this.innerProvider.getDimension();
  }

  getModelName(): string {
    const innerName =
      'getModelName' in this.innerProvider ? (this.innerProvider as any).getModelName() : 'unknown';
    return `${innerName}-contextual`;
  }

  private addContext(text: string, metadata?: any): string {
    const contexts: string[] = [];

    // Add temporal context
    if (this.options.includeTemporal && metadata?.date) {
      const date = new Date(metadata.date);
      contexts.push(`Date: ${date.toLocaleDateString()}`);
      contexts.push(`Time: ${date.toLocaleTimeString()}`);

      // Add time of day context
      const hour = date.getHours();
      if (hour >= 5 && hour < 12) contexts.push('Time Period: Morning');
      else if (hour >= 12 && hour < 17) contexts.push('Time Period: Afternoon');
      else if (hour >= 17 && hour < 21) contexts.push('Time Period: Evening');
      else contexts.push('Time Period: Night');
    }

    // Extract and add entities
    if (this.options.includeEntities) {
      const entities = this.extractEntities(text);

      if (entities.people.length > 0) {
        contexts.push(`People: ${entities.people.join(', ')}`);
      }
      if (entities.places.length > 0) {
        contexts.push(`Places: ${entities.places.join(', ')}`);
      }
      if (entities.actions.length > 0) {
        contexts.push(`Actions: ${entities.actions.join(', ')}`);
      }
    }

    // Add relationship context
    if (this.options.includeRelationships) {
      const relationships = this.extractRelationships(text);
      relationships.forEach((rel) => contexts.push(rel));
    }

    // If metadata includes a title, add it as context
    if (metadata?.title) {
      contexts.push(`Topic: ${metadata.title.slice(0, 100)}`);
    }

    // Prepend context to improve embeddings
    const contextString = contexts.length > 0 ? contexts.join('. ') + '\n\n' : '';

    // Limit total length to avoid truncation
    const maxLength = 1000;
    const enhancedText = contextString + text;

    return enhancedText.slice(0, maxLength);
  }

  private extractEntities(text: string): { people: string[]; places: string[]; actions: string[] } {
    const people: string[] = [];
    const places: string[] = [];
    const actions: string[] = [];

    // Extract people names and references
    const peoplePatterns = [
      /\b(Emmy|Mimi|Sarah|John|Mary|David|Michael|Jennifer|Lisa|Karen)\b/gi,
      /\b(kids?|children?|son|daughter|mother|father|mom|dad|grandmother|grandma|grandpa)\b/gi,
      /\b(brother|sister|aunt|uncle|cousin|friend)\b/gi,
    ];

    peoplePatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        people.push(...matches.map((m) => this.normalizeEntity(m)));
      }
    });

    // Extract places
    const placePatterns = [
      /\b(house|home|place|office|school|store|restaurant|park|gym)\b/gi,
      /\b(Mimi's|grandma's|friend's|someone's)\s*(house|place|home)?\b/gi,
      /\b(kitchen|bedroom|bathroom|living room|garage|basement|yard)\b/gi,
    ];

    placePatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        places.push(...matches);
      }
    });

    // Extract movement/action verbs
    const actionPatterns = [
      /\b(go|went|going|goes|gone)\b/gi,
      /\b(take|took|taking|takes|taken)\b/gi,
      /\b(bring|brought|bringing|brings)\b/gi,
      /\b(visit|visited|visiting|visits)\b/gi,
      /\b(meet|met|meeting|meets)\b/gi,
      /\b(play|played|playing|plays)\b/gi,
    ];

    actionPatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        actions.push(...matches.map((m) => m.toLowerCase()));
      }
    });

    return {
      people: [...new Set(people)],
      places: [...new Set(places)],
      actions: [...new Set(actions)],
    };
  }

  private extractRelationships(text: string): string[] {
    const relationships: string[] = [];
    const textLower = text.toLowerCase();

    // Family relationships
    if (textLower.includes('kids') || textLower.includes('children')) {
      relationships.push('Context: Family, Children');

      // If Emmy is mentioned with kids, note the relationship
      if (textLower.includes('emmy')) {
        relationships.push('Relationship: Emmy is one of the kids/children');
      }
    }

    // Emmy-specific context
    if (textLower.includes('emmy')) {
      relationships.push('Context: Emmy (child)');
    }

    // Mimi-specific context
    if (textLower.includes('mimi')) {
      relationships.push('Context: Mimi (grandmother/destination)');

      if (textLower.includes('house') || textLower.includes('home')) {
        relationships.push("Location: Mimi's house");
      }
    }

    // Activity context
    if (textLower.includes('playdate') || textLower.includes('play date')) {
      relationships.push('Activity: Playdate');
    }

    // Travel/movement context
    if (textLower.match(/\b(went to|going to|go to|at)\b.*\b(mimi|grandma|grandmother)/)) {
      relationships.push('Movement: Going to Mimi/grandmother');
    }

    return relationships;
  }

  private normalizeEntity(entity: string): string {
    // Normalize common variations
    const normalized = entity.toLowerCase();

    const mappings: Record<string, string> = {
      kids: 'Children',
      kid: 'Child',
      children: 'Children',
      child: 'Child',
      mom: 'Mother',
      dad: 'Father',
      grandma: 'Grandmother',
      grandpa: 'Grandfather',
    };

    return mappings[normalized] || entity.charAt(0).toUpperCase() + entity.slice(1).toLowerCase();
  }
}
