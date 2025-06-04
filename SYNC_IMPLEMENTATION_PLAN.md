# Sync Implementation Plan - Local Database with Auto-Sync

> 🎯 **Purpose**: This document outlines the implementation plan for creating a complete local database of all lifelogs with automatic synchronization. This ensures offline search capability and optimal performance.

## Current State (2025-06-04)

### What We Have

- ✅ Local LanceDB with Contextual RAG (384-dim embeddings)
- ✅ Fast in-memory search index
- ✅ Sync service exists but NOT enabled by default
- ✅ Only 25 lifelogs indexed (last 30 days on startup)
- ✅ Searches are 100% local after indexing

### What's Missing

- ❌ No automatic background sync
- ❌ No bulk historical download
- ❌ Limited parallelization
- ❌ No sync status monitoring
- ❌ Stale data without manual restart

## Implementation Plan

### Phase 1: Enable & Improve Background Sync ⏱️ (Immediate)

1. **Enable Existing Sync Service**

   ```bash
   export LIMITLESS_ENABLE_SYNC=true
   ```

2. **Improve Sync Interval**

   - Change from 60 seconds to configurable interval
   - Default to 60 seconds for production use
   - Add jitter to prevent API hammering

3. **Fix Sync Service Issues**
   - Ensure it starts automatically when enabled
   - Add proper error handling and retry logic
   - Implement duplicate detection

### Phase 2: Bulk Historical Download 📥 (High Priority)

1. **Initial Data Load Strategy**

   ```typescript
   // On first run or when database is empty
   async performInitialSync() {
     // 1. Get date range of all available data
     // 2. Download in parallel batches (e.g., 7 days at a time)
     // 3. Show progress: "Downloading year 2024... (2500/10000 lifelogs)"
     // 4. Index with Contextual RAG embeddings
     // 5. Save sync state
   }
   ```

2. **Batch Processing**

   - Download in weekly chunks
   - Process up to 4 weeks in parallel
   - Respect API rate limits
   - Continue from last checkpoint on failure

3. **Progress Tracking**
   - Store last successful sync timestamp
   - Show download progress in logs
   - Expose progress via `limitless_sync_status` tool

### Phase 3: Parallel Search Execution 🚀 (High Priority)

1. **Parallelize Within Search Strategies**

   ```typescript
   // Current: Sequential
   for (const doc of documents) {
     const result = await search(doc);
   }

   // Improved: Parallel
   const results = await Promise.all(documents.map((doc) => search(doc)));
   ```

2. **Parallel Embedding Generation**

   - Use worker threads for CPU-intensive embedding
   - Batch process in groups of 10-20
   - Maintain order for result mapping

3. **Parallel API Requests**
   - When fetching multiple date ranges
   - Limit concurrency to avoid rate limits
   - Use p-limit or similar for controlled parallelism

### Phase 4: Smart Incremental Sync 🔄 (Medium Priority)

1. **Efficient Change Detection**

   ```typescript
   // Track sync state
   interface SyncState {
     lastSyncTime: Date;
     lastLifelogId: string;
     totalDocuments: number;
     lastError?: string;
   }
   ```

2. **Incremental Updates**

   - Only fetch lifelogs newer than lastSyncTime
   - Use cursor-based pagination if available
   - Merge new data without duplicates

3. **Conflict Resolution**
   - Handle updated lifelogs (check by ID)
   - Update embeddings for changed content
   - Maintain version history if needed

### Phase 5: Monitoring & Optimization 📊 (Medium Priority)

1. **Enhanced Sync Status Tool**

   ```typescript
   limitless_sync_status returns:
   {
     isRunning: boolean;
     lastSyncTime: Date;
     totalDocuments: number;
     pendingDocuments: number;
     syncProgress: number; // 0-100%
     errors: SyncError[];
     performance: {
       avgSyncTime: number;
       avgDocsPerSync: number;
     }
   }
   ```

2. **Performance Metrics**

   - Track sync duration
   - Monitor API response times
   - Measure embedding generation speed
   - Cache hit rates

3. **Storage Optimization**
   - Implement date-based sharding
   - Compress older embeddings
   - Archive rarely accessed data
   - Periodic index optimization

## Configuration

### Environment Variables

```bash
# Sync Configuration
LIMITLESS_ENABLE_SYNC=true          # Enable background sync
LIMITLESS_SYNC_INTERVAL=60000       # Sync interval in ms (default: 60s)
LIMITLESS_SYNC_BATCH_SIZE=7         # Days to fetch per batch
LIMITLESS_SYNC_PARALLEL_BATCHES=4   # Parallel batch downloads
LIMITLESS_SYNC_INITIAL_DAYS=365     # Days of history to fetch initially

# Performance Tuning
LIMITLESS_PARALLEL_SEARCHES=true    # Enable parallel search execution
LIMITLESS_EMBEDDING_WORKERS=4       # Worker threads for embeddings
LIMITLESS_MAX_CONCURRENT_API=3      # Max concurrent API requests
```

## Implementation Order

1. **Immediate (Context at 30%)**

   - [x] Create this plan document
   - [ ] Enable sync service in index.ts
   - [ ] Add sync interval configuration
   - [ ] Implement basic sync status tool

2. **Next Session**

   - [ ] Implement bulk historical download
   - [ ] Add progress tracking
   - [ ] Parallelize search execution

3. **Future**
   - [ ] Advanced monitoring
   - [ ] Storage optimization
   - [ ] Performance tuning

## Success Metrics

- ✅ All historical lifelogs available locally
- ✅ New lifelogs synced within 60 seconds
- ✅ Search performance < 100ms for any query
- ✅ 100% offline search capability
- ✅ Parallel execution reduces sync time by 4x

## Known Challenges

1. **API Rate Limits**: Need to respect Limitless API limits
2. **Storage Size**: Thousands of lifelogs + embeddings = GBs of data
3. **Initial Sync Time**: First sync may take 10-30 minutes
4. **Memory Usage**: Need to stream large datasets, not load all at once

## Testing Plan

1. **Unit Tests**

   - Test sync state management
   - Test duplicate detection
   - Test parallel execution

2. **Integration Tests**

   - Test full sync cycle
   - Test incremental updates
   - Test error recovery

3. **Performance Tests**
   - Measure sync speed
   - Test with 10K+ lifelogs
   - Monitor memory usage

## Phase 6: Real-Time Action Detection 🎯 (Future - Critical)

### Voice-Activated Actions from Lifelogs

**Important**: After sync is working, implement real-time transcript analysis to detect and execute actions.

1. **Action Detection System**

   ```typescript
   // Process new lifelogs as they arrive
   async processNewLifelog(lifelog: Lifelog) {
     // 1. Download fresh transcript
     // 2. Analyze for action triggers
     // 3. Execute detected actions
   }
   ```

2. **Detection Strategies** (TBD)

   - **Trigger Words**: "Hey Limitless", "Action item:", "Remind me to..."
   - **Stop Words**: Prevent false positives
   - **Context Analysis**: Use Claude CLI to understand intent
   - **Confidence Thresholds**: Only act on high-confidence detections

3. **Action Execution**

   ```bash
   # Use Claude CLI for intelligent analysis
   claude -p "Analyze this transcript for action items: [transcript]"

   # Execute resulting commands
   claude -p "Execute task: [detected action]"
   ```

4. **Safety & Confirmation**

   - Log all detected actions before execution
   - Implement confirmation for sensitive actions
   - Maintain audit trail of executed commands
   - Rate limiting to prevent action flooding

5. **Example Use Cases**
   - "Remind me to call John tomorrow" → Creates calendar event
   - "Action item: review the budget proposal" → Adds to task list
   - "Hey Limitless, schedule a meeting with Sarah" → Sends calendar invite
   - "Note to self: great idea about..." → Saves to notes app

**Note**: This will run alongside the sync process, analyzing each new lifelog within 60 seconds of recording.

## Notes for After Context Reset

**Critical Info**:

- Sync service exists in `src/vector-store/sync-service.ts`
- Main entry point is `src/index.ts` (search for ENABLE_SYNC)
- LanceDB is working with Contextual RAG
- Only 25 lifelogs currently indexed
- All searches are local (no API calls during search)
- **Future**: Need to add real-time action detection on new transcripts

**First Steps After Reset**:

1. Read this plan document
2. Check current sync implementation
3. Enable sync with `LIMITLESS_ENABLE_SYNC=true`
4. Implement bulk download for historical data
5. Add parallelization
6. (Future) Add action detection system

Remember: The goal is 100% local search with automatic updates + intelligent action execution!
