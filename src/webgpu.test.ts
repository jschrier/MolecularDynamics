import { describe, expect, it } from 'vitest';
import { gpuInitialStateForTest } from './webgpu';

const input = { title: 'seeded', gas: 'Ar' as const, temperatureKelvin: 87, densityMolesPerM3: 35000 };

describe('WebGPU initial state', () => {
  it('uses a deterministic seedable float32 initial state', () => {
    const first = gpuInitialStateForTest(input, 12345);
    const second = gpuInitialStateForTest(input, 12345);
    const different = gpuInitialStateForTest(input, 54321);
    expect(first.gas.steps).toBe(20000);
    expect([...first.p]).toEqual([...second.p]);
    expect([...first.v]).toEqual([...second.v]);
    expect([...first.v]).not.toEqual([...different.v]);
  });

  it('retains the reference density guard', () => {
    expect(() => gpuInitialStateForTest({ ...input, densityMolesPerM3: 1e40 }, 1)).toThrow('Density is too high');
  });
});
