import { retry } from '../../src/utils/retry';

describe('retry', () => {
  it('should succeed on first attempt', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    
    const result = await retry(mockFn, {
      attempts: 3,
      delay: 100,
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const result = await retry(mockFn, {
      attempts: 3,
      delay: 10,
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const error = new Error('Always fails');
    const mockFn = jest.fn().mockRejectedValue(error);

    await expect(retry(mockFn, {
      attempts: 3,
      delay: 10,
    })).rejects.toThrow('Always fails');

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should respect shouldRetry function', async () => {
    const retryableError = new Error('Retry me');
    const nonRetryableError = new Error('Do not retry');
    
    const mockFn = jest.fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(nonRetryableError);

    await expect(retry(mockFn, {
      attempts: 3,
      delay: 10,
      shouldRetry: (error) => {
        return (error as Error).message === 'Retry me';
      },
    })).rejects.toThrow('Do not retry');

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should use exponential backoff', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const startTime = Date.now();
    
    await retry(mockFn, {
      attempts: 3,
      delay: 100,
      backoff: 'exponential',
    });

    const duration = Date.now() - startTime;
    // First retry after 100ms, second after 200ms = 300ms total minimum
    expect(duration).toBeGreaterThanOrEqual(300);
  });

  it('should call onRetry callback', async () => {
    const onRetry = jest.fn();
    const error1 = new Error('Fail 1');
    const error2 = new Error('Fail 2');
    
    const mockFn = jest.fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2)
      .mockResolvedValue('success');

    await retry(mockFn, {
      attempts: 3,
      delay: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(error1, 1);
    expect(onRetry).toHaveBeenCalledWith(error2, 2);
  });
});