# Scripts Directory

This directory contains various utility scripts for managing and testing the Limitless AI MCP Server.

## Directory Structure

```
scripts/
├── utilities/          # Main user-facing utilities
│   ├── search.js      # Search lifelogs using vector database
│   └── monitor-sync.js # Monitor sync service status
├── maintenance/       # Database and data maintenance
│   ├── download-today.js         # Download today's lifelogs
│   ├── download-missing-days.js  # Download missing days' data
│   ├── rebuild-vectordb.js       # Rebuild vector database
│   ├── rebuild-vectordb-simple.js # Simple rebuild variant
│   ├── fix-duplicates.js         # Remove duplicate entries
│   ├── verify-and-fix-missing-data.js # Verify data integrity
│   └── quick-fix-download.js     # Quick download utility
└── debug/            # Debugging and inspection tools
    ├── inspect-lancedb.js  # Inspect vector database contents
    ├── check-vectordb.js   # Check vector database status
    └── debug-search.js     # Debug search issues
```

## Usage

### Using npm scripts (recommended)

```bash
# Search lifelogs
npm run search "your search query"

# Monitor sync status
npm run sync:monitor

# Rebuild vector database
npm run db:rebuild

# Fix duplicates
npm run db:fix-duplicates

# Inspect database
npm run db:inspect
```

### Direct usage

```bash
# Search with options
node scripts/utilities/search.js "meeting about project" --limit 10

# Monitor sync in real-time
node scripts/utilities/monitor-sync.js

# Download specific date range
node scripts/maintenance/download-missing-days.js --start 2025-01-01 --end 2025-01-31
```

## Script Descriptions

### Utilities

- **search.js**: Main search interface for querying lifelogs using LanceDB vector search
- **monitor-sync.js**: Real-time monitoring of sync service, shows file counts and status

### Maintenance

- **download-today.js**: Downloads lifelogs for the current day
- **download-missing-days.js**: Downloads lifelogs for specific date ranges
- **rebuild-vectordb.js**: Completely rebuilds the vector database from local files
- **fix-duplicates.js**: Identifies and removes duplicate entries in the database
- **verify-and-fix-missing-data.js**: Checks data integrity and fixes issues

### Debug

- **inspect-lancedb.js**: Shows detailed information about the vector database
- **check-vectordb.js**: Quick health check of the vector database
- **debug-search.js**: Helps debug search-related issues
