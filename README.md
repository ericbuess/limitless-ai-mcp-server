# Limitless AI MCP Server

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://github.com/ericbuess/limitless-ai-mcp-server)
[![Status](https://img.shields.io/badge/status-beta-orange.svg)](https://github.com/ericbuess/limitless-ai-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/ericbuess/limitless-ai-mcp-server/branch/main/graph/badge.svg)](https://codecov.io/gh/ericbuess/limitless-ai-mcp-server)

An advanced Model Context Protocol (MCP) server that enables AI assistants to interact with Limitless AI Pendant recordings. This server provides a seamless bridge between your AI tools and Limitless API, allowing you to extract insights, search through recordings, and analyze your Pendant data.

> ⚠️ **Beta Release**: This is an early release (v0.0.1). While core features are implemented and tested, we need community feedback to validate all functionality. Please [report any issues](https://github.com/ericbuess/limitless-ai-mcp-server/issues)!

## 🌟 Features

### Core Capabilities

- **Full Limitless API Integration**: Access all your Pendant recordings programmatically
- **Advanced Search**: Search through your recordings with keyword matching
- **Flexible Querying**: List recordings by date, date range, or get recent recordings
- **Rich Content Access**: Retrieve markdown content, headings, and metadata
- **High Performance**: Intelligent caching with LRU eviction and TTL support
- **Robust Error Handling**: Built-in retry logic and timeout management
- **Type Safety**: Full TypeScript support with comprehensive type definitions

### MCP Protocol Implementation

- **🔧 Tools**: 5 specialized tools for searching and retrieving recordings
- **📁 Resources**: Browse recordings as structured resources with URI navigation
- **📝 Prompts**: Pre-built templates for common analysis tasks
- **🔍 Sampling**: AI-powered content analysis and summarization
- **🔎 Discovery**: Automatic capability exposure to MCP clients

## 📋 Requirements

- **Node.js 22+**
- **Limitless Pendant** (Required - API only returns Pendant recordings)
- **Limitless API Key** (Get from [limitless.ai/developers](https://limitless.ai/developers))
- **MCP-compatible client** (Claude Desktop, Windsurf, Cursor, etc.)

## 🏃 Quick Start

1. **Get your API key** from [limitless.ai/developers](https://limitless.ai/developers)
2. **Clone and build**:
   ```bash
   git clone https://github.com/ericbuess/limitless-ai-mcp-server.git
   cd limitless-ai-mcp-server
   npm install
   npm run build
   ```
3. **Configure Claude Code**:
   ```bash
   claude mcp add limitless -s user -e LIMITLESS_API_KEY="your-key" -- node $(pwd)/dist/index.js
   ```
4. **Start chatting**: "Show me my recordings from today"

## 🚀 Installation

### Option 1: Install from npm

```bash
npm install -g limitless-ai-mcp-server
```

### Option 2: Install from Source

```bash
# Clone the repository
git clone https://github.com/ericbuess/limitless-ai-mcp-server.git
cd limitless-ai-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Optional: Link globally
npm link
```

## 🔧 Configuration

### 1. Set up your Limitless API key

```bash
# Add to your shell profile (.bashrc, .zshrc, etc.)
export LIMITLESS_API_KEY="your-api-key-here"

# Optional: Configure custom settings
export LIMITLESS_TIMEOUT=120000  # Timeout in milliseconds
export LIMITLESS_BASE_URL="https://api.limitless.ai/v1"  # Custom API endpoint
export LOG_LEVEL="INFO"  # Options: DEBUG, INFO, WARN, ERROR

# Optional: Configure caching
export CACHE_MAX_SIZE=100  # Maximum cached items
export CACHE_TTL=300000  # Cache lifetime in ms (5 minutes)
export SEARCH_CACHE_MAX_SIZE=50  # Search cache size
export SEARCH_CACHE_TTL=180000  # Search cache lifetime (3 minutes)
```

### 2. Configure your MCP client

#### Claude Code CLI

If you're using Claude Code (Anthropic's official CLI), run:

```bash
# Add the server (replace path with your actual installation path)
claude mcp add limitless -s user -e LIMITLESS_API_KEY="your-api-key-here" -- node /path/to/limitless-ai-mcp-server/dist/index.js

# Verify it's running
claude mcp list

# Remove if needed
claude mcp remove limitless -s user
```

#### Claude Desktop Configuration

1. **Find your Claude Desktop config file**:

   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Open the file** (create it if it doesn't exist) and add:

```json
{
  "mcpServers": {
    "limitless": {
      "command": "node",
      "args": ["/path/to/limitless-ai-mcp-server/dist/index.js"],
      "env": {
        "LIMITLESS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

3. **Replace the placeholders**:

   - `/path/to/limitless-ai-mcp-server` → Your actual installation path (e.g., `/Users/yourname/limitless-ai-mcp-server`)
   - `your-api-key-here` → Your Limitless API key from [limitless.ai/developers](https://limitless.ai/developers)

4. **Restart Claude Desktop** for the changes to take effect

5. **Verify it's working**: Type "Show me my recent recordings" in Claude

#### Other MCP Clients

Refer to your client's documentation for MCP server configuration.

## 🛠️ Available Tools

### 1. `limitless_get_lifelog_by_id`

Retrieves a single recording by its unique ID.

**Parameters:**

- `lifelog_id` (required): The unique identifier
- `includeMarkdown`: Include markdown content (default: true)
- `includeHeadings`: Include headings (default: true)

### 2. `limitless_list_lifelogs_by_date`

Lists all recordings for a specific date.

**Parameters:**

- `date` (required): Date in YYYY-MM-DD format
- `limit`: Maximum results (max: 100)
- `direction`: Sort order ('asc' or 'desc')
- `timezone`: IANA timezone
- `includeMarkdown`: Include markdown content
- `includeHeadings`: Include headings

### 3. `limitless_list_lifelogs_by_range`

Lists recordings within a date/time range.

**Parameters:**

- `start` (required): Start date/time
- `end` (required): End date/time
- `limit`: Maximum results
- `direction`: Sort order
- `timezone`: IANA timezone
- `includeMarkdown`: Include markdown content
- `includeHeadings`: Include headings

### 4. `limitless_list_recent_lifelogs`

Lists the most recent recordings.

**Parameters:**

- `limit`: Number of recordings (default: 10, max: 100)
- `timezone`: IANA timezone
- `includeMarkdown`: Include markdown content
- `includeHeadings`: Include headings

### 5. `limitless_search_lifelogs`

Searches for keywords in recent recordings.

**Parameters:**

- `search_term` (required): Text to search for
- `fetch_limit`: How many recent logs to search (default: 20, max: 100)
- `limit`: Maximum results to return
- `includeMarkdown`: Include markdown content
- `includeHeadings`: Include headings

## 🔌 MCP Protocol Features

This server implements all five core MCP protocol features to provide multiple ways to access and analyze your Limitless data:

### 📁 Resources

Browse and access your lifelogs as structured resources. Resources provide a file-system-like interface to your recordings.

**Available URIs:**

- `lifelog://recent` - Browse recent recordings
- `lifelog://2024-01-15` - Browse recordings from a specific date
- `lifelog://2024-01-15/abc123` - Access a specific recording

**Usage in Claude:**

```
"Browse my recent recordings"
"Show me resources from January 15th"
"Open lifelog://recent"
```

### 📝 Prompts

Pre-built prompt templates for common analysis tasks. Each prompt can be customized with arguments.

**Available Prompts:**

1. **daily-summary** - Summarize all recordings from a specific day
   - Arguments: `date` (required)
2. **action-items** - Extract action items from recordings
   - Arguments: `date` or `dateRange` (optional)
3. **key-topics** - Identify main topics discussed
   - Arguments: `date` or `searchTerm` (optional)
4. **meeting-notes** - Format recordings as structured meeting notes
   - Arguments: `date` (required)
5. **search-insights** - Analyze patterns in search results
   - Arguments: `searchTerm` (required)

**Usage in Claude:**

```
"Use the daily-summary prompt for yesterday"
"Extract action items from this week"
"Show me key topics I discussed about the project"
```

### 🔍 Sampling

Enable AI-powered content analysis of your recordings. The sampling feature allows the AI to process and analyze lifelog content directly.

**Capabilities:**

- Summarize long recordings
- Extract specific information
- Identify patterns and trends
- Generate insights from multiple recordings
- Analyze sentiment and tone

**Usage in Claude:**

```
"Analyze the tone of my meetings this week"
"Summarize the key decisions from yesterday's recordings"
"Find patterns in how I discuss project timelines"
```

### 🔎 Discovery

Automatically exposes server capabilities to MCP clients. This allows Claude and other tools to understand what features are available.

**Exposed Information:**

- Server name and version
- Available tools, resources, and prompts
- Supported features and limitations
- API capabilities

### ⚡ Performance & Caching

The server includes an intelligent caching system to optimize performance:

**Cache Features:**

- LRU (Least Recently Used) eviction strategy
- Configurable TTL (Time To Live)
- Separate caches for lifelogs and search results
- Automatic cache invalidation
- Cache statistics tracking

**Configuration (via environment variables):**

- `CACHE_MAX_SIZE` - Maximum cached items (default: 100)
- `CACHE_TTL` - Cache lifetime in ms (default: 300000 / 5 minutes)
- `SEARCH_CACHE_MAX_SIZE` - Search cache size (default: 50)
- `SEARCH_CACHE_TTL` - Search cache lifetime (default: 180000 / 3 minutes)

## 💡 Usage Examples

### With Claude Desktop

Once configured, you can interact with your Limitless data naturally:

```
"Show me all my recordings from yesterday"

"Search for conversations where I discussed 'project timeline'"

"Get the recording with ID abc123 and summarize the key points"

"List my recordings from last week and identify action items"

"What did I discuss in meetings between Monday and Wednesday?"
```

### Programmatic Usage

```typescript
import { LimitlessClient } from 'limitless-ai-mcp-server';

const client = new LimitlessClient({
  apiKey: process.env.LIMITLESS_API_KEY,
  timeout: 120000,
});

// Get recent recordings
const recentLogs = await client.listRecentLifelogs({ limit: 5 });

// Search for specific content
const results = await client.searchLifelogs({
  searchTerm: 'project update',
  fetchLimit: 50,
});

// Get recordings by date
const todaysLogs = await client.listLifelogsByDate('2024-01-15', {
  includeMarkdown: true,
});
```

## 🧪 Development

### Setup Development Environment

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Format code
npm run format
```

### Project Structure

```
limitless-ai-mcp-server/
├── src/
│   ├── core/           # Core business logic
│   │   └── limitless-client.ts
│   ├── tools/          # MCP tool definitions and handlers
│   │   ├── definitions.ts
│   │   ├── handlers.ts
│   │   └── schemas.ts
│   ├── types/          # TypeScript type definitions
│   │   └── limitless.ts
│   ├── utils/          # Utility functions
│   │   ├── date.ts
│   │   ├── format.ts
│   │   ├── logger.ts
│   │   └── retry.ts
│   └── index.ts        # Main server entry point
├── tests/              # Test files
├── examples/           # Usage examples
└── dist/               # Compiled output
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure:

- All tests pass
- Code follows the existing style (run `npm run lint`)
- Add tests for new features
- Update documentation as needed

## 🐛 Troubleshooting

### Common Issues

1. **"No lifelogs found"**

   - Ensure you have recordings from your Limitless Pendant
   - Check that your API key is valid
   - Verify the date range you're querying

2. **Timeout errors**

   - Increase timeout: `export LIMITLESS_TIMEOUT=300000`
   - Reduce the number of results requested
   - Check your internet connection

3. **Authentication errors**
   - Verify your API key is correctly set
   - Ensure the key hasn't expired
   - Check API key permissions at limitless.ai/developers

### Debug Mode

Enable debug logging for more information:

```bash
export LOG_LEVEL=DEBUG
```

### Claude Desktop Specific Issues

1. **MCP server not showing up**

   - Ensure the config file is valid JSON (check with a JSON validator)
   - Verify the path to `dist/index.js` is absolute, not relative
   - Make sure you've run `npm run build` after cloning
   - Restart Claude Desktop completely

2. **"Command failed" errors**

   - Check that Node.js 22+ is installed: `node --version`
   - Verify the server works locally: `LIMITLESS_API_KEY=your-key node dist/index.js`
   - Check Claude Desktop logs: Help → Show Logs

3. **No data returned**
   - Confirm your API key is valid at [limitless.ai/developers](https://limitless.ai/developers)
   - Ensure you have Pendant recordings (not app/extension data)
   - Try a specific date when you know you had recordings

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Limitless AI](https://limitless.ai) for the amazing Pendant and API
- [Anthropic](https://anthropic.com) for the MCP protocol
- All contributors to this project

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ericbuess/limitless-ai-mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ericbuess/limitless-ai-mcp-server/discussions)
- **Author**: [Eric Buess](https://x.com/EricBuess)

---

**Note**: This project is not officially affiliated with Limitless AI. It's an independent implementation of an MCP server for the Limitless API.
