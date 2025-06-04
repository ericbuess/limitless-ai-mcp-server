import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { LanceDBStore } from '../../src/vector-store/lancedb-store.js';
import { VectorDocument } from '../../src/vector-store/vector-store.interface.js';
import * as fs from 'fs/promises';

describe('Vector Search Integration', () => {
  let vectorStore: LanceDBStore;
  const testDbPath = './test-lancedb';

  beforeAll(async () => {
    // Clean up any existing test data
    try {
      await fs.rm(testDbPath, { recursive: true });
    } catch (e) {
      // Ignore if doesn't exist
    }

    // Initialize vector store
    vectorStore = new LanceDBStore({
      collectionName: 'test-lifelogs',
      persistPath: testDbPath,
    });

    await vectorStore.initialize();
  });

  afterAll(async () => {
    // Close vector store
    await vectorStore.close();

    // Clean up test data
    try {
      await fs.rm(testDbPath, { recursive: true });
    } catch (e) {
      // Ignore
    }
  });

  test('should add documents with contextual embeddings', async () => {
    const testDocs: VectorDocument[] = [
      {
        id: 'test1',
        content: 'Happy birthday Ella! Hope you have a wonderful day.',
        metadata: {
          date: '2025-06-03',
          title: 'Birthday wishes',
          duration: 120, // 2 minutes
        },
      },
      {
        id: 'test2',
        content: 'Discussing directions to the Texas Oncology building and parking.',
        metadata: {
          date: '2025-06-03',
          title: 'Medical appointment logistics',
          duration: 600, // 10 minutes
        },
      },
      {
        id: 'test3',
        content: 'I need to take Hulk to Classic Toyota for maintenance. Scott mentioned it.',
        metadata: {
          date: '2025-06-02',
          title: 'Car maintenance reminder',
          duration: 300, // 5 minutes
        },
      },
    ];

    await vectorStore.addDocuments(testDocs);

    const stats = await vectorStore.getStats();
    expect(stats.documentCount).toBe(3);
  });

  test('should find documents using semantic search', async () => {
    // Test birthday-related search
    const birthdayResults = await vectorStore.searchByText('birthday celebration', {
      topK: 2,
      includeContent: true,
    });

    expect(birthdayResults.length).toBeGreaterThan(0);
    expect(birthdayResults[0].content).toContain('birthday');
    expect(birthdayResults[0].score).toBeGreaterThan(0.3);
  });

  test('should find car maintenance information', async () => {
    const carResults = await vectorStore.searchByText('car maintenance toyota', {
      topK: 3,
      includeContent: true,
    });

    expect(carResults.length).toBeGreaterThan(0);
    const hulkResult = carResults.find((r) => r.content?.includes('Hulk'));
    expect(hulkResult).toBeDefined();
    expect(hulkResult?.content).toContain('Classic Toyota');
  });

  test('should benefit from temporal context', async () => {
    // Search for "today" should prioritize recent documents
    const todayResults = await vectorStore.searchByText('discussions today', {
      topK: 2,
      includeContent: true,
      includeMetadata: true,
    });

    expect(todayResults.length).toBeGreaterThan(0);
    // Most recent documents should score higher due to temporal context
    expect(todayResults[0].metadata?.date).toBeDefined();
  });

  test('should handle meeting duration context', async () => {
    // Search for long meetings
    const meetingResults = await vectorStore.searchByText('long meeting discussion', {
      topK: 3,
      includeContent: true,
      includeMetadata: true,
    });

    expect(meetingResults.length).toBeGreaterThan(0);
    // Documents with longer durations should be found
    const longMeeting = meetingResults.find((r) => {
      const duration = r.metadata?.duration;
      return duration && duration >= 600; // 10+ minutes
    });
    expect(longMeeting).toBeDefined();
  });

  test('should demonstrate Contextual RAG improvements', async () => {
    // Add a document without much content but with good context
    const contextualDoc: VectorDocument = {
      id: 'test4',
      content: 'Discussed the project timeline.', // Vague content
      metadata: {
        date: new Date().toISOString(),
        title: 'Sprint Planning Meeting',
        duration: 3600, // 1 hour
        tags: ['agile', 'planning', 'development'],
      },
    };

    await vectorStore.addDocuments([contextualDoc]);

    // Search for sprint planning - should find it due to contextual enrichment
    const sprintResults = await vectorStore.searchByText('agile sprint planning meeting', {
      topK: 2,
      includeContent: true,
      includeMetadata: true,
    });

    const sprintResult = sprintResults.find((r) => r.id === 'test4');
    expect(sprintResult).toBeDefined();
    expect(sprintResult?.score).toBeGreaterThan(0.4); // Should have decent score due to context
  });
});
