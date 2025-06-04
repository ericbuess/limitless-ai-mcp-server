# Setup Guide for Phase 2 Testing

## Prerequisites

### 1. Get Limitless API Key

1. Go to https://www.limitless.ai/developers
2. Sign up/login to your Limitless account
3. Generate an API key
4. Save it as: `export LIMITLESS_API_KEY="your-actual-key-here"`

### 2. Install ChromaDB (Optional - for vector search)

```bash
# Option 1: Docker (recommended)
docker pull chromadb/chroma:latest
docker run -d --name chromadb -p 8000:8000 chromadb/chroma:latest

# Option 2: Python
pip install chromadb
chroma run --host localhost --port 8000
```

### 3. Install Claude CLI (Optional - for advanced analysis)

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Authenticate (requires Claude subscription)
claude auth login
```

## Quick Start

### Basic Setup (Fast search only)

```bash
# Clone and install
cd /Users/ericbuess/Projects/limitless-ai-mcp-server
npm install

# Build
npm run build

# Run with your API key
export LIMITLESS_API_KEY="your-actual-key-here"
npm start
```

### Full Setup (All features)

```bash
# 1. Start ChromaDB
docker start chromadb

# 2. Set environment
export LIMITLESS_API_KEY="your-actual-key-here"
export LIMITLESS_ENABLE_VECTOR=true
export LIMITLESS_ENABLE_CLAUDE=true
export LIMITLESS_ENABLE_SYNC=true

# 3. Run server
npm start
```

## Testing

### With Claude Desktop

1. Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "limitless": {
      "command": "node",
      "args": ["/Users/ericbuess/Projects/limitless-ai-mcp-server/dist/index.js"],
      "env": {
        "LIMITLESS_API_KEY": "your-actual-key-here",
        "LIMITLESS_ENABLE_VECTOR": "true"
      }
    }
  }
}
```

2. Restart Claude Desktop
3. Test commands:
   - "Search my meetings from yesterday"
   - "Find discussions about budget"
   - "What action items do I have?"

### Direct Testing

```bash
# Test basic search
curl -X POST http://localhost:3000/tools/limitless_advanced_search \
  -d '{"query": "meeting yesterday"}'

# Test semantic search (requires ChromaDB)
curl -X POST http://localhost:3000/tools/limitless_semantic_search \
  -d '{"query": "product roadmap discussions"}'
```

## Verify Installation

### Check Dependencies

```bash
# Node.js 22+
node --version

# ChromaDB (if using vector search)
curl http://localhost:8000/api/v1/heartbeat

# Claude CLI (if using advanced analysis)
claude --version
```

### Test Components

```bash
# Run component test
node test-phase2.js

# Run MCP protocol test
node test-mcp.js
```

## Troubleshooting

### "Unauthorized" Error

- Check your API key is valid
- Ensure you have Pendant recordings (not just app data)

### ChromaDB Connection Failed

```bash
# Check if running
docker ps | grep chromadb

# Restart if needed
docker restart chromadb
```

### Build Errors

```bash
# Clean and rebuild
npm run clean
npm run build
```

## What's Installed

### NPM Dependencies (Already installed)

- ✅ @modelcontextprotocol/sdk@1.12.1
- ✅ chromadb@2.4.6
- ✅ chromadb-default-embed@2.14.0
- ✅ zod@3.25.48
- ✅ All dev dependencies

### Phase 2 Files (All created)

- ✅ 15 TypeScript source files
- ✅ 4 executable tool scripts
- ✅ Test files
- ✅ Documentation

You have everything needed to run Phase 2!
