/**
 * Example: Using MCP Resources
 * 
 * This example shows how to browse and access Limitless recordings
 * using the MCP Resources feature, which provides a file-system-like
 * interface to your data.
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
    name: 'example-resources-client',
    version: '1.0.0',
  }, {
    capabilities: {}
  });

  await client.connect(transport);

  try {
    // List all available resources
    console.log('=== Listing All Resources ===');
    const allResources = await client.listResources();
    console.log('Available resources:');
    allResources.resources.forEach(resource => {
      console.log(`- ${resource.uri}: ${resource.name}`);
      if (resource.description) {
        console.log(`  ${resource.description}`);
      }
    });

    // Browse recent recordings
    console.log('\n=== Browse Recent Recordings ===');
    const recentResource = await client.readResource({
      uri: 'lifelog://recent'
    });
    console.log('Recent recordings:', recentResource.contents[0].text);

    // Browse recordings from a specific date
    console.log('\n=== Browse by Date ===');
    const dateResource = await client.readResource({
      uri: 'lifelog://2024-01-15'
    });
    console.log('Recordings from 2024-01-15:', dateResource.contents[0].text);

    // Access a specific recording
    console.log('\n=== Access Specific Recording ===');
    // First, get the list to find an ID
    const listForId = await client.readResource({
      uri: 'lifelog://recent'
    });
    
    // In a real app, you would parse the ID from the list
    // For this example, we'll use a placeholder
    const specificResource = await client.readResource({
      uri: 'lifelog://2024-01-15/specific-id-here'
    });
    console.log('Specific recording content:', specificResource.contents[0].text);

    // Using resource templates
    console.log('\n=== Resource Templates ===');
    const templates = await client.listResourceTemplates();
    console.log('Available templates:');
    templates.resourceTemplates?.forEach(template => {
      console.log(`- ${template.uriTemplate}: ${template.name}`);
      console.log(`  ${template.description}`);
    });

    // Advanced: Navigate through dates
    console.log('\n=== Navigate Through Dates ===');
    const dates = ['2024-01-13', '2024-01-14', '2024-01-15'];
    
    for (const date of dates) {
      console.log(`\nChecking ${date}:`);
      try {
        const dayResource = await client.readResource({
          uri: `lifelog://${date}`
        });
        const content = JSON.parse(dayResource.contents[0].text || '[]');
        console.log(`  Found ${content.length} recordings`);
      } catch (error) {
        console.log(`  No recordings found`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

// Run the example
main().catch(console.error);