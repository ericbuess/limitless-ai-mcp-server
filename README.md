# Limitless AI MCP Server

An advanced Model Context Protocol (MCP) server that enables AI assistants to interact with Limitless AI Pendant recordings. This server provides a seamless bridge between your AI tools and Limitless API, allowing you to extract insights, search through recordings, and analyze your Pendant data.

## 🌟 Features

- **Full Limitless API Integration**: Access all your Pendant recordings programmatically
- **Advanced Search**: Search through your recordings with keyword matching
- **Flexible Querying**: List recordings by date, date range, or get recent recordings
- **Rich Content Access**: Retrieve markdown content, headings, and metadata
- **Robust Error Handling**: Built-in retry logic and timeout management
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Extensible Architecture**: Modular design for easy feature additions

## 📋 Requirements

- **Node.js 18+** 
- **Limitless Pendant** (Required - API only returns Pendant recordings)
- **Limitless API Key** (Get from [limitless.ai/developers](https://limitless.ai/developers))
- **MCP-compatible client** (Claude Desktop, Windsurf, Cursor, etc.)

## 🚀 Installation

### Option 1: Install from npm (Coming Soon)
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
```

### 2. Configure your MCP client

#### Claude Desktop Configuration

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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
│   ├── tools/          # MCP tool definitions and handlers
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
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

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Limitless AI](https://limitless.ai) for the amazing Pendant and API
- [Anthropic](https://anthropic.com) for the MCP protocol
- All contributors to this project

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ericbuess/limitless-ai-mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ericbuess/limitless-ai-mcp-server/discussions)
- **Email**: 

---

**Note**: This project is not officially affiliated with Limitless AI. It's an independent implementation of an MCP server for the Limitless API.