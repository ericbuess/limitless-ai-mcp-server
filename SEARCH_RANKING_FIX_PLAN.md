# Search Ranking Fix Plan

## Problem Analysis

When searching for "where did the kids go this afternoon?", the correct answer (kids went to Mimi's house) is being ranked lower than unrelated AI coding discussions. The issue stems from:

1. **Consensus Scoring Imbalance**: The `buildConsensus` method in `memory-search-iterative.js` gives equal weight to average and max scores (0.3 each), diluting the importance of direct keyword matches.

2. **Fast-Pattern Scoring Already Good**: The `fast-patterns.ts` file already has sophisticated scoring that specifically boosts "Mimi's house" results for "where did kids go" queries, but this boost is being diluted in the consensus phase.

3. **Context-Aware Filter Dominance**: Results from the context-aware filter strategy are getting high scores even without strong keyword matches.

## Solution

### 1. Rebalance Consensus Scoring (memory-search-iterative.js)

Current formula:

```javascript
result.consensusScore =
  avgScore * 0.3 + maxScore * 0.3 + occurrenceBoost + strategyWeight + multiStrategyBonus;
```

Proposed changes:

- Increase fast-keyword strategy weight from 0.35 to 0.5
- Reduce average score weight from 0.3 to 0.2
- Add keyword density scoring
- Penalize results without keyword matches

### 2. Enhance Parallel Search Executor (parallel-search-executor.ts)

Current issue: Context-aware filter gives high base scores (0.7-0.85) to any document with keyword matches.

Proposed changes:

- Reduce base score for single keyword matches from 0.7 to 0.5
- Require multiple keyword matches for high scores
- Give more weight to exact phrase matches

### 3. Add Query-Specific Boosting

For question queries ("where did X go"), specifically boost:

- Results containing location indicators (house, home, place, went to, going to)
- Results with proper nouns that could be destinations

## Implementation Steps

1. **Update memory-search-iterative.js**:

   - Modify `buildConsensus` to prioritize keyword matches
   - Add keyword density calculation
   - Adjust strategy weights

2. **Update parallel-search-executor.ts**:

   - Reduce context-aware filter base scores
   - Require stronger evidence for high scores
   - Better phrase matching logic

3. **Add query intent detection**:
   - Detect "where" questions
   - Apply location-specific boosting
   - Prioritize results with movement/location verbs

## Expected Outcome

After these changes:

- "where did the kids go this afternoon?" should return the Mimi's house result in top 3
- Direct keyword matches will have more influence than indirect semantic similarity
- Question-answer patterns will be better recognized
