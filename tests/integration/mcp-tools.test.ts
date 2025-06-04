import { spawn, ChildProcess } from 'child_process';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

describe('MCP Tools Integration', () => {
  let serverProcess: ChildProcess;
  let serverReady: Promise<void>;

  const sendRequest = (request: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, 5000);

      const handler = (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', handler);
                resolve(response);
              }
            } catch (e) {
              // Ignore non-JSON output
            }
          }
        }
      };

      serverProcess.stdout?.on('data', handler);
      serverProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  };

  beforeAll(async () => {
    // Start the MCP server
    serverProcess = spawn('node', ['dist/index.js'], {
      env: { ...process.env },
      stdio: 'pipe',
    });

    // Give server time to start up
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 15000); // Increase timeout to 15 seconds

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  test('should initialize successfully', async () => {
    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    expect(response.result).toBeDefined();
    expect(response.result.protocolVersion).toBe('2024-11-05');
  });

  test('should list all 9 MCP tools', async () => {
    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(response.result).toBeDefined();
    expect(response.result.tools).toHaveLength(9);

    // Check for original tools
    const originalTools = [
      'limitless_get_lifelog_by_id',
      'limitless_list_lifelogs_by_date',
      'limitless_list_lifelogs_by_range',
      'limitless_list_recent_lifelogs',
      'limitless_search_lifelogs',
    ];

    originalTools.forEach((toolName) => {
      expect(response.result.tools.some((tool: any) => tool.name === toolName)).toBe(true);
    });

    // Check for Phase 2 tools
    const phase2Tools = [
      'limitless_advanced_search',
      'limitless_semantic_search',
      'limitless_analyze_lifelogs',
      'limitless_sync_status',
    ];

    phase2Tools.forEach((toolName) => {
      expect(response.result.tools.some((tool: any) => tool.name === toolName)).toBe(true);
    });
  });

  test('should have proper tool schemas', async () => {
    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {},
    });

    const semanticSearchTool = response.result.tools.find(
      (tool: any) => tool.name === 'limitless_semantic_search'
    );

    expect(semanticSearchTool).toBeDefined();
    expect(semanticSearchTool.inputSchema).toBeDefined();
    expect(semanticSearchTool.inputSchema.properties.query).toBeDefined();
    expect(semanticSearchTool.inputSchema.properties.limit).toBeDefined();
    expect(semanticSearchTool.inputSchema.properties.threshold).toBeDefined();
  });
});
