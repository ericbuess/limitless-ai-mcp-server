/**
 * Example: Using MCP Prompts
 * 
 * This example demonstrates how to use pre-built prompt templates
 * for common Limitless data analysis tasks.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['../dist/index.js'],
  });
  
  const client = new Client({
    name: 'example-prompts-client',
    version: '1.0.0',
  }, {
    capabilities: {}
  });

  await client.connect(transport);

  try {
    // List all available prompts
    console.log('=== Available Prompts ===');
    const prompts = await client.listPrompts();
    prompts.prompts.forEach(prompt => {
      console.log(`\n${prompt.name}:`);
      console.log(`  ${prompt.description}`);
      if (prompt.arguments) {
        console.log('  Arguments:');
        prompt.arguments.forEach(arg => {
          console.log(`    - ${arg.name} (${arg.required ? 'required' : 'optional'}): ${arg.description}`);
        });
      }
    });

    // Example 1: Daily Summary
    console.log('\n\n=== Example 1: Daily Summary ===');
    const dailySummary = await client.getPrompt({
      name: 'daily-summary',
      arguments: {
        date: '2024-01-15'
      }
    });
    console.log('Prompt generated:');
    console.log(dailySummary.messages[0].content);

    // Example 2: Extract Action Items
    console.log('\n\n=== Example 2: Action Items ===');
    const actionItems = await client.getPrompt({
      name: 'action-items',
      arguments: {
        dateRange: '2024-01-10 to 2024-01-15'
      }
    });
    console.log('Prompt generated:');
    console.log(actionItems.messages[0].content);

    // Example 3: Key Topics Analysis
    console.log('\n\n=== Example 3: Key Topics ===');
    const keyTopics = await client.getPrompt({
      name: 'key-topics',
      arguments: {
        searchTerm: 'project planning'
      }
    });
    console.log('Prompt generated:');
    console.log(keyTopics.messages[0].content);

    // Example 4: Meeting Notes Format
    console.log('\n\n=== Example 4: Meeting Notes ===');
    const meetingNotes = await client.getPrompt({
      name: 'meeting-notes',
      arguments: {
        date: '2024-01-15'
      }
    });
    console.log('Prompt generated:');
    console.log(meetingNotes.messages[0].content);

    // Example 5: Search Insights
    console.log('\n\n=== Example 5: Search Insights ===');
    const searchInsights = await client.getPrompt({
      name: 'search-insights',
      arguments: {
        searchTerm: 'deadline'
      }
    });
    console.log('Prompt generated:');
    console.log(searchInsights.messages[0].content);

    // Advanced: Combine prompts for comprehensive analysis
    console.log('\n\n=== Advanced: Weekly Review ===');
    
    // Get daily summaries for each day of the week
    const weekDays = ['2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12'];
    console.log('Generating daily summaries for the week...');
    
    for (const day of weekDays) {
      const summary = await client.getPrompt({
        name: 'daily-summary',
        arguments: { date: day }
      });
      console.log(`\n${day}:`);
      console.log(summary.messages[0].content.substring(0, 200) + '...');
    }

    // Then get action items for the whole week
    const weeklyActions = await client.getPrompt({
      name: 'action-items',
      arguments: {
        dateRange: '2024-01-08 to 2024-01-12'
      }
    });
    console.log('\n\nWeekly Action Items:');
    console.log(weeklyActions.messages[0].content);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

// Run the example
main().catch(console.error);