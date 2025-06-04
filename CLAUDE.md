# Limitless AI MCP Server - Claude Development Guide

> 🤖 **Purpose**: This document provides essential information for Claude and other AI assistants to effectively work on this project. It includes project structure, development commands, implementation details, and troubleshooting guidance.

## Project Overview

This is a Model Context Protocol (MCP) server that enables AI assistants to interact with the Limitless AI API, specifically for accessing Pendant recordings (lifelogs). The server provides structured tools for searching, listing, and retrieving recording data.

## Project Structure

```
limitless-ai-mcp-server/
├── src/                    # Source code
│   ├── cache/              # Intelligent caching (Phase 2)
│   │   └── intelligent-cache.ts
│   ├── core/              # Core business logic
│   │   ├── limitless-client.ts    # API client implementation
│   │   └── cache.ts       # LRU cache with TTL support
│   ├── search/            # Phase 2 search system
│   │   ├── unified-search.ts     # Main search handler
│   │   ├── query-router.ts       # Query classification
│   │   ├── fast-patterns.ts      # Pattern matching
│   │   └── claude-orchestrator.ts # Claude CLI integration
│   ├── storage/           # Scalable file storage (Phase 2)
│   │   ├── file-manager.ts       # Date-based storage
│   │   └── aggregation-service.ts # Data rollups
│   ├── tools/             # MCP tool definitions
│   │   ├── definitions.ts # Tool metadata and descriptions
│   │   ├── handlers.ts    # Tool implementation handlers
│   │   ├── schemas.ts     # Zod schemas for validation
│   │   ├── enhanced-handlers.ts  # Phase 2 handlers
│   │   ├── phase2-definitions.ts # Phase 2 tools
│   │   ├── vector-search.js      # Executable tool
│   │   ├── text-search.sh        # Ripgrep wrapper
│   │   ├── get-lifelog.js        # Content fetcher
│   │   └── analyze-results.js    # Result merger
│   ├── vector-store/      # ChromaDB integration (Phase 2)
│   │   ├── vector-store.interface.ts
│   │   ├── chroma-manager.ts
│   │   └── sync-service.ts
│   ├── resources/         # MCP Resources feature
│   │   ├── handlers.ts    # Resource request handlers
│   │   └── manager.ts     # Resource management logic
│   ├── prompts/           # MCP Prompts feature
│   │   ├── handlers.ts    # Prompt request handlers
│   │   └── templates.ts   # Prompt template definitions
│   ├── sampling/          # MCP Sampling feature
│   │   ├── handlers.ts    # Sampling request handlers
│   │   └── templates.ts   # Sampling templates
│   ├── types/             # TypeScript type definitions
│   │   ├── limitless.ts   # API and domain types
│   │   ├── cache.ts       # Cache type definitions
│   │   ├── mcp.ts         # MCP-specific types
│   │   └── phase2.ts      # Phase 2 types
│   ├── utils/             # Utility functions
│   │   ├── date.ts        # Date formatting/parsing
│   │   ├── format.ts      # Response formatting
│   │   ├── logger.ts      # Logging utility
│   │   └── retry.ts       # Retry logic with exponential backoff
│   └── index.ts           # Main server entry point
├── tests/                 # Test files
│   ├── core/
│   │   └── cache.test.ts  # Cache tests (20 tests)
│   ├── prompts/
│   │   └── handlers.test.ts # Prompt tests (8 tests)
│   ├── resources/
│   │   └── manager.test.ts # Resource tests (11 tests)
│   ├── sampling/
│   │   └── handlers.test.ts # Sampling tests (8 tests)
│   └── utils/
│       └── retry.test.ts  # Retry utility tests
├── examples/              # Usage examples
│   ├── basic-usage.ts     # Simple client usage
│   ├── using-tools.ts     # Demonstrate all 5 tools
│   ├── using-resources.ts # Show resource browsing
│   ├── using-prompts.ts   # Use each prompt template
│   ├── using-sampling.ts  # Content analysis demos
│   ├── advanced-search.ts # Complex search patterns
│   └── caching-strategies.ts # Performance optimization
├── docs/                  # Documentation
│   └── references/        # Reference documentation
│       ├── llms-full_model-context-protocol_20250601.md
│       └── limitless-api-docs_20250601.md
├── dist/                  # Compiled JavaScript output
├── package.json           # Project dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── jest.config.js         # Jest test configuration
├── LICENSE                # MIT License
└── README.md              # User documentation
```

## Key Commands

### Development Commands

```bash
# Install dependencies
npm install

# Build the project (TypeScript → JavaScript)
npm run build

# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate test coverage report
npm run test:coverage

# Lint the code
npm run lint

# Format code with Prettier
npm run format

# Type check without building
npm run typecheck
```

### Git Commands

```bash
# Current branch: dev
git status
git add .
git commit -m "commit message"
git push origin dev

# Create pull request to main
gh pr create --title "PR title" --body "description"
```

## Environment Variables

Required:

- `LIMITLESS_API_KEY` - API key from limitless.ai/developers (required)

Optional:

- `LIMITLESS_BASE_URL` - API base URL (default: https://api.limitless.ai/v1)
- `LIMITLESS_TIMEOUT` - Request timeout in ms (default: 120000)
- `LOG_LEVEL` - Logging level: DEBUG, INFO, WARN, ERROR (default: INFO)

Cache Configuration:

- `CACHE_MAX_SIZE` - Maximum items in lifelog cache (default: 1000)
- `CACHE_TTL` - Lifelog cache TTL in ms (default: 300000 / 5 minutes)
- `SEARCH_CACHE_MAX_SIZE` - Maximum items in search cache (default: 50)
- `SEARCH_CACHE_TTL` - Search cache TTL in ms (default: 180000 / 3 minutes)

Phase 2 Configuration:

- `LIMITLESS_ENABLE_VECTOR` - Enable ChromaDB semantic search (default: false)
- `LIMITLESS_ENABLE_CLAUDE` - Enable Claude AI analysis (default: false)
- `LIMITLESS_ENABLE_SYNC` - Enable background sync (default: false)
- `LIMITLESS_DATA_DIR` - Storage location for embeddings (default: ./data)
- `CHROMADB_URL` - ChromaDB server URL (default: http://localhost:8000)

## API Authentication

The Limitless API uses `X-API-Key` header authentication (NOT Bearer tokens):

```typescript
headers: {
  'X-API-Key': apiKey,
  'Content-Type': 'application/json'
}
```

## Available MCP Tools

### Original Tools (Enhanced in Phase 2)

1. **limitless_get_lifelog_by_id** - Get a specific recording by ID
2. **limitless_list_lifelogs_by_date** - List recordings for a specific date
3. **limitless_list_lifelogs_by_range** - List recordings within a date range
4. **limitless_list_recent_lifelogs** - Get the most recent recordings
5. **limitless_search_lifelogs** - Search for keywords (now 9x faster)

### Phase 2 Tools

6. **limitless_advanced_search** - Intelligent search with auto-routing
7. **limitless_semantic_search** - Find conceptually similar content
8. **limitless_analyze_lifelogs** - AI-powered analysis using Claude
9. **limitless_sync_status** - Monitor background sync status

## Testing the MCP Server

### With Claude Code CLI

```bash
# Add the server
claude mcp add limitless -s user -e LIMITLESS_API_KEY="your-key" -- node /path/to/dist/index.js

# Remove the server
claude mcp remove limitless -s user

# Check status
claude mcp list
```

### Direct Testing

```bash
# Set API key and run
LIMITLESS_API_KEY="your-key" node dist/index.js
```

## Important Implementation Details

1. **API Response Structure**: The Limitless API returns data in a nested structure:

   ```json
   {
     "data": {
       "lifelogs": [...]
     }
   }
   ```

2. **Error Handling**: The client includes retry logic with exponential backoff for transient failures.

3. **Rate Limiting**: Be mindful of API rate limits. The retry logic handles 429 errors.

4. **Search Functionality**: The search tool fetches recent logs and searches client-side (API doesn't have server-side search).

5. **Pagination**: The client handles pagination automatically when fetching multiple records.

## Common Issues and Solutions

1. **Authentication Errors**: Ensure using `X-API-Key` header, not `Authorization: Bearer`
2. **No Data Found**: API only returns Pendant recordings, not app/extension data
3. **Type Errors**: Run `npm run typecheck` before building
4. **Build Failures**: Ensure Node.js 22+ is installed

## Code Style Guidelines

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use async/await instead of callbacks
- Add appropriate error handling
- Include debug logging for important operations
- Write tests for new functionality
- Keep functions focused and single-purpose

## Current Status

- **Version**: 0.2.0 (Phase 2 Complete)
- **Tests**: 53 passing (more tests needed for Phase 2)
- **Node.js**: 22+ required
- **All 5 MCP features + 4 Phase 2 enhancements implemented**
- **Performance**: 59x faster search, semantic capabilities added

See @PROJECT_STATUS.md for detailed metrics and @ROADMAP.md for future plans.

## Release Process

**Important**: Follow the detailed checklist in PUBLISH_CHECKLIST.md for npm publishing.

Quick overview:

1. Ensure all tests pass: `npm test`
2. Run linting: `npm run lint`
3. Build the project: `npm run build`
4. Verify dist/ directory exists and dist/index.js is executable
5. Update version in package.json
6. Commit changes
7. Create a pull request from dev to main
8. After merge, publish to npm and tag the release

See PUBLISH_CHECKLIST.md for the complete pre-publish verification steps and troubleshooting.

## Future Development

See @ROADMAP.md for planned enhancements:

- **Phase 2**: Local Vector Store & Voice-Activated Keywords
- **Phase 3**: Additional features and integrations

## Security Considerations

- Never commit API keys or sensitive data
- Use environment variables for configuration
- Validate all input parameters
- Sanitize error messages to avoid leaking sensitive info
- Keep dependencies updated for security patches

## Troubleshooting

### Common Issues and Solutions

1. **"Unauthorized" Error (401)**

   - **Cause**: Invalid or missing API key
   - **Solution**: Ensure `LIMITLESS_API_KEY` is set correctly
   - **Note**: API uses `X-API-Key` header, not Bearer token

2. **No Data Returned**

   - **Cause**: API only returns Pendant recordings
   - **Solution**: Ensure you have Pendant recordings for the requested dates
   - **Note**: App/extension data is not accessible via API

3. **Cache Not Working**

   - **Cause**: Cache disabled or misconfigured
   - **Solution**: Check cache environment variables are set correctly
   - **Debug**: Enable DEBUG logging to see cache hits/misses

4. **Timeout Errors**

   - **Cause**: Large data requests or slow connection
   - **Solution**: Increase `LIMITLESS_TIMEOUT` (default: 120000ms)
   - **Alternative**: Use smaller `limit` values in requests

5. **Build Failures**

   - **Cause**: Missing dependencies or wrong Node version
   - **Solution**: Run `npm install` and ensure Node.js 22+ is installed
   - **Check**: Run `npm run typecheck` to identify type errors

6. **MCP Client Connection Issues**
   - **Cause**: Incorrect server path or configuration
   - **Solution**: Use absolute paths in MCP client config
   - **Debug**: Check Claude Desktop logs for detailed errors

### Debug Mode

Enable debug logging for troubleshooting:

```bash
export LOG_LEVEL=DEBUG
```

This will show:

- API request/response details
- Cache hit/miss information
- Tool execution traces
- Error stack traces

## Reference Documentation Locations

**Important**: Local reference docs are stored in `docs/references/`:

- **MCP Protocol Specification**: `docs/references/llms-full_model-context-protocol_20250601.md`
- **Limitless API Documentation**: `docs/references/limitless-api-docs_20250601.md`

## Critical Implementation Notes

- **Next Steps & Cleanup**: @NEXT_STEPS_INSTRUCTIONS.md
- **Project Status**: @PROJECT_STATUS.md
- **Development Roadmap**: @ROADMAP.md

## Phase 2: Intelligent Search & Voice Keywords Implementation

> ⚡ **Phase 2 Status**: In Development  
> Phase 2 enhances the MCP server with AI-powered search capabilities and voice-activated keyword monitoring.

### Phase 2 Architecture Overview

Phase 2 introduces a multi-tier architecture for intelligent search and keyword monitoring:

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client Request                        │
└─────────────────────┬───────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Query Router (<5ms decision)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Simple Query│  │Complex Query │  │ Analytical Query │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼────────────────┼───────────────────┼─────────────┘
          ▼                ▼                   ▼
    ┌─────────────┐  ┌─────────────┐    ┌─────────────┐
    │  Fast Path  │  │Hybrid Search│    │Claude Agent │
    │   (<100ms)  │  │  (200-500ms)│    │   (2-3s)    │
    └─────────────┘  └─────────────┘    └─────────────┘
          │                │                   │
          ▼                ▼                   ▼
    ┌─────────────────────────────────────────────────┐
    │            Unified Response Handler              │
    └─────────────────────────────────────────────────┘
```

### Enabling Phase 2 Features

#### Environment Variables

```bash
# Phase 2 Core Features
PHASE2_ENABLED=true                    # Enable Phase 2 features (default: false)
CLAUDE_CLI_PATH=/usr/local/bin/claude  # Path to Claude CLI (auto-detected if not set)

# Vector Store Configuration
VECTOR_STORE_ENABLED=true              # Enable ChromaDB vector store
VECTOR_STORE_PATH=./data/chroma        # ChromaDB storage location
VECTOR_STORE_COLLECTION=lifelogs       # Collection name
EMBEDDING_BATCH_SIZE=100               # Batch size for embedding generation
EMBEDDING_MODEL=chromadb-default       # Use ChromaDB's default embeddings

# Search Configuration
SEARCH_STRATEGY=hybrid                 # Options: fast, vector, hybrid, claude
SEARCH_FAST_THRESHOLD_MS=100          # Max time for fast path
SEARCH_HYBRID_THRESHOLD_MS=500        # Max time for hybrid search
SEARCH_MAX_RESULTS=50                  # Maximum results to return

# Keyword Monitoring
KEYWORD_MONITOR_ENABLED=true           # Enable keyword monitoring
KEYWORD_POLL_INTERVAL_MS=30000         # Polling interval (30s default)
KEYWORD_CONFIG_PATH=./config/keywords.json  # Keyword configuration file

# Performance Tuning
QUERY_CACHE_SIZE=1000                  # Query result cache size
QUERY_CACHE_TTL_MS=600000              # Query cache TTL (10 minutes)
PARALLEL_SEARCH_WORKERS=4              # Number of parallel search workers
```

### Phase 2 Tools

Phase 2 adds new intelligent search tools while maintaining backward compatibility:

#### 1. `limitless_intelligent_search`

Advanced search with automatic strategy selection:

```typescript
{
  query: string;              // Search query
  strategy?: 'auto' | 'fast' | 'vector' | 'hybrid' | 'claude';
  date_range?: { start: string; end: string };
  limit?: number;
  include_analysis?: boolean; // Include AI analysis of results
}
```

#### 2. `limitless_semantic_search`

Vector-based semantic search:

```typescript
{
  query: string;              // Semantic query
  similarity_threshold?: number; // 0.0-1.0 (default: 0.7)
  date_filter?: string;       // Optional date filter
  limit?: number;
}
```

#### 3. `limitless_analyze_patterns`

AI-powered pattern analysis:

```typescript
{
  time_period: 'day' | 'week' | 'month' | 'custom';
  pattern_types?: string[];   // e.g., ['meetings', 'tasks', 'decisions']
  custom_range?: { start: string; end: string };
}
```

#### 4. `limitless_monitor_keywords`

Manage keyword monitoring:

```typescript
{
  action: 'start' | 'stop' | 'status' | 'add_keyword' | 'remove_keyword';
  keyword?: string;           // For add/remove actions
  keyword_config?: {          // For add action
    pattern: string;
    action_type: string;
    metadata?: object;
  };
}
```

### Search Strategies

Phase 2 implements intelligent query routing based on query complexity:

#### 1. Fast Path (<100ms)

Used for simple, direct queries:

- Exact ID lookups
- Recent items (today, yesterday)
- Simple date queries
- Cached results

```typescript
// Examples of fast path queries:
"show today's recordings";
'get lifelog abc123';
"list yesterday's meetings";
```

#### 2. Vector Search (100-300ms)

Used for semantic/conceptual queries:

- Topic-based searches
- Similarity matching
- Conceptual queries
- "Find discussions about..."

```typescript
// Examples of vector search queries:
'conversations about project deadlines';
'discussions similar to machine learning';
'meetings where we talked about budgets';
```

#### 3. Hybrid Search (200-500ms)

Combines vector + full-text search:

- Mixed exact/semantic queries
- Date-filtered semantic search
- Keyword + concept matching

```typescript
// Examples of hybrid queries:
"meetings about 'Project X' last week";
"find 'action item' in budget discussions";
'urgent tasks from team meetings';
```

#### 4. Claude Agent Search (2-3s)

Complex analytical queries:

- Multi-step analysis
- Cross-reference queries
- Summarization requests
- Pattern identification

```typescript
// Examples of Claude agent queries:
'summarize all decisions made about hiring this month';
'find patterns in my meeting schedule';
'analyze productivity trends from last quarter';
```

### File Structure for Phase 2

```
src/
├── search/                    # Phase 2 Search System
│   ├── query-router.ts       # Intelligent query routing
│   ├── strategies/           # Search strategy implementations
│   │   ├── fast-path.ts     # Direct/cached queries
│   │   ├── vector-search.ts # ChromaDB semantic search
│   │   ├── hybrid-search.ts # Combined search
│   │   └── claude-agent.ts  # Claude CLI integration
│   ├── claude-orchestrator.ts # Claude CLI wrapper
│   └── search-cache.ts       # Intelligent result caching
│
├── vector-store/             # Vector Database Layer
│   ├── chroma-client.ts      # ChromaDB implementation
│   ├── vector-store.interface.ts # Abstract interface
│   ├── embedding-service.ts  # Embedding generation
│   └── sync-service.ts       # Incremental sync with API
│
├── monitoring/               # Keyword Monitoring System
│   ├── keyword-monitor.ts    # Main monitoring service
│   ├── keyword-detector.ts   # Pattern matching logic
│   ├── action-registry.ts    # Action execution
│   └── notification-service.ts # Alert system
│
├── storage/                  # Scalable Storage
│   ├── file-manager.ts       # Date-hierarchical storage
│   ├── metadata-index.ts     # Fast metadata lookups
│   └── aggregation-service.ts # Monthly/yearly rollups
│
└── tools/                    # Phase 2 Tool Definitions
    ├── intelligent-search.ts # New search tools
    ├── keyword-tools.ts      # Monitoring tools
    └── analysis-tools.ts     # Pattern analysis
```

### Performance Benchmarks

Phase 2 performance improvements over Phase 1:

| Query Type       | Phase 1                    | Phase 2         | Improvement    |
| ---------------- | -------------------------- | --------------- | -------------- |
| Simple lookup    | 5.9s (cold) / 0ms (cached) | <100ms (always) | 59x faster     |
| Keyword search   | 1.8s                       | 200-300ms       | 6-9x faster    |
| Complex search   | N/A                        | 2-3s            | New capability |
| Semantic search  | N/A                        | 100-300ms       | New capability |
| Pattern analysis | N/A                        | 2-5s            | New capability |

#### Cache Performance

- **L1 Cache**: In-memory LRU (0ms hits)
- **L2 Cache**: Vector embeddings (5-10ms)
- **L3 Cache**: Query results (10-20ms)
- **Cold start**: 100-3000ms depending on strategy

### Running with Phase 2 Features

#### Initial Setup

```bash
# 1. Install Claude Code CLI (required)
npm install -g @anthropic/claude-code
claude auth login  # Authenticate with Claude.ai

# 2. Install Phase 2 dependencies
npm install chromadb                    # Vector database
npm install @types/node-cron           # For monitoring service

# 3. Build with Phase 2 features
PHASE2_ENABLED=true npm run build

# 4. Initialize vector store (one-time)
npm run phase2:init
```

#### Running the Server

```bash
# Basic Phase 2 mode
PHASE2_ENABLED=true LIMITLESS_API_KEY="your-key" node dist/index.js

# Full Phase 2 with all features
PHASE2_ENABLED=true \
VECTOR_STORE_ENABLED=true \
KEYWORD_MONITOR_ENABLED=true \
SEARCH_STRATEGY=hybrid \
LIMITLESS_API_KEY="your-key" \
node dist/index.js

# Development mode with hot reload
PHASE2_ENABLED=true npm run dev
```

#### Testing Phase 2 Features

```bash
# Run Phase 2 specific tests
npm run test:phase2

# Test vector store integration
npm run test:vector-store

# Test Claude CLI integration
npm run test:claude-integration

# Benchmark search performance
npm run benchmark:search
```

### Phase 2 Implementation Guide

#### 1. Query Router Implementation

```typescript
// src/search/query-router.ts
export class QueryRouter {
  async route(query: string): Promise<SearchStrategy> {
    // Fast path detection (<5ms)
    if (this.isFastQuery(query)) {
      return 'fast';
    }

    // Semantic query detection
    if (this.isSemanticQuery(query)) {
      return 'vector';
    }

    // Complex analytical query
    if (this.isAnalyticalQuery(query)) {
      return 'claude';
    }

    // Default to hybrid
    return 'hybrid';
  }
}
```

#### 2. Claude CLI Integration

```typescript
// src/search/claude-orchestrator.ts
export class ClaudeOrchestrator {
  async search(query: string, context: SearchContext): Promise<SearchResult> {
    const prompt = this.buildSearchPrompt(query, context);

    // Execute with specific tools enabled
    const result = await this.executeClaude({
      prompt,
      allowedTools: ['Read', 'Bash(rg:*)', 'ChromaSearch'],
      outputFormat: 'json',
      maxTurns: 3,
      timeout: 30000,
    });

    return this.parseSearchResult(result);
  }
}
```

#### 3. Vector Store Sync

```typescript
// src/vector-store/sync-service.ts
export class VectorSyncService {
  async syncNewLifelogs(): Promise<void> {
    // Fetch new lifelogs since last sync
    const newLogs = await this.getUnprocessedLogs();

    // Batch generate embeddings
    for (const batch of this.batchItems(newLogs, 100)) {
      const embeddings = await this.generateEmbeddings(batch);
      await this.vectorStore.addDocuments(embeddings);
    }

    // Update sync timestamp
    await this.updateSyncState();
  }
}
```

### Phase 2 Monitoring & Debugging

#### Debug Environment Variables

```bash
# Enable detailed Phase 2 debugging
DEBUG_PHASE2=true                  # General Phase 2 debug logs
DEBUG_VECTOR_STORE=true           # Vector store operations
DEBUG_QUERY_ROUTER=true           # Query routing decisions
DEBUG_CLAUDE_CALLS=true           # Claude CLI interactions
DEBUG_KEYWORD_MONITOR=true        # Keyword detection logs
```

#### Performance Monitoring

```typescript
// Performance metrics are exposed via:
const metrics = await mcpClient.request({
  method: 'limitless_get_metrics',
  params: { category: 'search' }
});

// Returns:
{
  "search_performance": {
    "avg_response_time_ms": 245,
    "cache_hit_rate": 0.78,
    "strategy_distribution": {
      "fast": 0.65,
      "vector": 0.20,
      "hybrid": 0.10,
      "claude": 0.05
    }
  }
}
```

### Phase 2 Best Practices

1. **Query Optimization**

   - Use specific dates when possible
   - Include keywords for hybrid search
   - Cache complex query results

2. **Vector Store Management**

   - Run sync during off-peak hours
   - Monitor embedding storage size
   - Backup embeddings regularly

3. **Claude CLI Usage**

   - Set appropriate timeouts
   - Use --max-turns to limit costs
   - Cache Claude analysis results

4. **Keyword Monitoring**
   - Start with simple patterns
   - Test actions before enabling
   - Monitor false positive rate

### Migration from Phase 1 to Phase 2

Phase 2 is fully backward compatible. To migrate:

1. **No Breaking Changes**: All Phase 1 tools continue to work
2. **Gradual Adoption**: Enable Phase 2 features individually
3. **Data Migration**: Run `npm run phase2:migrate` to build initial vector store
4. **Performance Testing**: Use `npm run benchmark:compare` to verify improvements

## Claude Code CLI Integration (Phase 2 Prerequisites)

### Prerequisites

For Phase 2 enhanced search features, this server requires Claude Code CLI:

```bash
# Users must have Claude Code CLI installed and authenticated
claude --version  # Check installation

# Authenticate with Claude Max subscription for unlimited tokens
claude auth login  # Opens browser for SSO authentication
```

### Claude CLI Usage in the Project

The server executes Claude CLI in headless mode using Node.js child_process:

```typescript
// Basic execution with JSON output
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runClaudeAnalysis(prompt: string) {
  const { stdout } = await execAsync(`claude -p "${prompt}" --output-format json --max-turns 3`, {
    timeout: 120000, // 2 minute timeout
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });
  return JSON.parse(stdout);
}

// Streaming for real-time feedback
import { spawn } from 'child_process';

function streamClaudeSearch(prompt: string) {
  const child = spawn('claude', [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--allowedTools',
    'Read,Bash(rg:*)',
  ]);

  child.stdout.on('data', (chunk) => {
    const message = JSON.parse(chunk.toString());
    // Process each message as it arrives
  });
}
```

**Command Flags Used:**

- `-p "prompt"` - Headless mode with prompt
- `--output-format json` - Structured output for parsing
- `--output-format stream-json` - Real-time streaming
- `--max-turns 3` - Limit iterations for cost control
- `--allowedTools` - Pre-approve safe tools

**Important Notes:**

- No need to specify model, temperature, or tokens (uses user's Claude settings)
- Requires active Claude Max subscription for optimal performance
- All processing uses the user's allocated Claude.ai tokens
- SSO authentication links browser session to Claude Code
- User must run `claude auth login` before first use

### Context Management Strategy

When implementing search features, use sub-agents to preserve context:

```typescript
// Good: Use Task tool for research (only summary enters context)
await Task({
  description: 'Research vector databases',
  prompt: 'Compare vector databases for TypeScript...',
});

// Avoid: Direct searches that fill up context
// await WebSearch(...) // Full results enter context
```

### Scalability Considerations

The system is designed to handle tens of thousands of days of lifelogs:

**Storage Structure**:

```
/data/
  /lifelogs/YYYY/MM/DD/    # Date-based hierarchy
    - {id}.md              # Original transcript (preserves searchability)
    - {id}.meta.json       # Metadata for filtering
  /embeddings/             # Portable vector embeddings
  /indexes/                # Vector DB files (swappable)
```

**Performance at Scale**:

- 10K days: ~100MB memory (very fast)
- 100K days: ~1GB memory (still performant)
- 1M+ days: Implement sharding by year

**Vector DB Portability**:

- Abstract interface allows easy swapping between ChromaDB, Qdrant, etc.
- Raw embeddings stored separately from vector DB
- Original markdown files always preserved

## Useful Links

- [Limitless API Docs](https://www.limitless.ai/developers)
- [MCP Protocol Spec](https://github.com/anthropics/model-context-protocol)
- [Project Repository](https://github.com/ericbuess/limitless-ai-mcp-server)
- [Issue Tracker](https://github.com/ericbuess/limitless-ai-mcp-server/issues)
- [Claude Code CLI](https://claude.ai/code)
