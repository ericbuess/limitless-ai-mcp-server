import { retry } from '../../src/utils/retry';

describe('Retry Extended Tests', () => {
  it('should throw last error after all attempts exhausted', async () => {
    let attempts = 0;
    const fn = jest.fn().mockImplementation(() => {
      attempts++;
      throw new Error(`Attempt ${attempts} failed`);
    });

    await expect(
      retry(fn, {
        attempts: 3,
        delay: 10,
        shouldRetry: () => true,
      })
    ).rejects.toThrow('Attempt 3 failed');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use linear backoff strategy', async () => {
    let attempts = 0;
    const startTimes: number[] = [];

    const fn = jest.fn().mockImplementation(() => {
      startTimes.push(Date.now());
      attempts++;
      if (attempts < 3) {
        throw new Error('Not ready');
      }
      return 'success';
    });

    const result = await retry(fn, {
      attempts: 3,
      delay: 50,
      backoff: 'linear',
      shouldRetry: () => true,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);

    // Check delays increase linearly
    if (startTimes.length >= 3) {
      const delay1 = startTimes[1] - startTimes[0];
      const delay2 = startTimes[2] - startTimes[1];

      // Should be approximately 50ms and 100ms
      expect(delay1).toBeGreaterThan(40);
      expect(delay1).toBeLessThan(70);
      expect(delay2).toBeGreaterThan(90);
      expect(delay2).toBeLessThan(120);
    }
  });
});
