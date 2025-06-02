# Limitless AI MCP Server MVP Plan

This document outlines the implementation plan for creating an MVP that demonstrates all MCP protocol features with the Limitless API.

## Reference Documents
- MCP Protocol Spec: `docs/references/llms-full_model-context-protocol_20250601.md`
- Limitless API Docs: `docs/references/limitless-api-docs_20250601.md`

## Overview

The Limitless API currently provides 2 endpoints:
- `GET /v1/lifelogs` - List/search lifelogs with various filters
- `GET /v1/lifelogs/:id` - Get a specific lifelog by ID

Our MVP will implement all MCP protocol features to provide multiple ways to access and analyze this data.

## Implementation Plan

### 1. Core MCP Features Implementation

#### 1.1 Resources (NEW)
Expose lifelogs as browseable resources that clients can discover and access.

- [ ] Implement `resources/list` handler to list available lifelogs
- [ ] Implement `resources/read` handler for individual lifelog access
- [ ] Create URI scheme: `lifelog://{date}/{id}` or `lifelog://{id}`
- [ ] Add resource metadata (title, date, duration, speakers)
- [ ] Support resource templates for dynamic listing

**Files to create:**
- `src/resources/handlers.ts` - Resource request handlers
- `src/resources/manager.ts` - Resource management logic

#### 1.2 Prompts (NEW)
Provide ready-to-use prompt templates for common lifelog analysis tasks.

- [ ] Create prompt templates:
  - [ ] `daily-summary` - Summarize lifelogs from a specific day
  - [ ] `action-items` - Extract action items from lifelogs
  - [ ] `key-topics` - Identify main topics discussed
  - [ ] `meeting-notes` - Format lifelogs as meeting notes
  - [ ] `search-insights` - Analyze search results
- [ ] Implement `prompts/list` handler
- [ ] Implement `prompts/get` handler with argument support
- [ ] Support dynamic arguments (date, search terms, etc.)

**Files to create:**
- `src/prompts/handlers.ts` - Prompt request handlers
- `src/prompts/templates.ts` - Prompt template definitions

#### 1.3 Tools (EXISTING - COMPLETE)
Already implemented with 5 tools for searching and listing lifelogs.

#### 1.4 Discovery (NEW)
Implement capability discovery so clients know what's available.

- [ ] Add server capabilities manifest
- [ ] Implement version information
- [ ] List supported features and limitations
- [ ] Provide schema information for tools/resources/prompts

**Files to modify:**
- `src/index.ts` - Add capability discovery to server initialization

#### 1.5 Sampling (NEW)
Allow LLMs to process lifelog content for analysis.

- [ ] Implement `sampling/createMessage` handler
- [ ] Support sampling requests for:
  - [ ] Summarization of lifelog content
  - [ ] Extraction of specific information
  - [ ] Analysis of patterns or trends
- [ ] Add sampling templates for common use cases
- [ ] Include token usage estimation

**Files to create:**
- `src/sampling/handlers.ts` - Sampling request handlers
- `src/sampling/templates.ts` - Pre-built sampling configurations

### 2. Performance & Reliability

#### 2.1 Caching System
Optimize for persistent searching and retrieval patterns.

- [ ] Implement in-memory LRU cache for lifelogs
- [ ] Cache search results with TTL
- [ ] Add cache warming for frequently accessed data
- [ ] Implement cache invalidation strategies
- [ ] Add cache hit/miss metrics

**Files to create:**
- `src/core/cache.ts` - Cache implementation
- `src/types/cache.ts` - Cache type definitions

#### 2.2 Request Optimization
Enhance API efficiency.

- [ ] Implement request deduplication
- [ ] Add parallel request handling where applicable
- [ ] Optimize pagination with cursor management
- [ ] Implement request batching for bulk operations
- [ ] Add connection pooling

**Files to modify:**
- `src/core/limitless-client.ts` - Add optimization features

#### 2.3 Error Handling & Monitoring
Ensure reliability.

- [ ] Enhance retry logic with exponential backoff (already exists)
- [ ] Add detailed error categorization
- [ ] Implement health check endpoint
- [ ] Add performance metrics collection
- [ ] Create error recovery strategies

**Files to create:**
- `src/monitoring/metrics.ts` - Performance metrics
- `src/monitoring/health.ts` - Health check implementation

### 3. Documentation & Examples

#### 3.1 Comprehensive README
- [ ] Overview of MCP protocol implementation
- [ ] Detailed explanation of each MCP feature:
  - [ ] How Resources work with lifelogs
  - [ ] Available Prompts and their use cases
  - [ ] Tool capabilities and parameters
  - [ ] Discovery mechanism
  - [ ] Sampling functionality
- [ ] Installation and configuration guide
- [ ] API authentication setup
- [ ] Performance optimization tips

#### 3.2 Example Usage
Create example files demonstrating each MCP feature.

- [ ] `examples/using-tools.ts` - Tool usage examples
- [ ] `examples/using-resources.ts` - Resource browsing examples
- [ ] `examples/using-prompts.ts` - Prompt template examples
- [ ] `examples/using-sampling.ts` - Content analysis examples
- [ ] `examples/advanced-search.ts` - Complex search patterns
- [ ] `examples/caching-strategies.ts` - Performance optimization

#### 3.3 Integration Guides
- [ ] Guide for Claude Desktop integration
- [ ] Guide for custom client integration
- [ ] Best practices for efficient lifelog retrieval
- [ ] Troubleshooting common issues

### 4. Testing

#### 4.1 Unit Tests
- [ ] Test all MCP handlers (resources, prompts, sampling)
- [ ] Test cache functionality
- [ ] Test error handling scenarios
- [ ] Test request optimization logic

#### 4.2 Integration Tests
- [ ] Test full MCP protocol compliance
- [ ] Test API integration with mock server
- [ ] Test caching behavior
- [ ] Test error recovery

#### 4.3 Performance Tests
- [ ] Benchmark response times
- [ ] Test cache effectiveness
- [ ] Measure memory usage
- [ ] Test concurrent request handling

## Phase 2 Enhancements (Post-MVP)

### 5. Local Vector Store for Semantic Search

Enable offline access and fast semantic search through local vector embeddings.

#### 5.1 Vector Store Implementation
- [ ] Set up vector database (ChromaDB, Weaviate, or FAISS)
- [ ] Implement embedding generation for lifelog content
- [ ] Create daily sync mechanism to download new lifelogs
- [ ] Build hybrid search (check local first, fallback to API)
- [ ] Add semantic similarity search capabilities
- [ ] Implement offline mode support

#### 5.2 Search Enhancement
- [ ] Add natural language query understanding
- [ ] Implement relevance ranking based on embeddings
- [ ] Support complex semantic queries ("meetings about project X")
- [ ] Add query expansion for better recall
- [ ] Create search analytics

**Files to create:**
- `src/vector-store/manager.ts` - Vector store management
- `src/vector-store/embeddings.ts` - Embedding generation
- `src/vector-store/sync.ts` - Daily sync service
- `src/vector-store/search.ts` - Semantic search implementation

### 6. Voice-Activated Keyword Monitoring System

Transform the Pendant into a voice-command system by monitoring for keywords and triggering actions.

#### 6.1 Monitoring Service
- [ ] Create background service polling recent lifelogs (30-60s intervals)
- [ ] Implement efficient delta checking (only new content)
- [ ] Add configurable polling intervals
- [ ] Create monitoring dashboard/status
- [ ] Implement pause/resume functionality

#### 6.2 Keyword Detection System
- [ ] Define keyword configuration schema
- [ ] Implement exact match detection ("Hey Limitless")
- [ ] Add pattern matching ("Action item: *", "Remind me to *")
- [ ] Support context-aware keywords ("urgent", "important")
- [ ] Create keyword validation and testing tools

#### 6.3 Action Registry & Execution
- [ ] Create action mapping system (keyword → action)
- [ ] Implement action types:
  - [ ] Create task/reminder
  - [ ] Send notification
  - [ ] Trigger webhook
  - [ ] Execute MCP tool
  - [ ] Calendar integration
- [ ] Add action confirmation/logging
- [ ] Support custom action plugins

#### 6.4 Notification System
- [ ] Real-time alerts when keywords detected
- [ ] Action execution confirmations
- [ ] Error/failure notifications
- [ ] Daily summary of triggered actions
- [ ] Integration with notification services

**Example Use Cases:**
- "Hey Limitless, remind me to call John tomorrow" → Creates reminder
- "Action item: review the budget proposal" → Adds to task list
- "Note to self: great idea about..." → Saves to notes
- "Urgent: need to fix the..." → High-priority notification
- "Schedule meeting with Sarah next week" → Calendar event

**Files to create:**
- `src/monitoring/keyword-monitor.ts` - Main monitoring service
- `src/monitoring/keyword-detector.ts` - Keyword detection logic
- `src/monitoring/action-registry.ts` - Action mapping and execution
- `src/monitoring/notification-service.ts` - Alert system
- `src/types/monitoring.ts` - Type definitions
- `config/keywords.json` - Default keyword configurations

## File Structure

```
src/
├── core/
│   ├── limitless-client.ts    # API client (existing, enhance)
│   └── cache.ts               # Caching implementation (new)
├── tools/                     # MCP Tools (existing)
│   ├── definitions.ts
│   ├── handlers.ts
│   └── schemas.ts
├── resources/                 # MCP Resources (new)
│   ├── handlers.ts
│   └── manager.ts
├── prompts/                   # MCP Prompts (new)
│   ├── handlers.ts
│   └── templates.ts
├── sampling/                  # MCP Sampling (new)
│   ├── handlers.ts
│   └── templates.ts
├── monitoring/                # Health & Metrics + Phase 2 (new)
│   ├── health.ts
│   ├── metrics.ts
│   ├── keyword-monitor.ts     # Phase 2
│   ├── keyword-detector.ts    # Phase 2
│   ├── action-registry.ts     # Phase 2
│   └── notification-service.ts # Phase 2
├── vector-store/              # Phase 2 (new)
│   ├── manager.ts
│   ├── embeddings.ts
│   ├── sync.ts
│   └── search.ts
├── types/                     # TypeScript types
│   ├── limitless.ts          # API types (existing)
│   ├── cache.ts              # Cache types (new)
│   ├── mcp.ts                # MCP-specific types (new)
│   └── monitoring.ts         # Phase 2 types (new)
├── utils/                     # Utilities (existing)
└── index.ts                   # Main server (enhance)
```

## Key Design Decisions

1. **URI Scheme for Resources**: Use `lifelog://{date}/{id}` to enable browsing by date
2. **Caching Strategy**: LRU in-memory cache with configurable TTL
3. **Prompt Templates**: Focus on practical use cases for Pendant recordings
4. **Sampling Integration**: Direct integration with LLM for content analysis
5. **Performance First**: Optimize for search and retrieval patterns

## Success Criteria

- [ ] All 5 MCP features implemented and working
- [ ] Response time < 100ms for cached requests
- [ ] Clear documentation with examples for each feature
- [ ] 100% test coverage for core functionality
- [ ] Working examples for each MCP feature
- [ ] Efficient handling of pagination and large result sets

## Next Steps

1. Implement Resources feature first (most visual/demonstrable)
2. Add Prompts for common use cases
3. Implement Sampling for content analysis
4. Add Discovery for capability introspection
5. Optimize with caching and performance improvements
6. Create comprehensive documentation and examples
7. Test thoroughly with real Limitless API data
EOF < /dev/null