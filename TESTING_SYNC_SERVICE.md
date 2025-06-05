# Testing the Sync Service

## Implementation Complete

The sync service now implements the exact behavior requested:

1. **On first run (no lastProcessedTimestamp)**:

   - Clears all existing data
   - Finds the oldest lifelog via API
   - Downloads everything from oldest to newest
   - Sets lastProcessedTimestamp after each download
   - Never re-downloads files

2. **On subsequent runs (lastProcessedTimestamp exists)**:

   - Skips directly to monitoring mode
   - Only checks for lifelogs newer than lastProcessedTimestamp
   - Downloads only new lifelogs
   - Updates lastProcessedTimestamp

3. **Key features**:
   - Respects beta API with 2-second delays
   - Batch processing with checkpointing
   - Resume capability if interrupted
   - Local-first architecture

## How to Reset and Test from Scratch

### 1. Clear All Data and Start Fresh

```bash
# Stop any running servers
pkill -f "node dist/index.js"

# Remove checkpoint file to trigger fresh initialization
rm data/sync-checkpoint.json

# Remove all downloaded data (optional - sync will clear it anyway)
rm -rf data/lifelogs data/lancedb

# Build the project
npm run build

# Start with sync enabled
export LIMITLESS_API_KEY='your-api-key-here'
export LIMITLESS_ENABLE_SYNC=true
export LOG_LEVEL=INFO
npm start
```

### 2. What Happens on First Run

When `lastProcessedTimestamp` is empty:

1. **Clears all data** - Removes any existing lifelog files and vector DB
2. **Finds oldest lifelog** - Uses API to find the very first lifelog
3. **Downloads everything** - From oldest to newest, with progress updates
4. **Builds vector DB** - Creates embeddings from all local files
5. **Starts monitoring** - Checks every 60 seconds for new lifelogs only

### 3. What Happens on Subsequent Runs

When `lastProcessedTimestamp` exists:

1. **Skips download phase** - Goes straight to monitoring
2. **Only checks recent lifelogs** - Last 24 hours
3. **Filters by timestamp** - Only processes lifelogs newer than `lastProcessedTimestamp`
4. **Never re-downloads** - Skips any lifelogs that already exist locally

### 4. Monitor the Progress

```bash
# Watch the logs
tail -f sync-debug-monitor.log

# Check the checkpoint file
cat data/sync-checkpoint.json | jq

# Count downloaded files
find data/lifelogs -name "*.md" | wc -l

# Check for newest files
ls -la data/lifelogs/2025/06/04/
```

### 5. Testing Monitoring Mode

To test if monitoring picks up new lifelogs:

1. Note the current `lastProcessedTimestamp` in checkpoint
2. Create a new recording with your Pendant
3. Wait 60 seconds for the next monitoring check
4. Check logs for "Found new lifelog to download"
5. Verify the new file appears in data/lifelogs

### 6. Force Re-initialization

If you need to download everything again:

```bash
# Option 1: Remove checkpoint file
rm data/sync-checkpoint.json

# Option 2: Clear lastProcessedTimestamp
jq '.lastProcessedTimestamp = ""' data/sync-checkpoint.json > tmp.json && mv tmp.json data/sync-checkpoint.json
```

### 7. Debug Mode

For detailed logging:

```bash
export LOG_LEVEL=DEBUG
npm start 2>&1 | tee sync-debug.log
```

This will show:

- Each lifelog being processed
- Timestamp comparisons
- Skip reasons
- API calls and responses

### 8. Common Issues

**Monitoring not finding new lifelogs:**

- Check that `lastProcessedTimestamp` is set correctly
- Verify new recordings have timestamps > lastProcessedTimestamp
- Check timezone handling (UTC vs local)

**Downloads taking too long:**

- Initial download can take hours for years of data
- Consider modifying `maxYearsBack` in code to limit initial download
- Use checkpoint file to resume if interrupted

**Vector DB errors:**

- Ensure LanceDB dependencies are installed
- Check disk space for embeddings
- Try clearing vector DB: `rm -rf data/lancedb`
