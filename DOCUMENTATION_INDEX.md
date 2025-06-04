# Documentation Index - Limitless AI MCP Server Phase 2

## Core Documentation Files

### 1. **README_PHASE2.md** (Start Here!)

- Overview of Phase 2 features
- Quick start guide
- Performance benchmarks
- Basic troubleshooting

### 2. **SETUP_GUIDE.md**

- Detailed setup instructions
- How to get API key
- Installing optional dependencies
- Testing procedures

### 3. **CLAUDE.md**

- Developer reference
- Project structure
- Implementation details
- Troubleshooting guide
- Phase 2 architecture

### 4. **PHASE2_COMPLETE.md**

- Implementation summary
- What was built
- Architecture decisions
- Performance achievements

### 5. **PHASE2_README.md**

- Phase 2 user guide
- Search strategies
- Configuration options
- Migration guide

## Progress Tracking

### 6. **PHASE2_PROGRESS.md**

- Component completion status
- File locations
- Dependencies installed

### 7. **PHASE2_SUMMARY.md**

- Final implementation summary
- Test results
- Next steps

### 8. **ROADMAP.md**

- Phase 1 ✅ (Complete)
- Phase 2 ✅ (Complete)
- Phase 3 (Future: Voice keywords)

### 9. **PROJECT_STATUS.md**

- Current version: 0.2.0
- Performance metrics
- Known limitations

## Key Component Locations

### Search System

- `src/search/unified-search.ts` - Main search handler
- `src/search/query-router.ts` - Query classification
- `src/search/fast-patterns.ts` - Pattern matching
- `src/search/claude-orchestrator.ts` - Claude integration

### Storage System

- `src/storage/file-manager.ts` - Date-based storage
- `src/storage/aggregation-service.ts` - Data rollups

### Vector Store

- `src/vector-store/vector-store.interface.ts` - Abstract interface
- `src/vector-store/chroma-manager.ts` - ChromaDB implementation
- `src/vector-store/sync-service.ts` - Background sync

### Tools

- `src/tools/enhanced-handlers.ts` - Phase 2 MCP handlers
- `src/tools/phase2-definitions.ts` - New tool definitions
- `src/tools/*.js` - Executable search tools

### Cache

- `src/cache/intelligent-cache.ts` - Learning cache

### Types

- `src/types/phase2.ts` - Phase 2 type definitions

## Configuration

### Environment Variables

```bash
# Required
LIMITLESS_API_KEY=your-key

# Optional Phase 2 Features
LIMITLESS_ENABLE_VECTOR=true    # ChromaDB search
LIMITLESS_ENABLE_CLAUDE=true    # Claude analysis
LIMITLESS_ENABLE_SYNC=true      # Background sync
LIMITLESS_DATA_DIR=./data       # Storage location

# Performance Tuning
CACHE_MAX_SIZE=1000
CACHE_TTL=300000
LOG_LEVEL=INFO
```

## Quick Commands

```bash
# Build
npm run build

# Run
npm start

# Test
node test-phase2.js
node test-mcp.js

# Development
npm run dev
```

## API Key

Get your API key from: https://www.limitless.ai/developers

## Support

- Issues: https://github.com/ericbuess/limitless-ai-mcp-server/issues
- Limitless API Docs: https://www.limitless.ai/developers

---

This index provides a complete map of all documentation and code locations for Phase 2.
