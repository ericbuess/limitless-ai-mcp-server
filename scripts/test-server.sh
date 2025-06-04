#!/bin/bash

echo "Testing Limitless AI MCP Server with Phase 2 features..."
echo

# Set test environment
export LIMITLESS_API_KEY="test-key-12345"
export LOG_LEVEL="INFO"

# Test 1: List tools
echo "Test 1: Listing available tools..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js 2>/dev/null | jq '.result.tools | length' | xargs -I {} echo "Found {} tools"

# Test 2: Check server info
echo
echo "Test 2: Getting server info..."
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js 2>/dev/null | jq '.result.serverInfo'

echo
echo "✅ Basic server test complete!"
echo
echo "To test with real data:"
echo "1. Set a valid LIMITLESS_API_KEY"
echo "2. Enable features: LIMITLESS_ENABLE_VECTOR=true LIMITLESS_ENABLE_CLAUDE=true"
echo "3. Run: npm start"