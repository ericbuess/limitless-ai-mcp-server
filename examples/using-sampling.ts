/**
 * Example: Using MCP Sampling
 *
 * This example shows how to use the sampling feature for AI-powered
 * content analysis of your Limitless recordings.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['../dist/index.js'],
  });

  const client = new Client(
    {
      name: 'example-sampling-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  try {
    // Example 1: Summarize Recent Recordings
    console.log('=== Example 1: Summarize Recent Recordings ===');
    const summaryResult = await client.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Please summarize my recent recordings',
          },
        },
      ],
      modelPreferences: {
        hints: [
          {
            name: 'summary-generator',
          },
        ],
      },
      maxTokens: 500,
    });
    console.log('Summary:', summaryResult.content);

    // Example 2: Extract Action Items
    console.log('\n\n=== Example 2: Extract Action Items ===');
    const actionResult = await client.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Extract all action items from my recordings this week',
          },
        },
      ],
      modelPreferences: {
        hints: [
          {
            name: 'action-extractor',
          },
        ],
      },
      maxTokens: 500,
    });
    console.log('Action Items:', actionResult.content);

    // Example 3: Analyze Sentiment
    console.log('\n\n=== Example 3: Sentiment Analysis ===');
    const sentimentResult = await client.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Analyze the overall sentiment and tone of my meetings today',
          },
        },
      ],
      modelPreferences: {
        hints: [
          {
            name: 'sentiment-analyzer',
          },
        ],
      },
      maxTokens: 300,
    });
    console.log('Sentiment Analysis:', sentimentResult.content);

    // Example 4: Topic Identification
    console.log('\n\n=== Example 4: Topic Analysis ===');
    const topicResult = await client.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'What were the main topics discussed in my recordings about the product launch?',
          },
        },
      ],
      modelPreferences: {
        hints: [
          {
            name: 'topic-identifier',
          },
        ],
      },
      maxTokens: 400,
    });
    console.log('Main Topics:', topicResult.content);

    // Example 5: Decision Extraction
    console.log('\n\n=== Example 5: Decision Tracking ===');
    const decisionResult = await client.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'List all decisions made in meetings this week with their context',
          },
        },
      ],
      modelPreferences: {
        hints: [
          {
            name: 'decision-tracker',
          },
        ],
      },
      maxTokens: 600,
    });
    console.log('Decisions Made:', decisionResult.content);

    // Advanced: Multi-turn Analysis
    console.log('\n\n=== Advanced: Conversational Analysis ===');

    // First message: Get overview
    const overviewResult = await client.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Give me an overview of my meetings this week',
          },
        },
      ],
      maxTokens: 300,
    });
    console.log('Overview:', overviewResult.content);

    // Follow-up: Drill down into specific aspect
    const followUpResult = await client.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Give me an overview of my meetings this week',
          },
        },
        {
          role: 'assistant',
          content: overviewResult.content,
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Which meeting had the most critical discussions?',
          },
        },
      ],
      maxTokens: 400,
    });
    console.log('\nFollow-up Analysis:', followUpResult.content);

    // Example 6: Pattern Recognition
    console.log('\n\n=== Example 6: Pattern Recognition ===');
    const patternResult = await client.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Identify any recurring themes or patterns in how I discuss project timelines',
          },
        },
      ],
      modelPreferences: {
        hints: [
          {
            name: 'pattern-analyzer',
          },
        ],
      },
      maxTokens: 500,
    });
    console.log('Patterns Found:', patternResult.content);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

// Run the example
main().catch(console.error);
