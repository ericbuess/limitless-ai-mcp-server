/**
 * Example: Using MCP Tools
 *
 * This example demonstrates how to use all 5 available MCP tools
 * to interact with your Limitless recordings.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function main() {
  // Start the MCP server
  const serverProcess = spawn('node', ['../dist/index.js'], {
    env: {
      ...process.env,
      LIMITLESS_API_KEY: process.env.LIMITLESS_API_KEY!,
    },
  });

  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['../dist/index.js'],
  });

  const client = new Client(
    {
      name: 'example-tools-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  try {
    // Tool 1: Get a specific lifelog by ID
    console.log('=== Tool 1: Get Lifelog by ID ===');
    const getByIdResult = await client.callTool({
      name: 'limitless_get_lifelog_by_id',
      arguments: {
        lifelog_id: 'your-lifelog-id-here',
        includeMarkdown: true,
        includeHeadings: true,
      },
    });
    console.log('Result:', JSON.stringify(getByIdResult, null, 2));

    // Tool 2: List lifelogs by date
    console.log('\n=== Tool 2: List Lifelogs by Date ===');
    const listByDateResult = await client.callTool({
      name: 'limitless_list_lifelogs_by_date',
      arguments: {
        date: '2024-01-15',
        limit: 5,
        direction: 'desc',
        includeMarkdown: false,
      },
    });
    console.log('Found recordings:', listByDateResult.content[0].text);

    // Tool 3: List lifelogs by date range
    console.log('\n=== Tool 3: List Lifelogs by Range ===');
    const listByRangeResult = await client.callTool({
      name: 'limitless_list_lifelogs_by_range',
      arguments: {
        start: '2024-01-10',
        end: '2024-01-15',
        limit: 10,
        direction: 'asc',
      },
    });
    console.log('Recordings in range:', listByRangeResult.content[0].text);

    // Tool 4: List recent lifelogs
    console.log('\n=== Tool 4: List Recent Lifelogs ===');
    const listRecentResult = await client.callTool({
      name: 'limitless_list_recent_lifelogs',
      arguments: {
        limit: 3,
        includeMarkdown: true,
      },
    });
    console.log('Recent recordings:', listRecentResult.content[0].text);

    // Tool 5: Search lifelogs
    console.log('\n=== Tool 5: Search Lifelogs ===');
    const searchResult = await client.callTool({
      name: 'limitless_search_lifelogs',
      arguments: {
        search_term: 'meeting',
        fetch_limit: 50,
        limit: 5,
      },
    });
    console.log('Search results:', searchResult.content[0].text);

    // Advanced: Combining tools for analysis
    console.log('\n=== Advanced: Combining Tools ===');

    // First, search for a topic
    const topicSearch = await client.callTool({
      name: 'limitless_search_lifelogs',
      arguments: {
        search_term: 'project deadline',
        fetch_limit: 20,
      },
    });

    // Then get detailed info for the first result
    // (Parse the ID from the search results in a real implementation)
    console.log('Found recordings about project deadlines');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    serverProcess.kill();
  }
}

// Run the example
main().catch(console.error);
