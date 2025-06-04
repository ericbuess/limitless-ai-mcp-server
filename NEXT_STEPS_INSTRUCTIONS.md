# Next Steps Instructions - Post-Compact Reference

> 🎯 **Purpose**: This document contains critical instructions for continuing work after context reset. It covers the new LanceDB vector implementation, necessary improvements, and repository cleanup tasks.

## Update: 2025-06-04

All critical improvements from this document have been implemented:

- ✅ Contextual RAG implemented in LanceDBStore
- ✅ All missing LanceDB methods added (update, delete, get, list)
- ✅ Progress monitoring added for indexing
- ✅ Test files cleaned up and proper integration tests created
- ✅ Type issues fixed

The system now implements Anthropic's Contextual RAG approach and should see significant retrieval accuracy improvements.

## Current State Summary

### What Was Just Implemented

1. **LanceDB Vector Store** (`src/vector-store/lancedb-store.ts`)

   - Replaces simple in-memory vector store
   - Uses `@lancedb/lancedb` package (not the deprecated `vectordb`)
   - Persistent storage in `./data/lancedb/`
   - No server/Docker required - embedded database
   - 384-dimension transformer embeddings

2. **Transformer Embeddings** (`src/vector-store/transformer-embeddings.ts`)

   - Uses `@xenova/transformers` with model `Xenova/all-MiniLM-L6-v2`
   - Model downloads to `./models/` on first use (~90MB)
   - Fallback to TF-IDF if transformer fails

3. **Integration Points**
   - `src/search/unified-search.ts` updated to use LanceDB
   - Automatic fallback: ChromaDB → LanceDB → disable vector store
   - Environment variable hardcoded due to MCP CLI issue

## How to Run the New Vector Approach

### Basic Testing

```bash
# Set environment and run
export LIMITLESS_API_KEY="***REMOVED***"
npm run build
npm start

# The vector store will automatically:
# 1. Download transformer model on first use
# 2. Create LanceDB database in ./data/lancedb/
# 3. Index all recent lifelogs with 384-dim embeddings
# 4. Persist data between restarts
```

### MCP Server Configuration

```bash
# Remove old configuration
claude mcp remove limitless -s user

# Add with LanceDB enabled (already hardcoded)
claude mcp add limitless -s user \
  -e "LIMITLESS_API_KEY=***REMOVED***" \
  -- node /Users/ericbuess/Projects/limitless-ai-mcp-server/dist/index.js
```

### Testing Semantic Search

Use the MCP tool `limitless_semantic_search`:

```typescript
{
  query: "birthday celebration",
  limit: 5,
  threshold: 0.3  // Lower threshold for testing
}
```

## Critical Improvements Needed

### 1. Implement Contextual RAG

The foundation is ready but Contextual RAG is NOT implemented yet. To add it:

```typescript
// In lancedb-store.ts, modify the embedding process:
async addDocuments(documents: VectorDocument[]): Promise<void> {
  // Before embedding, add context
  const contextualDocs = documents.map(doc => ({
    ...doc,
    // Prepend context to content before embedding
    content: this.addContext(doc.content, doc.metadata)
  }));

  // Then proceed with embedding...
}

private addContext(content: string, metadata?: any): string {
  const contexts: string[] = [];

  if (metadata?.date) {
    contexts.push(`Date: ${new Date(metadata.date).toLocaleDateString()}`);
  }

  if (metadata?.title) {
    contexts.push(`Topic: ${metadata.title}`);
  }

  if (metadata?.speakers) {
    contexts.push(`Speakers: ${metadata.speakers.join(', ')}`);
  }

  // This is the key: prepend context before content
  const contextString = contexts.length > 0 ? contexts.join('. ') + '\n\n' : '';
  return contextString + content;
}
```

### 2. Fix Type Issues

- `Phase2Lifelog` has `duration` not `durationSeconds`
- Need to implement missing LanceDB methods (update, delete, get)
- Consider using LanceDB's native TypeScript types better

### 3. Performance Optimizations

- Batch embedding generation (already done in transformer-embeddings.ts)
- Add progress logging for initial indexing
- Consider caching embeddings separately
- Implement incremental updates instead of full reindex

### 4. Better Error Handling

- Gracefully handle model download failures
- Provide fallback if LanceDB fails
- Better logging for debugging

## Repository Cleanup Tasks

### Test Files in Root (10 files)

These test files should be evaluated and handled:

```bash
# Current test files in root:
test-all-phase2.js      # Comprehensive Phase 2 test
test-everything.js      # General test suite
test-final-summary.js   # Summary testing
test-final-vector.js    # Vector store verification
test-mcp-tools.js       # MCP tools testing
test-mcp.js             # Basic MCP test
test-phase2.js          # Phase 2 specific
test-search-performance.js # Performance benchmarks
test-vector-debug.js    # Vector debugging
test-vector-local.js    # Local vector testing
```

**Recommendation:**

1. **Keep temporarily**: `test-mcp.js` and `test-search-performance.js` (useful for quick testing)
2. **Move to tests/**: Convert others to proper Jest tests
3. **Delete**: Redundant ones like `test-everything.js`, `test-final-*.js`
4. **Create**: `npm run test:integration` script for end-to-end testing

### Documentation Cleanup

```bash
# Files that can be consolidated or removed:
DOCUMENTATION_INDEX.md  # Merge into README
SETUP_GUIDE.md         # Merge into README
.env.example           # Keep - useful for new users
```

### Proper Test Structure

```
tests/
├── unit/              # Existing unit tests
├── integration/       # New folder for integration tests
│   ├── mcp-tools.test.ts
│   ├── vector-search.test.ts
│   └── performance.test.ts
└── e2e/              # End-to-end tests
    └── full-flow.test.ts
```

## Environment Variable Issues

**Problem**: MCP CLI not passing environment variables correctly

**Current Workaround** (in `src/index.ts`):

```typescript
// TEMPORARY: Hardcode vector store enablement
const enableVector = process.env[ENABLE_VECTOR_ENV] === 'true' || true;

// TEMPORARY: Force simple vector store mode
if (!process.env.CHROMADB_MODE) {
  process.env.CHROMADB_MODE = 'simple';
}
```

**Proper Fix**:

- Investigate Claude CLI environment passing
- Consider config file approach
- File issue with Claude Code team

## Testing Checklist After Cleanup

1. **Build and Lint**

   ```bash
   npm run build
   npm run lint
   npm test
   ```

2. **Vector Store Test**

   ```bash
   # Create simple test script
   node -e "
   import { LanceDBStore } from './dist/vector-store/lancedb-store.js';
   const store = new LanceDBStore({ collectionName: 'test' });
   await store.initialize();
   console.log('LanceDB initialized successfully');
   "
   ```

3. **MCP Integration Test**
   - Start MCP server
   - Test all 9 tools
   - Verify semantic search works
   - Check persistence (restart and search again)

## Priority Actions

1. **Immediate** (before next session):

   - Clean up test files in root
   - Update .gitignore for `./data/lancedb/`
   - Commit cleanup changes

2. **Next Session**:

   - Implement Contextual RAG properly
   - Add progress bars for indexing
   - Create proper integration tests

3. **Future**:
   - Benchmark LanceDB vs other options
   - Add vector store migration tools
   - Implement incremental sync

## Key Files to Review

- `/src/vector-store/lancedb-store.ts` - Main implementation
- `/src/search/unified-search.ts` - Integration point
- `/src/index.ts` - Hardcoded environment variables
- `package.json` - Check for unused dependencies

## Notes on LanceDB

- Uses Apache Arrow format internally
- Automatically handles memory mapping
- Supports hybrid search (vector + metadata filters)
- Can handle millions of vectors efficiently
- Native TypeScript support (no Python needed)

Remember: The goal is to achieve Anthropic's Contextual RAG 49% improvement in retrieval accuracy!
