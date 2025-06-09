/**
 * Configurable Contextual Embedding Provider
 * Loads entity relationships from external configuration file
 */

import { EmbeddingProvider } from './vector-store.interface.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export interface EntityConfig {
  type: string;
  aliases: string[];
  relationships: Record<string, string>;
  context?: string;
}

export interface RelationshipConfig {
  entities: {
    people: Record<string, EntityConfig>;
    places: Record<string, EntityConfig>;
  };
  groupMappings: Record<string, string[]>;
  contextRules: Array<{
    pattern: string;
    implies: string;
  }>;
}

export interface ConfigurableContextualOptions {
  configPath?: string;
  includeEntities?: boolean;
  includeTemporal?: boolean;
  includeRelationships?: boolean;
}

export class ConfigurableContextualEmbeddingProvider implements EmbeddingProvider {
  private innerProvider: EmbeddingProvider;
  private options: ConfigurableContextualOptions;
  private config?: RelationshipConfig;
  private entityLookup: Map<string, EntityConfig> = new Map();
  private aliasToEntity: Map<string, string> = new Map();

  constructor(innerProvider: EmbeddingProvider, options: ConfigurableContextualOptions = {}) {
    this.innerProvider = innerProvider;
    this.options = {
      configPath: './config/entity-relationships.json',
      includeEntities: true,
      includeTemporal: true,
      includeRelationships: true,
      ...options,
    };
  }

  async initialize(): Promise<void> {
    // Initialize inner provider
    if ('initialize' in this.innerProvider && typeof this.innerProvider.initialize === 'function') {
      await this.innerProvider.initialize();
    }

    // Load configuration
    await this.loadConfiguration();
  }

  private async loadConfiguration(): Promise<void> {
    if (!this.options.configPath) return;

    try {
      const configPath = path.resolve(this.options.configPath);
      const configData = await fs.readFile(configPath, 'utf-8');
      this.config = JSON.parse(configData);

      // Build lookup tables
      this.buildLookupTables();

      logger.info('Loaded entity relationship configuration', {
        people: Object.keys(this.config?.entities.people || {}).length,
        places: Object.keys(this.config?.entities.places || {}).length,
        groups: Object.keys(this.config?.groupMappings || {}).length,
        rules: this.config?.contextRules.length || 0,
      });
    } catch (error) {
      logger.warn('Could not load entity configuration, using general approach', {
        path: this.options.configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private buildLookupTables(): void {
    if (!this.config) return;

    // Build entity lookup
    for (const [name, entity] of Object.entries(this.config.entities.people)) {
      this.entityLookup.set(name.toLowerCase(), entity);

      // Map aliases to canonical name
      this.aliasToEntity.set(name.toLowerCase(), name);
      for (const alias of entity.aliases) {
        this.aliasToEntity.set(alias.toLowerCase(), name);
      }
    }

    for (const [name, entity] of Object.entries(this.config.entities.places)) {
      this.entityLookup.set(name.toLowerCase(), entity);
      this.aliasToEntity.set(name.toLowerCase(), name);
      for (const alias of entity.aliases) {
        this.aliasToEntity.set(alias.toLowerCase(), name);
      }
    }
  }

  async embedSingle(text: string, metadata?: any): Promise<number[]> {
    const enhancedText = this.addContext(text, metadata);
    return this.innerProvider.embedSingle(enhancedText, metadata);
  }

  async embed(texts: string[], metadata?: any[]): Promise<number[][]> {
    const enhancedTexts = texts.map((text, i) => this.addContext(text, metadata?.[i]));
    return this.innerProvider.embed(enhancedTexts, metadata);
  }

  getDimension(): number {
    return this.innerProvider.getDimension();
  }

  getModelName(): string {
    const innerName =
      'getModelName' in this.innerProvider ? (this.innerProvider as any).getModelName() : 'unknown';
    return `${innerName}-configurable-contextual`;
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
      const entities = this.extractConfiguredEntities(text);

      if (entities.people.length > 0) {
        contexts.push(`People: ${entities.people.join(', ')}`);
      }
      if (entities.places.length > 0) {
        contexts.push(`Places: ${entities.places.join(', ')}`);
      }
      if (entities.groups.length > 0) {
        contexts.push(`Groups: ${entities.groups.join(', ')}`);
      }
    }

    // Add relationship context
    if (this.options.includeRelationships && this.config) {
      const relationships = this.extractRelationships(text);
      relationships.forEach((rel) => contexts.push(rel));
    }

    // Apply context rules
    if (this.config?.contextRules) {
      const appliedRules = this.applyContextRules(text);
      contexts.push(...appliedRules);
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

  private extractConfiguredEntities(text: string): {
    people: string[];
    places: string[];
    groups: string[];
  } {
    const people: string[] = [];
    const places: string[] = [];
    const groups: string[] = [];
    const textLower = text.toLowerCase();

    if (!this.config) {
      // Fallback to general entity extraction
      return this.extractGeneralEntities(text);
    }

    // Check for configured entities and their aliases
    for (const [alias, canonicalName] of this.aliasToEntity) {
      if (textLower.includes(alias)) {
        const entity = this.entityLookup.get(canonicalName.toLowerCase());
        if (entity) {
          if (entity.type === 'person') {
            people.push(canonicalName);
          } else if (entity.type === 'place') {
            places.push(canonicalName);
          }
        }
      }
    }

    // Check for group mentions
    for (const [groupName, members] of Object.entries(this.config.groupMappings)) {
      if (textLower.includes(groupName)) {
        groups.push(groupName);
        // Also add individual members if not already present
        for (const member of members) {
          if (!people.includes(member)) {
            people.push(member);
          }
        }
      }
    }

    return {
      people: [...new Set(people)],
      places: [...new Set(places)],
      groups: [...new Set(groups)],
    };
  }

  private extractGeneralEntities(text: string): {
    people: string[];
    places: string[];
    groups: string[];
  } {
    const people: string[] = [];
    const places: string[] = [];

    // Extract proper names (capitalized words)
    const properNamePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const properNames = text.match(properNamePattern) || [];
    people.push(...properNames);

    // Extract places
    const placePattern = /\b(\w+)'s\s*(house|home|place)\b/gi;
    const placeMatches = [...text.matchAll(placePattern)];
    places.push(...placeMatches.map((m) => m[0]));

    return {
      people: [...new Set(people)],
      places: [...new Set(places)],
      groups: [],
    };
  }

  private extractRelationships(text: string): string[] {
    if (!this.config) return [];

    const relationships: string[] = [];
    const textLower = text.toLowerCase();
    const foundEntities = this.extractConfiguredEntities(text);

    // For each person found, add their relationships
    for (const personName of foundEntities.people) {
      const person = this.config.entities.people[personName];
      if (person && person.relationships) {
        // Check if any related entities are also mentioned
        for (const [relatedEntity, relationshipType] of Object.entries(person.relationships)) {
          if (
            foundEntities.people.includes(relatedEntity) ||
            textLower.includes(relatedEntity.toLowerCase())
          ) {
            relationships.push(`Relationship: ${personName}-${relationshipType}-${relatedEntity}`);
          }
        }
      }

      // Add person context if available
      if (person?.context) {
        relationships.push(`Context: ${person.context}`);
      }
    }

    // Add movement context if relevant
    if (textLower.match(/\b(go|went|going)\b/) && foundEntities.places.length > 0) {
      relationships.push(`Movement: Going to ${foundEntities.places.join(' or ')}`);
    }

    return [...new Set(relationships)];
  }

  private applyContextRules(text: string): string[] {
    if (!this.config?.contextRules) return [];

    const contexts: string[] = [];
    const textLower = text.toLowerCase();

    for (const rule of this.config.contextRules) {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(textLower)) {
        contexts.push(rule.implies);
      }
    }

    return contexts;
  }
}
