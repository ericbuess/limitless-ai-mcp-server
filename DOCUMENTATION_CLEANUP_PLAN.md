# Documentation Cleanup Plan

## Current Documentation Files

### Root Directory Docs

1. **README.md** - Keep (main documentation)
2. **CLAUDE.md** - Keep (AI development guide)
3. **LICENSE** - Keep (legal)
4. **ROADMAP.md** - Keep (project planning)
5. **PROJECT_STATUS.md** - Keep (current status)
6. **PUBLISH_CHECKLIST.md** - Keep (release process)

### To Consolidate/Archive

1. **SETUP_GUIDE.md** → Merge essential parts into README.md
2. **SYNC_GUIDE.md** → Move to docs/archive/
3. **SYNC_IMPLEMENTATION_PLAN.md** → Move to docs/archive/
4. **SYNC_TEST_RESULTS.md** → Move to docs/archive/
5. **SYNC_V3_IMPROVEMENTS.md** → Move to docs/archive/
6. **SYNC_SERVICE_DESIGN.md** → Move to docs/archive/
7. **TESTING_SYNC_SERVICE.md** → Move to docs/archive/
8. **DOCUMENTATION_INDEX.md** → Delete (outdated)
9. **MONITORING_PLAN.md** → Merge into ROADMAP.md Phase 3
10. **NEXT_STEPS_INSTRUCTIONS.md** → Delete (completed)
11. **DOCUMENTATION_CLEANUP.md** → Delete after cleanup
12. **CONTEXT_SUMMARY.md** → Delete (temporary)

### Temporary/Working Docs to Delete

1. **CRITICAL_STATUS_UPDATE.md** - Temporary status
2. **FINAL_FIX_INSTRUCTIONS.md** - Completed fixes
3. **FINAL_STATUS_SUMMARY.md** - Outdated summary
4. **sync-final-fixed.log** - Log file

## New Documentation Structure

```
/
├── README.md                 # Main user documentation
├── CLAUDE.md                # AI development guide
├── LICENSE                  # MIT License
├── ROADMAP.md              # Future plans
├── PROJECT_STATUS.md       # Current release status
├── PUBLISH_CHECKLIST.md    # NPM publishing guide
└── docs/
    ├── API.md              # API reference (new)
    ├── SEARCH_GUIDE.md     # Search features guide (new)
    ├── SYNC_SERVICE.md     # Sync service documentation (new)
    ├── references/         # External documentation
    └── archive/           # Historical docs
        ├── phase1/        # Phase 1 development docs
        └── phase2/        # Phase 2 development docs
```

## Content Migration Plan

### 1. Update README.md

Add sections:

- Quick Start (from SETUP_GUIDE.md)
- Search Features (brief overview)
- Sync Service (brief overview)
- Link to detailed docs

### 2. Create API.md

Document all MCP tools:

- Tool signatures
- Parameters
- Examples
- Response formats

### 3. Create SEARCH_GUIDE.md

- Vector search explanation
- Query syntax
- Performance tips
- Examples from test scripts

### 4. Create SYNC_SERVICE.md

- How sync works
- Configuration
- Monitoring
- Troubleshooting

## Implementation Steps

1. Create docs structure
2. Archive old sync docs
3. Create new consolidated docs
4. Update README with links
5. Delete temporary files
6. Update CLAUDE.md references
