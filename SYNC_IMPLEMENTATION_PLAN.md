# Sync Implementation Plan - Local Database with Auto-Sync

> 🎯 **Purpose**: This document outlines the implementation plan for creating a complete local database of all lifelogs with automatic synchronization. This ensures offline search capability and optimal performance.

## Update: Phase 2 Complete! (2025-06-04)

### What Was Implemented

1. **Background Sync Service** ✅

   - Polls every 60 seconds (configurable)
   - Syncs new lifelogs automatically
   - Handles duplicates properly via ID tracking

2. **Bulk Historical Download** ✅

   - Added `performInitialBulkSync()` method
   - Automatically runs on first startup
   - Processes in parallel batches (4 concurrent)
   - Shows progress: "Bulk sync progress: X/Y batches (Z%)"

3. **New MCP Tool: `limitless_bulk_sync`** ✅

   - Manually trigger bulk sync
   - Parameters: `days` (default 365), `clearExisting` (default false)
   - Shows real-time progress

4. **Auto-Detection of Empty Database** ✅
   - On startup, checks if database is empty
   - Automatically performs bulk sync if no data exists
   - Configurable via `LIMITLESS_SYNC_INITIAL_DAYS` (default 365)

### How to Use

```bash
# Enable sync on server start
export LIMITLESS_ENABLE_SYNC=true
export LIMITLESS_ENABLE_VECTOR=true
export LIMITLESS_API_KEY="your-key"
npm start

# Or manually trigger bulk sync
# Use the limitless_bulk_sync tool:
{
  "days": 365,
  "clearExisting": false
}
```

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

### Phase 1: Enable & Improve Background Sync ✅ (COMPLETE)

1. **Enable Existing Sync Service** ✅

   ```bash
   export LIMITLESS_ENABLE_SYNC=true
   ```

2. **Improve Sync Interval** ✅

   - ✅ Changed to configurable interval via LIMITLESS_SYNC_INTERVAL
   - ✅ Default to 60 seconds for production use
   - ✅ Proper error handling with retry logic

3. **Fix Sync Service Issues** ✅
   - ✅ Starts automatically when enabled
   - ✅ Added proper error handling and retry logic (3 retries)
   - ✅ Implemented duplicate detection via Set-based ID tracking

### Phase 2: Bulk Historical Download ✅ (COMPLETE)

1. **Initial Data Load Strategy** ✅

   ```typescript
   // Implemented in sync-service.ts
   async performInitialBulkSync() {
     // ✅ Automatically runs on first startup
     // ✅ Downloads in parallel batches (7 days at a time)
     // ✅ Shows progress: "Bulk sync progress: 4/53 batches (8%)"
     // ✅ Indexes with Contextual RAG embeddings
     // ✅ Saves sync state via syncedIds Set
   }
   ```

2. **Batch Processing** ✅

   - ✅ Downloads in weekly chunks (7 days default)
   - ✅ Processes up to 4 batches in parallel
   - ✅ Respects API rate limits
   - ✅ Continues from where it left off (duplicate detection)

3. **Progress Tracking** ✅
   - ✅ Stores sync status in memory
   - ✅ Shows download progress in logs
   - ✅ Exposed via `limitless_sync_status` tool
   - ✅ NEW: Added `limitless_bulk_sync` tool for manual triggering

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

1. **Immediate (Context at 30%)** ✅ (COMPLETE)

   - [x] Create this plan document
   - [x] Enable sync service in index.ts
   - [x] Add sync interval configuration
   - [x] Implement sync status tool

2. **Phase 2 (Completed 2025-06-04)** ✅

   - [x] Implement bulk historical download
   - [x] Add progress tracking
   - [x] Create `limitless_bulk_sync` tool
   - [x] Auto-sync on first run
   - [x] Parallel batch processing

3. **Next Session (Phase 3)**

   - [ ] Parallelize search execution
   - [ ] Implement p-limit for controlled concurrency
   - [ ] Add worker threads for embeddings

4. **Future**
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
