# Sync Service V3 Improvements

## Overview

Version 3 of the sync service has been redesigned to be more respectful of the Limitless API and ensure data persistence. The key principle is: **download once, never re-download**.

## Key Improvements

### 1. **Batch-Level Checkpointing**

- Saves checkpoint after EVERY batch (not every 100 lifelogs)
- If a batch of 50 days fails, only those 50 days need to be retried
- Tracks successfully processed batches to avoid duplicates
- Configurable batch size (default: 50 days)

### 2. **No Arbitrary Stopping**

- Removed the "stop after 30 empty days" logic
- Will continue searching back to the configured limit (default: 10 years)
- Handles gaps in recordings (e.g., battery issues, phone problems)
- Processes date ranges in batches to minimize empty API calls

### 3. **Two-Phase Approach**

- **Phase 1: Download** - Fetches ALL data from API to local storage
- **Phase 2: Vectorize** - Builds embeddings from local files (no API calls)
- Can rebuild embeddings anytime without touching the API
- Raw data stored permanently in `.md` and `.meta.json` files

### 4. **Respectful API Usage**

- 2-second delay between API requests (configurable)
- Downloads in batches to minimize API calls
- Never re-downloads data that's already stored locally
- Automatic retry with exponential backoff on errors

### 5. **Improved Progress Tracking**

```typescript
interface SyncProgress {
  phase: 'idle' | 'download' | 'vectorize';
  currentDate: string;
  totalDownloaded: number;
  totalVectorized: number;
  lastCheckpoint: Date;
  oldestDate?: string;
  newestDate?: string;
  storageSize: number;
  errors: Array<{ date: string; error: string }>;
  processedBatches: Set<string>; // New: tracks completed batches
}
```

## Usage

### Command Line

```bash
# Full sync (download + vectorize)
npm run sync:all

# Download only (no embeddings)
npm run sync:download

# Rebuild embeddings from local data
npm run sync:rebuild

# With options
npm run sync:all -- --years=5 --batch=30 --delay=3000
```

### Options

- `--years=N` - How many years back to sync (default: 10)
- `--batch=N` - Days per batch (default: 50)
- `--delay=N` - Milliseconds between API requests (default: 2000)
- `--download-only` - Skip vectorization phase

### Programmatic Usage

```typescript
const syncService = new SyncServiceV3(client, fileManager, vectorStore, {
  batchSize: 50,
  apiDelayMs: 2000,
  checkpointInterval: 1, // Save after every batch
  downloadOnly: false,
  maxYearsBack: 10,
});

// Start sync
await syncService.start();

// Monitor progress
const progress = syncService.getProgress();
console.log(`Downloaded: ${progress.totalDownloaded}`);
console.log(`Processed batches: ${progress.processedBatches.size}`);

// Stop gracefully
syncService.stop();
```

## Data Storage

```
./data/
├── lifelogs/YYYY/MM/DD/       # Raw API data
│   ├── {id}.md                # Markdown transcript
│   └── {id}.meta.json         # Metadata (title, date, duration)
├── embeddings/YYYY/MM/DD/     # Vector embeddings
│   └── {id}.json              # Embedding vectors
├── lancedb/                   # Vector database
└── sync-checkpoint.json       # Resume information
```

## Checkpoint Format

```json
{
  "phase": "download",
  "currentDate": "2024-12-15",
  "totalDownloaded": 1250,
  "totalVectorized": 1250,
  "lastCheckpoint": "2025-06-04T12:34:56.789Z",
  "oldestDate": "2023-01-15",
  "newestDate": "2025-06-04",
  "storageSize": 125829120,
  "errors": [],
  "processedBatches": ["2025-05-01_2025-05-31", "2025-04-01_2025-04-30"]
}
```

## Migration from V2

V3 is backward compatible with V2 data:

1. Existing downloaded files are recognized and not re-downloaded
2. Checkpoint format is compatible
3. Can resume V2 syncs with V3

## Best Practices

1. **Initial Sync**: Run during off-peak hours
2. **Monitoring**: Check progress every 10-30 seconds
3. **Interruptions**: Safe to Ctrl+C - will resume from checkpoint
4. **Storage**: Ensure adequate disk space (estimate 1-2MB per day of recordings)
5. **Rebuilding**: Use `npm run sync:rebuild` to update embeddings without API calls

## Troubleshooting

### "No data in batch"

- Normal for date ranges without recordings
- V3 continues searching (doesn't stop after empty batches)

### "Failed to process batch"

- Check API key is valid
- Verify network connectivity
- Review error details in checkpoint file
- Batch will be retried on next run

### Slow Progress

- Normal - respects API with 2s delays
- Initial sync of 1 year may take 15-30 minutes
- Use `--batch=100` for larger batches (fewer API calls)

### Storage Issues

- Check available disk space
- Old embeddings can be deleted and rebuilt
- Raw `.md` files should never be deleted
