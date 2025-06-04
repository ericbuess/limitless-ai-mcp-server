# Sync Guide - Respectful Data Synchronization

This guide explains the new two-phase sync approach that respects the Limitless API while ensuring reliable data storage.

## Overview

The new sync system works in two distinct phases:

1. **Phase 1: Download** - Downloads ALL data from the Limitless API to local storage
2. **Phase 2: Vectorize** - Builds embeddings from local data (no API calls)

This approach ensures:

- You never need to re-download data from the API
- Respectful API usage with configurable delays
- Ability to rebuild embeddings anytime without API calls
- Resume capability if interrupted

## Quick Start

### 1. Download All Your Data

```bash
# Set your API key
export LIMITLESS_API_KEY="your-api-key"

# Run the sync (interactive)
npm run sync:all

# Or download only (skip vectorization)
npm run sync:download
```

The sync tool will:

- Start from today and work backwards
- Add a 2-second delay between API requests (configurable)
- Save checkpoints every 100 lifelogs
- Stop after 30 consecutive days with no data
- Allow resuming if interrupted

### 2. Rebuild Embeddings (No API Calls)

If you need to rebuild embeddings or switch vector stores:

```bash
npm run sync:rebuild
```

This will:

- Read from local files only
- Let you choose vector store type
- Rebuild all embeddings
- Show progress with checkpoints

## Configuration Options

### Sync Tool Options

When running `npm run sync:all`, you can configure:

- **API Delay**: Time between API requests (default: 2 seconds)
- **Checkpoint Interval**: Save progress every N lifelogs (default: 100)
- **Download Only**: Skip vectorization phase

### Environment Variables

```bash
# Optional: Change data directory (default: ./data)
export LIMITLESS_DATA_DIR="/path/to/data"

# Optional: Enable debug logging
export LOG_LEVEL=DEBUG
```

## Data Storage Structure

```
./data/
├── lifelogs/           # Raw data from API
│   └── YYYY/MM/DD/
│       ├── {id}.md     # Markdown content
│       └── {id}.meta.json  # Metadata
├── embeddings/         # Vector embeddings
│   └── YYYY/MM/DD/
│       └── {id}.json   # Embedding vectors
├── sync-checkpoint.json  # Resume information
└── simple-vectors/     # Simple vector store data
    └── lancedb/        # LanceDB data
```

## Monitoring Progress

The sync tool shows real-time progress:

```
=== Sync Progress ===

Phase: DOWNLOAD
Current date: 2024-06-15
Date range: 2023-01-15 to 2024-06-15

Downloaded: 1,234 lifelogs
Vectorized: 0 lifelogs
Storage size: 45.2 MB
Errors: 0

Last checkpoint: 6/15/2024, 2:30:45 PM

Press Ctrl+C to stop (progress will be saved)
```

## Resuming After Interruption

If the sync is interrupted:

1. Progress is automatically saved to `sync-checkpoint.json`
2. Simply run the sync command again
3. It will resume from where it left off

## Best Practices

### 1. Initial Sync

For your first sync:

- Run during off-peak hours
- Use a stable internet connection
- Consider increasing API delay if you have many recordings
- Monitor the first few minutes to ensure it's working

### 2. Incremental Updates

After initial sync:

- The regular MCP server will handle new recordings
- Only run full sync if you need historical data

### 3. Vector Store Choice

- **Simple**: Fast, in-memory, basic embeddings
- **LanceDB**: Persistent, transformer embeddings, best for most users
- **ChromaDB**: Requires server, advanced features

## Troubleshooting

### "No data found" for Recent Dates

This is normal if you haven't used your Pendant recently. The sync will continue backwards until it finds data.

### API Rate Limiting

If you encounter rate limits:

1. Increase the API delay (e.g., 5 seconds)
2. The sync will automatically retry with backoff

### Out of Memory

For large datasets:

1. Use `sync:download` first (no vectorization)
2. Then use `sync:rebuild` with a persistent vector store

### Checkpoint Issues

If the checkpoint is corrupted:

```bash
rm ./data/sync-checkpoint.json
```

## Advanced Usage

### Custom Sync Script

```typescript
import { SyncServiceV2 } from './src/vector-store/sync-service-v2.js';

const syncService = new SyncServiceV2(client, fileManager, vectorStore, {
  apiDelayMs: 5000, // 5 second delay
  checkpointInterval: 50, // Checkpoint every 50 items
  downloadOnly: false,
});

// Monitor progress
setInterval(() => {
  const progress = syncService.getProgress();
  console.log(`Downloaded: ${progress.totalDownloaded}`);
}, 1000);

await syncService.start();
```

### Rebuild with Different Embeddings

```bash
# Clear existing embeddings
rm -rf ./data/embeddings

# Rebuild with new vector store
npm run sync:rebuild
```

## FAQ

**Q: How long does the initial sync take?**
A: Depends on how much data you have. With 2-second delays, expect ~30 recordings per minute.

**Q: Can I change the vector store later?**
A: Yes! Just run `npm run sync:rebuild` and choose a different store.

**Q: Will this download data I already have?**
A: No, it checks for existing files and skips them.

**Q: Is my data safe if interrupted?**
A: Yes, all downloaded data is saved immediately. Progress is checkpointed regularly.

**Q: Can I run this on a server?**
A: Yes, use `nohup` or `screen` for long-running syncs:

```bash
nohup npm run sync:all > sync.log 2>&1 &
```
