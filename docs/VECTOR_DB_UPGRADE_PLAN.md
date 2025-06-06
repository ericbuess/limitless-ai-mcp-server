# Vector DB Upgrade Plan

## Current Problems

1. **Poor Semantic Understanding**: Searching "where did the kids go this afternoon?" returns 0 vector results while the answer exists in the data
2. **Outdated Embedding Model**: all-MiniLM-L6-v2 (384 dims) is too small for nuanced understanding
3. **No Hybrid Retrieval**: Vector and keyword search work in isolation instead of together
4. **Poor Chunking Strategy**: Embedding entire documents loses granular semantic meaning

## Proposed Solutions

### Option 1: Upgrade to State-of-the-Art Embeddings (Recommended)

**Use OpenAI's text-embedding-3-small or Cohere's embed-v3**

- Much better semantic understanding (1536+ dimensions)
- Specifically trained for retrieval tasks
- Cost: ~$0.02 per 1000 pages

**Implementation**:

```typescript
// Use OpenAI embeddings
import OpenAI from 'openai';

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private openai: OpenAI;

  async embedSingle(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }
}
```

### Option 2: Implement Proper Hybrid Search

**BM25 + Vector with Reciprocal Rank Fusion**

```typescript
class HybridSearcher {
  async search(query: string) {
    // Get both keyword and vector results
    const keywordResults = await this.bm25Search(query);
    const vectorResults = await this.vectorSearch(query);

    // Combine with RRF
    return this.reciprocalRankFusion([keywordResults, vectorResults]);
  }

  reciprocalRankFusion(resultSets: SearchResult[][], k = 60) {
    const scores = new Map<string, number>();

    resultSets.forEach((results) => {
      results.forEach((result, rank) => {
        const score = 1.0 / (k + rank);
        scores.set(result.id, (scores.get(result.id) || 0) + score);
      });
    });

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => ({ id, score }));
  }
}
```

### Option 3: Implement Semantic Chunking

**Split documents into semantic chunks with overlap**

```typescript
class SemanticChunker {
  async chunkDocument(content: string, metadata: any) {
    // Split by sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];

    // Create overlapping chunks of 3-5 sentences
    const chunks = [];
    const chunkSize = 4;
    const overlap = 1;

    for (let i = 0; i < sentences.length; i += chunkSize - overlap) {
      const chunk = sentences.slice(i, i + chunkSize).join(' ');

      chunks.push({
        content: chunk,
        metadata: {
          ...metadata,
          chunkIndex: i,
          sentenceRange: [i, Math.min(i + chunkSize, sentences.length)],
        },
      });
    }

    return chunks;
  }
}
```

### Option 4: Use Qdrant or Weaviate (Off-the-shelf)

**Qdrant** - Purpose-built vector database

- Better performance at scale
- Built-in hybrid search
- Semantic caching
- Faceted search support

```typescript
import { QdrantClient } from '@qdrant/js-client';

const client = new QdrantClient({
  url: 'http://localhost:6333',
});

// Create collection with proper configuration
await client.createCollection('lifelogs', {
  vectors: {
    size: 1536,
    distance: 'Cosine',
  },
  optimizers_config: {
    default_segment_number: 2,
  },
});

// Search with filters
const results = await client.search('lifelogs', {
  vector: queryEmbedding,
  filter: {
    must: [{ key: 'date', range: { gte: startDate, lte: endDate } }],
  },
  limit: 20,
  with_payload: true,
});
```

### Option 5: Implement Graph-Enhanced Retrieval

**Build a knowledge graph layer**

```typescript
interface Entity {
  id: string;
  type: 'person' | 'place' | 'event' | 'topic';
  name: string;
  aliases: string[];
}

interface Relationship {
  source: string;
  target: string;
  type: 'mentioned_with' | 'located_at' | 'participated_in';
  weight: number;
}

class KnowledgeGraph {
  private entities = new Map<string, Entity>();
  private relationships = new Map<string, Relationship[]>();

  async extractEntities(content: string) {
    // Use NER to extract entities
    const entities = await this.ner.extract(content);

    // Build relationships based on co-occurrence
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        this.addRelationship(entities[i], entities[j], 'mentioned_with');
      }
    }
  }

  async enhanceQuery(query: string) {
    // Find entities in query
    const queryEntities = await this.ner.extract(query);

    // Expand with related entities
    const expanded = new Set(queryEntities);
    for (const entity of queryEntities) {
      const related = this.getRelatedEntities(entity);
      related.forEach((e) => expanded.add(e));
    }

    return Array.from(expanded);
  }
}
```

## Recommended Implementation Path

1. **Immediate**: Implement proper hybrid search with BM25 + current vectors
2. **Short-term**: Upgrade to better embeddings (OpenAI/Cohere)
3. **Medium-term**: Add semantic chunking with overlap
4. **Long-term**: Consider Qdrant + knowledge graph for complex queries

## Expected Improvements

- **Current**: "where did kids go" → 0 vector results
- **After upgrade**: "where did kids go" → Emmy/Mimi's house as top result
- **Semantic understanding**: "children" would match "kids", "went" would match "go"
- **Context awareness**: Afternoon timestamp would boost relevant time-period results
