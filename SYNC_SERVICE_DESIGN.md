# Sync Service V3 Design - Complete Specification

## Overview

The sync service (sync-service-v3.ts) is responsible for downloading ALL lifelogs ONCE during initialization, then monitoring for new ones. It ensures no lifelog is ever downloaded twice.

## Key Principles

1. **Download historical data ONLY ONCE** - When `lastProcessedTimestamp` is empty/null
2. **Never re-download** - Each lifelog file is downloaded exactly once
3. **Respect the beta API** - 2-second delays between all API calls
4. **Checkpoint frequently** - Save progress after each batch for resume capability
5. **Local-first** - Once downloaded, all operations use local files

## Initialization Process

When `lastProcessedTimestamp` is empty or null (first run):

### Step 1: Clear Existing Data

```typescript
// Clear local lifelog files
await fileManager.clearAllLifelogs();

// Clear vector database
await vectorStore.clear();
```

### Step 2: Find Oldest Lifelog

```typescript
// Use API to find the very first lifelog
// Start from current date and work backwards
let oldestDate = new Date();
let foundOldest = false;

while (!foundOldest) {
  const lifelogs = await client.listLifelogsByDate({
    date: oldestDate.toISOString().split('T')[0],
    limit: 1,
    direction: 'asc',
  });

  if (lifelogs.length > 0) {
    // Found a lifelog on this date, but check earlier dates
    oldestDate.setDate(oldestDate.getDate() - 1);
  } else {
    // No lifelogs on this date, the previous date had the oldest
    oldestDate.setDate(oldestDate.getDate() + 1);
    foundOldest = true;
  }

  // Safety check - don't go back more than 10 years
  if (oldestDate < tenYearsAgo) break;
}
```

### Step 3: Download All Historical Data

```typescript
// Download from oldest to newest in batches
let currentDate = new Date(oldestDate);
const today = new Date();

while (currentDate <= today) {
  // Create batch range (50 days at a time)
  const batchEnd = new Date(currentDate);
  batchEnd.setDate(batchEnd.getDate() + 50);

  // Fetch batch
  const lifelogs = await client.listLifelogsByRange({
    start: currentDate.toISOString().split('T')[0],
    end: batchEnd.toISOString().split('T')[0],
    includeMarkdown: true,
    includeHeadings: true,
  });

  // Save each lifelog
  for (const lifelog of lifelogs) {
    await fileManager.saveLifelog(lifelog);

    // Update lastProcessedTimestamp with each save
    if (!lastProcessedTimestamp || lifelog.createdAt > lastProcessedTimestamp) {
      lastProcessedTimestamp = lifelog.createdAt;
    }
  }

  // Save checkpoint
  await saveCheckpoint();

  // Respect API rate limits
  await delay(2000);

  // Move to next batch
  currentDate = batchEnd;
}
```

### Step 4: Initialize Vector Database

```typescript
// Load all local lifelogs
const allLifelogs = await fileManager.loadAllLifelogs();

// Build vector embeddings
for (const batch of batchArray(allLifelogs, 100)) {
  await vectorStore.addDocuments(batch);
}
```

### Step 5: Start Monitoring

```typescript
// Enter monitoring phase
phase = 'monitoring';
await startMonitoring();
```

## Monitoring Process

When `lastProcessedTimestamp` exists (subsequent runs):

### Check for New Lifelogs

```typescript
// Only check recent timeframe (last 2 hours)
const twoHoursAgo = new Date();
twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

const recentLifelogs = await client.listLifelogsByRange({
  start: twoHoursAgo.toISOString().split('T')[0],
  end: new Date().toISOString().split('T')[0],
  limit: 100,
});

// Filter to only NEW lifelogs
const newLifelogs = recentLifelogs.filter((lifelog) => {
  const timestamp = new Date(lifelog.createdAt);
  return timestamp > new Date(lastProcessedTimestamp);
});
```

### Download New Lifelogs Only

```typescript
for (const lifelog of newLifelogs) {
  // Double-check it doesn't exist locally
  const exists = await fileManager.lifelogExists(lifelog.id);
  if (!exists) {
    await fileManager.saveLifelog(lifelog);
    await vectorStore.addDocument(lifelog);

    // Update timestamp
    lastProcessedTimestamp = lifelog.createdAt;
  }
}
```

## Checkpoint Structure

```json
{
  "phase": "monitoring",
  "lastProcessedTimestamp": "2025-06-04T20:15:46Z",
  "oldestDate": "2020-01-01T00:00:00Z",
  "newestDate": "2025-06-04T20:15:46Z",
  "totalDownloaded": 5000,
  "totalVectorized": 5000,
  "processedBatches": ["2020-01-01_2020-02-20", ...],
  "lastCheckpoint": "2025-06-04T22:00:00Z"
}
```

## Key Functions Needed

1. `fileManager.clearAllLifelogs()` - Remove all .md and .meta.json files
2. `fileManager.lifelogExists(id)` - Check if a lifelog file exists
3. `vectorStore.clear()` - Clear all embeddings
4. `findOldestLifelog()` - Find the earliest lifelog via API
5. `downloadHistoricalData(from, to)` - Batch download with checkpointing

## Error Handling

- If download fails mid-process, checkpoint allows resume
- If vector DB fails, can rebuild from local files
- If monitoring fails, simply restart - no data loss

## Important Notes

1. **Never use Phase 1 download after initialization** - Once `lastProcessedTimestamp` is set, only monitoring mode should run
2. **Always check file existence** - Before downloading, verify file doesn't exist locally
3. **Respect API limits** - 2-second delays are mandatory
4. **Atomic operations** - Save file and update timestamp together
