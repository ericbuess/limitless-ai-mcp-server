# Test Scripts Consolidation Plan

## Current State

We have 16 test/utility scripts in the root directory that should be organized and consolidated.

## Proposed Structure

### 1. Keep as Main Utilities (move to `scripts/` directory)

- `search.js` - Main search utility (already consolidated)
- `monitor-sync.js` - Sync monitoring utility

### 2. Consolidate into Test Suite (`scripts/test-suite.js`)

Create a single test suite that accepts test names as arguments:

```bash
node scripts/test-suite.js --test vector-search
node scripts/test-suite.js --test all
node scripts/test-suite.js --list
```

#### Test Cases to Include:

- **vector-search**: Basic vector search functionality
- **keyword-search**: Search for specific keywords
- **lancedb-api**: LanceDB API functionality
- **search-performance**: Performance benchmarks
- **sync-status**: Check sync service status
- **vector-db-integrity**: Check for duplicates, stats

### 3. Move to Maintenance Scripts (`scripts/maintenance/`)

- `rebuild-vectordb-simple.js` → `scripts/maintenance/rebuild-vectordb.js`
- `fix-duplicates.js` → `scripts/maintenance/fix-duplicates.js`
- `download-missing-days.js` → `scripts/maintenance/download-missing.js`
- `verify-and-fix-missing-data.js` → `scripts/maintenance/verify-data.js`

### 4. Delete (functionality covered elsewhere)

- `test-game-search.js` - Covered by search.js
- `test-search-keywords.js` - Covered by search.js
- `test-search-simple.js` - Covered by search.js
- `test-vector-search.js` - Covered by search.js
- `debug-search.js` - Debugging complete
- `check-vectordb.js` - Covered by inspect-lancedb.js
- `test-lancedb-api.js` - API testing complete
- `test-lancedb-api-v2.js` - API testing complete
- `rebuild-vectordb.js` - Duplicate of rebuild-vectordb-simple.js
- `download-today.js` - Covered by sync service
- `quick-fix-download.js` - Temporary fix, no longer needed

### 5. Create Example Queries File

Create `scripts/example-queries.json`:

```json
{
  "basic": ["what game did we play", "meeting about project", "discussion yesterday"],
  "temporal": ["what happened today", "meetings this week", "important decisions last month"],
  "semantic": ["conversations about budget", "planning discussions", "action items from meetings"]
}
```

## Implementation Steps

1. Create `scripts/` directory structure
2. Move and rename files according to plan
3. Create consolidated test suite
4. Update .gitignore to exclude test outputs
5. Update documentation to reference new structure
6. Delete redundant scripts
