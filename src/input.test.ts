import { describe, expect, it } from 'vitest';
import { fileStem, validateInput } from './input';

const base = { title: 'argon_md', gas: 'Ar' as const, temperatureKelvin: 87, densityMolesPerM3: 35000 };
describe('simulation input', () => {
  it('accepts the reference-style inputs and an optional deterministic seed', () => expect(validateInput({ ...base, seed: 42 })).toBeUndefined());
  it('rejects nonphysical temperature, density, and out-of-range seeds', () => {
    expect(validateInput({ ...base, temperatureKelvin: -1 })).toMatch(/temperature/);
    expect(validateInput({ ...base, densityMolesPerM3: 0 })).toMatch(/density/);
    expect(validateInput({ ...base, seed: 1.5 })).toMatch(/Seed/);
  });
  it('makes browser-safe output file stems', () => expect(fileStem(' Ar run / 87 K ')).toBe('Ar_run_87_K'));
});
