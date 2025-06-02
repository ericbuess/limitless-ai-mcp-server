# Limitless AI MCP Server - Claude Development Guide

> 🤖 **Purpose**: This document provides essential information for Claude and other AI assistants to effectively work on this project. It includes project structure, development commands, implementation details, and troubleshooting guidance.

## Project Overview

This is a Model Context Protocol (MCP) server that enables AI assistants to interact with the Limitless AI API, specifically for accessing Pendant recordings (lifelogs). The server provides structured tools for searching, listing, and retrieving recording data.

## Project Structure

```
limitless-ai-mcp-server/
├── src/                    # Source code
│   ├── core/              # Core business logic
│   │   ├── limitless-client.ts    # API client implementation
│   │   └── cache.ts       # LRU cache with TTL support
│   ├── tools/             # MCP tool definitions
│   │   ├── definitions.ts # Tool metadata and descriptions
│   │   ├── handlers.ts    # Tool implementation handlers
│   │   └── schemas.ts     # Zod schemas for validation
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
│   │   └── mcp.ts         # MCP-specific types
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

- `CACHE_MAX_SIZE` - Maximum items in lifelog cache (default: 100)
- `CACHE_TTL` - Lifelog cache TTL in ms (default: 300000 / 5 minutes)
- `SEARCH_CACHE_MAX_SIZE` - Maximum items in search cache (default: 50)
- `SEARCH_CACHE_TTL` - Search cache TTL in ms (default: 180000 / 3 minutes)

## API Authentication

The Limitless API uses `X-API-Key` header authentication (NOT Bearer tokens):

```typescript
headers: {
  'X-API-Key': apiKey,
  'Content-Type': 'application/json'
}
```

## Available MCP Tools

1. **limitless_get_lifelog_by_id** - Get a specific recording by ID
2. **limitless_list_lifelogs_by_date** - List recordings for a specific date
3. **limitless_list_lifelogs_by_range** - List recordings within a date range
4. **limitless_list_recent_lifelogs** - Get the most recent recordings
5. **limitless_search_lifelogs** - Search for keywords in recent recordings

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

- **Version**: 0.0.1 (Released)
- **Tests**: 53 passing
- **Node.js**: 22+ required
- **All 5 MCP features implemented**

See @PROJECT_STATUS.md for detailed metrics and @ROADMAP.md for future plans.

## Release Process

1. Ensure all tests pass: `npm test`
2. Run linting: `npm run lint`
3. Build the project: `npm run build`
4. Update version in package.json
5. Commit changes
6. Create a pull request from dev to main
7. After merge, tag the release

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

## Useful Links

- [Limitless API Docs](https://www.limitless.ai/developers)
- [MCP Protocol Spec](https://github.com/anthropics/model-context-protocol)
- [Project Repository](https://github.com/ericbuess/limitless-ai-mcp-server)
- [Issue Tracker](https://github.com/ericbuess/limitless-ai-mcp-server/issues)
