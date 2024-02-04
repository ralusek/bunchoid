import bunchoid, { getExecutionPathMeta } from '../dist';

describe('bunchoid memory usage', () => {
  

  it('should have increasing memory usage when adding indefinite keys', async () => {
    // jest.useFakeTimers();
    const REST = 50;
    const checkForLeak = getMemoryLeakTester({ label: 'adding indefinite keys', maxIncreasedCount: 10, restForGC: REST, increaseThreshold: 0.1 });
    let error: any;
    const ITERATIONS = 2_000_000;
    const CHECK_INTERVAL = 100_000;
    const WAIT = (ITERATIONS / CHECK_INTERVAL) * (REST + 10) * 5;
    try {
      for (let i = 0; i < ITERATIONS; i++) {
        const wait = WAIT;
        bunchoid(() => Promise.resolve('test'), { key: [i], wait, maxWait: wait});
        if ((i > 10_000) && ((i % CHECK_INTERVAL) === 0)) {
          expect(getExecutionPathMeta([])!.childrenCount).toEqual(i + 1);
          await (async () => {
            const promise = checkForLeak(); // will wait 50ms
            // jest.advanceTimersByTime(60); // Because we're creating so many bunchoids, this is actually very very slow and is faster to just wait the actual time
            return promise;
          })();
        }
      }
    }
    catch(err) {
      error = err;
    }
    
    expect(error.message).toMatch(/Memory Leak "adding indefinite keys" detected/);

    // Let last bunchoid timeouts run
    await awaitTimeout(WAIT * 1.1)
    expect(getExecutionPathMeta([])!.childrenCount).toEqual(0);

    // advance timers to release all the promises
    // jest.advanceTimersByTime(1000 * ITERATIONS * 2);
    // jest.useRealTimers();
  }, 1000 * 60 * 5);

  it('should have stable memory usage when adding and removing keys one level deep', async () => {

    const checkForLeak = getMemoryLeakTester({ label: 'adding and removing keys', maxIncreasedCount: 50, restForGC: 10, increaseThreshold: 0.1 });
    let gotTo = 0;
    let error: any;
    try {
      for (let j = 0; j < 1000; j++) {
        gotTo = j;
        for (let i = 0; i < 10_000; i++) {
          bunchoid(() => Promise.resolve('test'), { key: [i], wait: 5, maxWait: 5 });
        }
        await checkForLeak(); // will wait 10ms
      }
    }
    catch(err) {
      console.log('Errored at', gotTo);
      error = err;
    }
    
    expect(getExecutionPathMeta([])!.childrenCount).toEqual(0);
    expect(error).toBeUndefined();
  }, 1000 * 60 * 5);

  it('should have stable memory usage when adding and removing keys two levels deep', async () => {
    const checkForLeak = getMemoryLeakTester({ label: 'adding and removing keys', maxIncreasedCount: 50, restForGC: 10, increaseThreshold: 0.1 });
    let gotTo = 0;
    let error: any;
    try {
      for (let j = 0; j < 100; j++) {
        gotTo = j;
        for (let i = 0; i < 100; i++) {
          for (let k = 0; k < 100; k++) {
            bunchoid(() => Promise.resolve('test'), { key: [i, k], wait: 5, maxWait: 5 });
          }
        }
        await checkForLeak(); // will wait 10ms
      }
    }
    catch(err) {
      console.log('Errored at', gotTo);
      error = err;
    }
    
    expect(getExecutionPathMeta([])!.childrenCount).toEqual(0);
    expect(error).toBeUndefined();
  }, 1000 * 60 * 5);
});

function awaitTimeout(timeout: number) {
  return new Promise((resolve) => setTimeout(() => resolve(null), timeout));
}

type Config = {
  label: string;
  maxIncreasedCount?: number;
  restForGC?: number;
  // The percentage over the initial memory usage that is considered a leak
  increaseThreshold?: number;
};

function getMemoryLeakTester({
  label,
  // Number of times the memory usage can increase by the threshold before we should
  // consider it a leak
  maxIncreasedCount = 10,
  restForGC = 100,
  increaseThreshold = 0.1,
}: Config) {
  // Starting memory usage that will be used as a baseline
  const starting = getMemoryUsage();
  // The amount of memory usage over which an increment is counted over the previous threshold.
  // For example, if our starting usage is 10, the increaseThreshold is 0.1, then the increaseThresholdValue
  // is 1. This means that at 11, we will have counted 1 increase, if we encounter a value at 11.5, nothing happens
  // at 12, we have counted 2 increases, and so on.
  const increaseThresholdValue = starting * increaseThreshold;
  // The maximum memory usage we have encountered so far
  let max = starting;
  // The last memory usage checkpoint at which we incremented our count
  let lastThresholdBreach = starting;
  const startTime = Date.now();
  let increasedCount = 0;
  
  return async function checkForLeak() {
    await awaitTimeout(restForGC);

    const used = getMemoryUsage();
    console.log('Memory usage', used, starting, increaseThresholdValue, lastThresholdBreach, increasedCount);
    if (used > max) {
      max = used;
      const diff = used - lastThresholdBreach;
      const surpassedThreshold = diff > increaseThresholdValue;
      if (surpassedThreshold) {
        lastThresholdBreach = used;
        if (++increasedCount > maxIncreasedCount) throw new Error(`Memory Leak "${label}" detected, with a total increase of ${used - starting} over ${(Date.now() - startTime) / 1000} seconds.`);
      }
    }
  };
}

// Get memory usage in MB
function getMemoryUsage() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}
