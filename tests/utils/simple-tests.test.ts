// Simple tests for utilities to increase coverage

import { formatDate, parseDate, formatDateTime, isValidDateFormat, isValidDateTimeFormat } from '../../src/utils/date';
import { formatLifelogResponse } from '../../src/utils/format';
import { logger, LogLevel, Logger } from '../../src/utils/logger';
import { Lifelog } from '../../src/types/limitless';

describe('Date Utils', () => {
  describe('formatDate', () => {
    it('should format date correctly', () => {
      expect(formatDate('2024-01-15T14:30:00Z')).toBe('2024-01-15');
      expect(formatDate(new Date('2024-01-15T14:30:00Z'))).toBe('2024-01-15');
    });

    it('should throw on invalid date', () => {
      expect(() => formatDate('invalid')).toThrow('Invalid date');
    });
  });

  describe('parseDate', () => {
    it('should parse valid dates', () => {
      const date = parseDate('2024-01-15');
      expect(date).toBeInstanceOf(Date);
      expect(date.toISOString()).toContain('2024-01-15');
    });

    it('should throw on invalid date', () => {
      expect(() => parseDate('invalid')).toThrow('Invalid date string');
    });
  });

  describe('formatDateTime', () => {
    it('should format datetime as ISO string', () => {
      const result = formatDateTime('2024-01-15T14:30:00Z');
      expect(result).toBe('2024-01-15T14:30:00.000Z');
    });

    it('should throw on invalid datetime', () => {
      expect(() => formatDateTime('invalid')).toThrow('Invalid date');
    });

    it('should format datetime from Date object', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDateTime(date);
      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('isValidDateFormat', () => {
    it('should validate date format', () => {
      expect(isValidDateFormat('2024-01-15')).toBe(true);
      expect(isValidDateFormat('2024-1-15')).toBe(false);
      expect(isValidDateFormat('01-15-2024')).toBe(false);
      expect(isValidDateFormat('invalid')).toBe(false);
    });
  });

  describe('isValidDateTimeFormat', () => {
    it('should validate datetime formats', () => {
      expect(isValidDateTimeFormat('2024-01-15 14:30:00')).toBe(true);
      expect(isValidDateTimeFormat('2024-01-15T14:30:00Z')).toBe(true);
      expect(isValidDateTimeFormat('2024-01-15T14:30:00.000Z')).toBe(true);
      expect(isValidDateTimeFormat('invalid')).toBe(false);
    });
  });
});

describe('Format Utils', () => {
  const mockLifelogs: Lifelog[] = [
    {
      id: 'test-1',
      title: 'Test Meeting',
      startTime: '2024-01-15T10:00:00Z',
      endTime: '2024-01-15T11:00:00Z',
      markdown: 'Meeting content here',
      contents: [
        {
          type: 'heading1',
          content: 'Main Topic',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T10:30:00Z',
          startOffsetMs: 0,
          endOffsetMs: 1800000,
          children: [],
        },
      ],
    },
  ];

  describe('formatLifelogResponse', () => {
    it('should format empty results', () => {
      const result = formatLifelogResponse([], {});
      expect(result).toBe('No lifelogs found');
    });

    it('should format empty search results', () => {
      const result = formatLifelogResponse([], {}, 'test');
      expect(result).toBe('No lifelogs found matching "test"');
    });

    it('should format single lifelog', () => {
      const result = formatLifelogResponse(mockLifelogs, { includeMarkdown: true });
      expect(result).toContain('Found 1 lifelog:');
      expect(result).toContain('Test Meeting');
      expect(result).toContain('Meeting content here');
    });

    it('should format with headings', () => {
      const result = formatLifelogResponse(mockLifelogs, { includeHeadings: true });
      expect(result).toContain('Headings:');
      expect(result).toContain('Main Topic');
    });

    it('should format with search term', () => {
      const result = formatLifelogResponse(mockLifelogs, {}, 'meeting');
      expect(result).toContain('Found 1 lifelog matching "meeting":');
    });

    it('should handle multiple lifelogs', () => {
      const multipleLogs = [...mockLifelogs, { ...mockLifelogs[0], id: 'test-2' }];
      const result = formatLifelogResponse(multipleLogs, {});
      expect(result).toContain('Found 2 lifelogs:');
    });

    it('should format with heading2 content type', () => {
      const logsWithHeading2: Lifelog[] = [{
        id: 'test-1',
        title: 'Test',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        contents: [
          {
            type: 'heading2',
            content: 'Sub Topic',
            startTime: '2024-01-15T10:00:00Z',
            endTime: '2024-01-15T10:30:00Z',
            startOffsetMs: 0,
            endOffsetMs: 1800000,
            children: [],
          },
        ],
      }];
      const result = formatLifelogResponse(logsWithHeading2, { includeMarkdown: false });
      expect(result).toContain('## Sub Topic');
    });

    it('should format with blockquote content type', () => {
      const logsWithBlockquote: Lifelog[] = [{
        id: 'test-1',
        title: 'Test',
        startTime: '2024-01-15T10:00:00Z',
        endTime: '2024-01-15T11:00:00Z',
        contents: [
          {
            type: 'blockquote',
            content: 'Important quote',
            startTime: '2024-01-15T10:00:00Z',
            endTime: '2024-01-15T10:30:00Z',
            startOffsetMs: 0,
            endOffsetMs: 1800000,
            children: [],
          },
        ],
      }];
      const result = formatLifelogResponse(logsWithBlockquote, { includeMarkdown: false });
      expect(result).toContain('> Important quote');
    });

    it('should handle invalid date in formatDateTime', () => {
      // This tests the catch block in formatDateTime within format.ts
      const logsWithInvalidDate: Lifelog[] = [{
        id: 'test-1',
        title: 'Test',
        startTime: 'invalid-date',
        endTime: '2024-01-15T11:00:00Z',
      }];
      const result = formatLifelogResponse(logsWithInvalidDate, {});
      expect(result).toContain('Invalid Date'); // formatDateTime returns "Invalid Date" from toLocaleString
    });
  });
});

describe('Logger', () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log at INFO level by default', () => {
    logger.info('Info message');
    logger.debug('Debug message');
    
    expect(consoleInfoSpy).toHaveBeenCalled();
    expect(consoleDebugSpy).not.toHaveBeenCalled();
  });

  it('should format messages correctly', () => {
    logger.info('Test message', { data: 'value' });
    
    const output = consoleInfoSpy.mock.calls[0][0];
    expect(output).toContain('[INFO]');
    expect(output).toContain('Test message');
    expect(output).toContain('"data":"value"');
  });

  it('should handle error logging', () => {
    const error = new Error('Test error');
    logger.error('Operation failed', error);
    
    const output = consoleErrorSpy.mock.calls[0][0];
    expect(output).toContain('[ERROR]');
    expect(output).toContain('Operation failed');
    expect(output).toContain('Test error');
  });

  it('should respect LOG_LEVEL env var', () => {
    process.env.LOG_LEVEL = 'WARN';
    const warnLogger = new Logger('test', LogLevel.INFO);
    
    warnLogger.info('Info message');
    warnLogger.warn('Warn message');
    
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

});