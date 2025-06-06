# Vector DB Upgrade Plan - LOCAL MODELS FOCUS

## Current Problems

1. **Poor Semantic Understanding**: Searching "where did the kids go this afternoon?" returns 0 vector results while the answer exists in the data
2. **Outdated Embedding Model**: all-MiniLM-L6-v2 (384 dims) is too small for nuanced understanding
3. **No Hybrid Retrieval**: Vector and keyword search work in isolation instead of together
4. **Poor Chunking Strategy**: Embedding entire documents loses granular semantic meaning
5. **Context-Aware-Filter Dominance**: Consensus scoring gives too much weight to filter results, not enough to direct keyword matches

## Hardware Available

- **Machine**: M4 MacBook Pro Max
- **Memory**: 128GB unified memory
- **Capabilities**: Metal Performance Shaders (MPS), Neural Engine
- **Local Processing**: All data stays on device

## Proposed Solutions - LOCAL MODELS PRIORITY

### Option 1: Upgrade to Local State-of-the-Art Embeddings (RECOMMENDED)

**Immediate Upgrade - Ollama with nomic-embed-text**

```bash
# Install Ollama
brew install ollama

# Start Ollama service
ollama serve

# Pull recommended model (768 dimensions, 2x improvement)
ollama pull nomic-embed-text
```

**Implementation**:

```typescript
// src/vector-store/ollama-embeddings.ts
import { EmbeddingProvider } from './vector-store.interface.js';
import axios from 'axios';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private model: string;
  private baseUrl: string;

  constructor(model: string = 'nomic-embed-text') {
    this.model = model;
    this.baseUrl = 'http://localhost:11434';
  }

  async embedSingle(text: string): Promise<number[]> {
    const response = await axios.post(`${this.baseUrl}/api/embeddings`, {
      model: this.model,
      prompt: text,
    });
    return response.data.embedding;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedSingle(text)));
  }

  getDimension(): number {
    const dimensions = {
      'nomic-embed-text': 768,
      'mxbai-embed-large': 1024,
      'all-minilm': 384,
    };
    return dimensions[this.model] || 768;
  }
}
```

**Best Quality Local Models**:

1. **BGE-M3** (Best overall):
   - 1024 dimensions
   - MTEB score: 71.2
   - 8192 token context
   - Multi-granularity embeddings

```typescript
// src/vector-store/bge-embeddings.ts
import { pipeline } from '@xenova/transformers';

export class BGEM3EmbeddingProvider implements EmbeddingProvider {
  private pipe: any;

  async initialize() {
    this.pipe = await pipeline(
      'feature-extraction',
      'BAAI/bge-m3',
      { device: 'mps' } // Use Metal on M4
    );
  }

  async embedSingle(text: string): Promise<number[]> {
    const output = await this.pipe(text, {
      pooling: 'cls',
      normalize: true,
    });
    return Array.from(output.data);
  }
}
```

2. **E5-Large-V2** (High quality, reasonable size):

   - 1024 dimensions
   - MTEB score: 70.5
   - Fast on Apple Silicon

3. **GTE-Large** (Good balance):
   - 1024 dimensions
   - Optimized for retrieval
   - 512 token context

### Option 2: Implement Proper Hybrid Search with BM25

**Combine keyword and vector search locally**

```typescript
import { BM25 } from 'bm25-ts';

class HybridSearcher {
  private bm25: BM25;
  private vectorStore: LanceDBStore;

  async search(query: string, k: int = 10) {
    // Parallel search
    const [keywordResults, vectorResults] = await Promise.all([
      this.keywordSearch(query, k * 2),
      this.vectorStore.searchByText(query, { topK: k * 2 }),
    ]);

    // Rebalanced fusion - prioritize keyword matches
    return this.rebalancedRankFusion(keywordResults, vectorResults, k);
  }

  private rebalancedRankFusion(
    keywordResults: SearchResult[],
    vectorResults: SearchResult[],
    k: number
  ) {
    const scores = new Map<string, number>();

    // Give more weight to keyword matches (0.6 vs 0.4)
    keywordResults.forEach((result, rank) => {
      const score = 0.6 / (60 + rank);
      scores.set(result.id, score);
    });

    vectorResults.forEach((result, rank) => {
      const currentScore = scores.get(result.id) || 0;
      const vectorScore = 0.4 / (60 + rank);
      scores.set(result.id, currentScore + vectorScore);
    });

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => ({ id, score }));
  }
}
```

### Option 3: Implement Semantic Chunking with Overlap

**Smart chunking that preserves context**

```typescript
class SemanticChunker {
  private sentenceSplitter: any;

  constructor() {
    // Use local sentence splitter
    this.sentenceSplitter = new Intl.Segmenter('en', {
      granularity: 'sentence',
    });
  }

  async chunkDocument(content: string, metadata: any) {
    const sentences = Array.from(this.sentenceSplitter.segment(content)).map((s) => s.segment);

    const chunks = [];
    const chunkSize = 5; // 5 sentences per chunk
    const overlap = 2; // 2 sentence overlap

    for (let i = 0; i < sentences.length; i += chunkSize - overlap) {
      const chunkSentences = sentences.slice(i, i + chunkSize);
      const chunk = chunkSentences.join(' ');

      // Add temporal context if available
      const temporalContext = this.extractTemporalContext(chunk);

      chunks.push({
        content: chunk,
        metadata: {
          ...metadata,
          chunkIndex: i,
          sentenceRange: [i, Math.min(i + chunkSize, sentences.length)],
          temporalContext,
          // Add chunk summary for better retrieval
          summary: await this.generateChunkSummary(chunk),
        },
      });
    }

    return chunks;
  }

  private extractTemporalContext(text: string): string[] {
    const patterns = [
      /\b(today|yesterday|tomorrow)\b/gi,
      /\b(morning|afternoon|evening|night)\b/gi,
      /\b(last|next|this)\s+(week|month|year)\b/gi,
      /\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi,
    ];

    const contexts = [];
    patterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) contexts.push(...matches);
    });

    return [...new Set(contexts)];
  }

  private async generateChunkSummary(chunk: string): Promise<string> {
    // Use first sentence as summary or extract key terms
    const firstSentence = chunk.split(/[.!?]/)[0];
    return firstSentence.slice(0, 100);
  }
}
```

### Option 4: Local Vector DB Optimization (LanceDB)

**Optimize LanceDB for M4 Mac with better indexing**

```typescript
class OptimizedLanceDBStore extends LanceDBStore {
  async createOptimizedIndex() {
    // Create IVF_PQ index for better performance
    await this.table.createIndex({
      type: 'IVF_PQ',
      num_partitions: 256, // More partitions for 128GB RAM
      num_sub_vectors: 32, // Better quantization
      metric: 'cosine',
      accelerator: 'mps', // Use Metal on M4
      cache_size: 10000, // Cache frequently accessed vectors
    });
  }

  async hybridSearch(query: string, options: QueryOptions = {}) {
    // Enrich query with context
    const enrichedQuery = await this.enrichQueryWithContext(query);

    // Get vector results
    const vectorResults = await this.searchByText(enrichedQuery, {
      ...options,
      topK: (options.topK || 10) * 3, // Get more candidates
    });

    // Apply keyword filtering in post-processing
    const keywordFiltered = this.applyKeywordBoost(vectorResults, query, options.topK || 10);

    return keywordFiltered;
  }

  private applyKeywordBoost(
    results: VectorSearchResult[],
    query: string,
    topK: number
  ): VectorSearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/);

    return results
      .map((result) => {
        // Count keyword matches
        const content = (result.content || '').toLowerCase();
        const keywordMatches = queryTerms.filter((term) => content.includes(term)).length;

        // Boost score based on keyword matches
        const boostedScore = result.score * (1 + keywordMatches * 0.2);

        return { ...result, score: boostedScore };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
```

### Option 5: Knowledge Graph Layer (Local)

**Build entity relationships without external APIs**

```typescript
class LocalKnowledgeGraph {
  private entities = new Map<string, Entity>();
  private relationships = new Map<string, Relationship[]>();

  // Use local NER with compromise or similar
  async extractEntities(content: string) {
    const doc = nlp(content);

    const people = doc.people().out('array');
    const places = doc.places().out('array');
    const dates = doc.dates().out('array');

    // Store entities
    people.forEach((person) => {
      this.addEntity(person, 'person');
    });

    places.forEach((place) => {
      this.addEntity(place, 'place');
    });

    // Build co-occurrence relationships
    this.buildCoOccurrenceRelationships(people, places, dates);
  }

  private buildCoOccurrenceRelationships(people: string[], places: string[], dates: string[]) {
    // People at places
    people.forEach((person) => {
      places.forEach((place) => {
        this.addRelationship(person, place, 'located_at', 0.5);
      });
    });

    // People with people
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        this.addRelationship(people[i], people[j], 'mentioned_with', 0.7);
      }
    }
  }

  enhanceSearch(query: string, baseResults: SearchResult[]): SearchResult[] {
    // Extract entities from query
    const queryEntities = this.extractQueryEntities(query);

    // Find related entities
    const relatedEntities = new Set<string>();
    queryEntities.forEach((entity) => {
      const related = this.getRelatedEntities(entity);
      related.forEach((e) => relatedEntities.add(e.name));
    });

    // Boost results containing related entities
    return baseResults.map((result) => {
      let boost = 1.0;
      relatedEntities.forEach((entity) => {
        if (result.content?.includes(entity)) {
          boost += 0.1;
        }
      });

      return { ...result, score: result.score * boost };
    });
  }
}
```

## Recommended Implementation Path

1. **Immediate (Day 1)**:

   - Switch to Ollama + nomic-embed-text (768 dims)
   - Fix consensus scoring to prioritize keyword matches
   - Implement basic hybrid search

2. **Short-term (Week 1)**:

   - Upgrade to BGE-M3 for better quality (1024 dims)
   - Implement semantic chunking with overlap
   - Add temporal context extraction

3. **Medium-term (Week 2-3)**:

   - Optimize LanceDB indexing for M4
   - Implement knowledge graph layer
   - Add cross-encoder reranking

4. **Long-term (Month 2)**:
   - Evaluate E5-Mistral-7B for maximum quality
   - Implement advanced query understanding
   - Add conversational context

## Expected Improvements

### Before (all-MiniLM-L6-v2, 384 dims):

- "where did kids go" → 0 vector results
- "what did I have for lunch" → random food mentions
- Poor understanding of temporal queries

### After (BGE-M3, 1024 dims + hybrid):

- "where did kids go" → Emmy/Mimi's house as #1 result
- "children" automatically matches "kids", "Emmy"
- "afternoon" correctly identifies 12:30 PM timeframe
- 85%+ accuracy on semantic queries

## Performance Expectations on M4 Mac

- **Embedding Speed**:

  - Ollama: 50-100ms per document
  - BGE-M3: 100-200ms per document
  - E5-Large: 200-300ms per document

- **Search Latency**:

  - Hybrid search: 15-30ms
  - With reranking: 50-100ms
  - With knowledge graph: 100-150ms

- **Memory Usage**:
  - Ollama: 2-4GB
  - BGE-M3: 4-6GB
  - E5-Mistral: 20-30GB (well within 128GB limit)

## Migration Strategy

1. **Backup Current Data**:

```bash
cp -r ./data/lancedb ./data/lancedb.backup
cp -r ./data/embeddings ./data/embeddings.backup
```

2. **Test New Model**:

```bash
npm run build
node scripts/benchmark-embeddings.js
```

3. **Rebuild Embeddings**:

```bash
npm run sync:rebuild -- --model=nomic-embed-text
```

4. **Verify Results**:

```bash
npm run search "where did the kids go this afternoon?"
```

5. **Monitor Performance**:

```bash
npm run sync:monitor
```

## Success Metrics

- Vector search returns relevant results for semantic queries
- Search latency under 100ms for 95% of queries
- Consensus scoring properly balances keyword and vector results
- "Kids/Emmy/Mimi" query returns correct result in top 3
- All processing remains local on device
