# Parallel Search Architecture Plan

## Overview

Create a search system where multiple search strategies run in parallel and inform each other's results, improving overall search quality and speed.

## Architecture

```
                    ┌─────────────────────┐
                    │   Search Query      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Query Analyzer     │
                    │ - Extract keywords  │
                    │ - Detect intent     │
                    │ - Time references   │
                    └──────────┬──────────┘
                               │
                ┌──────────────┴──────────────┐
                │      Parallel Executor      │
                │   (Promise.allSettled)      │
                └──┬─────┬─────┬─────┬──────┘
                   │     │     │     │
        ┌──────────▼──┐  │     │  ┌──▼────────────┐
        │Vector Search│  │     │  │Keyword Search │
        │(Semantic)   │  │     │  │(Exact Match)  │
        └──────┬──────┘  │     │  └───────┬───────┘
                   │     │     │           │
                   │  ┌──▼─────▼──┐        │
                   │  │Date Search│        │
                   │  │(Temporal) │        │
                   │  └─────┬─────┘        │
                   │        │              │
                ┌──▼────────▼──────────────▼──┐
                │     Result Aggregator        │
                │ - Merge & deduplicate        │
                │ - Re-rank by relevance       │
                │ - Apply feedback loop        │
                └──────────────┬───────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Enhanced Results   │
                    │ - Confidence scores │
                    │ - Source indicators │
                    │ - Related items     │
                    └─────────────────────┘
```

## Implementation Components

### 1. Query Analyzer

```typescript
interface AnalyzedQuery {
  originalQuery: string;
  keywords: string[];
  temporalHints: {
    isToday: boolean;
    isYesterday: boolean;
    dateRange?: { start: Date; end: Date };
  };
  semanticIntent: 'question' | 'search' | 'command';
  entities: string[]; // Extracted names, projects, etc.
}
```

### 2. Search Strategies

#### A. Vector Search (Semantic)

- Uses transformer embeddings
- Finds conceptually similar content
- Returns: similarity scores, related concepts

#### B. Keyword Search (Fast Pattern)

- In-memory pattern matching
- Exact and fuzzy matching
- Returns: exact matches, context snippets

#### C. Date-based Search

- Temporal filtering
- Recent items prioritization
- Returns: chronological results

#### D. API Search (Fallback)

- Direct Limitless API queries
- For items not yet synced
- Returns: fresh data

### 3. Feedback Mechanism

Each search strategy can enhance others:

```typescript
interface SearchFeedback {
  // Vector search finds keywords to refine pattern search
  suggestedKeywords: string[];

  // Pattern search finds dates to narrow temporal search
  detectedDates: Date[];

  // Date search finds IDs to boost in vector search
  relevantIds: string[];

  // All strategies contribute to result confidence
  confidenceBoosts: Map<string, number>;
}
```

### 4. Result Aggregation

```typescript
interface AggregatedResult {
  id: string;
  content: string;
  metadata: any;
  sources: {
    vector: { found: boolean; score: number };
    keyword: { found: boolean; matches: string[] };
    date: { found: boolean; relevance: number };
    api: { found: boolean };
  };
  finalScore: number; // Weighted combination
  confidence: 'high' | 'medium' | 'low';
}
```

## Parallel Execution Strategy

```typescript
async function parallelSearch(query: string): Promise<AggregatedResult[]> {
  // 1. Analyze query
  const analyzed = await analyzeQuery(query);

  // 2. Create shared context for feedback
  const sharedContext = new SharedSearchContext();

  // 3. Launch all searches in parallel
  const [vectorResults, keywordResults, dateResults, apiResults] = await Promise.allSettled([
    vectorSearch(analyzed, sharedContext),
    keywordSearch(analyzed, sharedContext),
    dateSearch(analyzed, sharedContext),
    apiSearch(analyzed, sharedContext),
  ]);

  // 4. Second pass with feedback (optional)
  if (sharedContext.hasFeedback()) {
    // Re-run searches with enhanced parameters
    await enhancedSearchPass(sharedContext);
  }

  // 5. Aggregate and rank results
  return aggregateResults(allResults, sharedContext);
}
```

## Benefits

1. **Speed**: All searches run simultaneously
2. **Accuracy**: Multiple strategies validate each other
3. **Robustness**: If one strategy fails, others compensate
4. **Learning**: Strategies improve each other's results
5. **Comprehensive**: Different strategies catch different matches

## Example Flow

Query: "meeting about budget yesterday"

1. **Query Analyzer** extracts:

   - Keywords: ["meeting", "budget"]
   - Temporal: yesterday's date
   - Intent: search

2. **Parallel Execution**:

   - Vector: Finds similar concepts (financial discussions)
   - Keyword: Finds exact "budget" mentions
   - Date: Filters to yesterday only
   - API: Checks for very recent updates

3. **Feedback Loop**:

   - Vector suggests "financial", "costs" as keywords
   - Keyword finds specific time "3pm meeting"
   - Date boosts afternoon results

4. **Aggregation**:
   - Merges all results
   - Items found by multiple strategies score higher
   - Returns unified, ranked list

## Implementation Phases

### Phase 1: Basic Parallel

- Run existing searches in parallel
- Simple result merging

### Phase 2: Feedback System

- Implement shared context
- Add inter-strategy communication

### Phase 3: Advanced Ranking

- ML-based result ranking
- User feedback integration
- Performance optimization

## Performance Metrics

- Query latency: < 500ms for 90% of queries
- Recall: Find 95% of relevant results
- Precision: Top 5 results are relevant 80% of time
- Robustness: Graceful degradation if strategies fail
