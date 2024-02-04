import bunchoid, { getExecutionPathMeta } from '../dist';

describe('basic bunchoid functionality', () => {
  jest.useFakeTimers();

  it('should correctly schedule and execute a function', async () => {
    const mockFn = jest.fn().mockResolvedValue('test result');
    const promise = bunchoid(mockFn, { key: ['test'], wait: 100 });
    expect(mockFn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(120);
    await expect(promise).resolves.toEqual('test result');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
  
  it('should aggregate payloads over multiple calls', async () => {
    const mockFn = jest.fn().mockResolvedValue('aggregated result');
    bunchoid(mockFn, { key: ['aggregate'], wait: 100, payload: 'payload 1', includeMeta: true });
    const resultPromise = bunchoid(mockFn, { key: ['aggregate'], wait: 100, payload: 'payload 2', includeMeta: true });

    jest.advanceTimersByTime(100);

    const result = await resultPromise;

    expect(result).toEqual({
      payloads: ['payload 1', 'payload 2'],
      result: 'aggregated result',
      invokeCount: 2
    });

    expect(mockFn).toHaveBeenCalledTimes(1);

    const resultPromise2 = bunchoid(mockFn, { key: ['aggregate'], wait: 100, payload: 'payload 3', includeMeta: true });
    jest.advanceTimersByTime(100);
    const result2 = await resultPromise2;
    expect(result2).toEqual({
      payloads: ['payload 3'],
      result: 'aggregated result',
      invokeCount: 1,
    });
  });

  it('should debounce function calls', async () => {
    const mockFn = jest.fn();
    bunchoid(mockFn, { key: ['debounce'], wait: 200 });
    bunchoid(mockFn, { key: ['debounce'], wait: 200 });

    jest.advanceTimersByTime(100);
    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should respect maxWait', async () => {
    const mockFn = jest.fn();
    bunchoid(mockFn, { key: ['maxWait'], wait: 200, maxWait: 500 });
    bunchoid(mockFn, { key: ['maxWait'], wait: 200, maxWait: 500 });

    jest.advanceTimersByTime(100); // 100
    expect(mockFn).not.toHaveBeenCalled();

    bunchoid(mockFn, { key: ['maxWait'], wait: 200, maxWait: 500 });
    jest.advanceTimersByTime(100); // 200
    expect(mockFn).not.toHaveBeenCalled();

    bunchoid(mockFn, { key: ['maxWait'], wait: 200, maxWait: 500 });
    jest.advanceTimersByTime(100); // 300
    expect(mockFn).not.toHaveBeenCalled();

    bunchoid(mockFn, { key: ['maxWait'], wait: 200, maxWait: 500 });
    jest.advanceTimersByTime(100); // 400
    expect(mockFn).not.toHaveBeenCalled();

    const beforeLastCallMeta = getExecutionPathMeta(['maxWait']);
    bunchoid(mockFn, { key: ['maxWait'], wait: 200, maxWait: 500 });
    jest.advanceTimersByTime(100); // 500
    expect(mockFn).toHaveBeenCalledTimes(1);

    const afterLastCallMeta = getExecutionPathMeta(['maxWait']);
    
    expect(beforeLastCallMeta?.execution).toBeDefined();
    expect(beforeLastCallMeta?.execution?.invokeCount).toBe(5);
    expect(afterLastCallMeta?.execution).toBeUndefined();
  });
});
