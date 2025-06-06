# Vector DB Performance Improvement Plan

## Current State Analysis

- **Model**: all-MiniLM-L6-v2 (384 dims) with padding to 768
- **Performance**: Poor semantic understanding (0.3-0.4 similarity scores)
- **Critical Issue**: Can't match "kids" → "Emmy/Mimi" relationships
- **Hardware**: M4 MacBook Pro, 128GB RAM, Ollama installed

## Improvement Plan

### Phase 1: Test Available Ollama Models (30 mins)

1. Check which embedding models are available in Ollama
2. Test top 3 models for quality and speed
3. Benchmark on our specific use case

### Phase 2: Implement Advanced Embeddings (1 hour)

1. Switch to best performing Ollama model (likely nomic-embed-text or mxbai-embed-large)
2. Remove padding workaround - use native dimensions
3. Add contextual enrichment before embedding

### Phase 3: Enhanced Text Processing (1 hour)

1. Implement entity extraction (names, places, relationships)
2. Add temporal context to chunks
3. Create relationship-aware embeddings

### Phase 4: Rebuild Vector Database (30 mins)

1. Backup current database
2. Re-embed all 244 documents with new model
3. Create optimized indexes for M4 architecture

### Phase 5: Test and Validate (30 mins)

1. Run comprehensive search tests
2. Verify "kids → Emmy/Mimi" matching works
3. Compare before/after metrics

## Expected Outcomes

- Similarity scores: 0.3-0.4 → 0.7-0.9
- Mimi result ranking: #19 → Top 5
- Semantic understanding: Actually match related concepts
- Query latency: Maintain <20ms

## Implementation Steps

### Step 1: Available Models Check

```bash
ollama list
ollama pull nomic-embed-text
ollama pull mxbai-embed-large
```

### Step 2: Benchmark Script

Create benchmark to test embedding quality on our specific use cases

### Step 3: Enhanced Embedding Pipeline

- Extract entities before embedding
- Add context to improve matching
- Use larger, better models

### Step 4: Full Rebuild

- Backup, re-process, re-index everything
- Optimize for M4's unified memory architecture

Let's start!
