import { describe, expect, it } from 'vitest';
import { RemainingTimeEstimator } from './eta';

describe('RemainingTimeEstimator', () => {
  it('waits for 1% before estimating', () => {
    const eta = new RemainingTimeEstimator(); eta.start(0);
    expect(eta.update(9, 1000, 900)).toBeUndefined();
    expect(eta.update(10, 1000, 1000)).toBe(99);
  });
  it('rounds ETA to whole seconds and publishes only once per second', () => {
    const eta = new RemainingTimeEstimator(); eta.start(0);
    expect(eta.update(10, 1000, 1010)).toBe(100);
    expect(eta.update(20, 1000, 1500)).toBeUndefined();
    expect(eta.update(20, 1000, 2010)).toBe(99);
  });
  it('clears the run estimate on reset', () => {
    const eta = new RemainingTimeEstimator(); eta.start(0); eta.update(10, 1000, 1000);
    eta.reset(); expect(eta.update(20, 1000, 2000)).toBeUndefined();
  });
});
