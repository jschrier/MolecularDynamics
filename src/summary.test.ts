import { describe, expect, it } from 'vitest';
import type { SimulationSummary } from './protocol';
import { buildSummaryRecord, summaryTableRows } from './summary';

const input = { title: 'argon_md', gas: 'Ar' as const, temperatureKelvin: 87, densityMolesPerM3: 35000 };
const summary: SimulationSummary = {
  totalTimeSeconds: 1e-10,
  averageTemperatureKelvin: 100.02143,
  averagePressurePascal: 32640864.236,
  pvOverNtJoulesPerMoleKelvin: 9.32396,
  percentError: 12.14153,
  compressibilityFactor: 1.12142,
  volumeCubicMeters: 1.02479e-26,
  particleCount: 216
};

describe('automation summary contract', () => {
  it('creates a numeric, provenance-rich JSON record and omits an unspecified seed', () => {
    const record = buildSummaryRecord(input, 'webgpu', summary);
    expect(record).toMatchObject({ title: 'argon_md', gas: 'Ar', initialTemperatureKelvin: 87, densityMolesPerM3: 35000, engine: 'webgpu', summary });
    expect(record).not.toHaveProperty('seed');
    expect(typeof record.summary.percentError).toBe('number');
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it('includes an explicitly supplied seed and records WebAssembly runs', () => {
    expect(buildSummaryRecord({ ...input, seed: 12345 }, 'wasm', summary)).toMatchObject({ seed: 12345, engine: 'wasm' });
  });

  it('uses stable metric identifiers, numeric values, and units for the semantic table', () => {
    expect(summaryTableRows(summary)).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'averageTemperatureKelvin', value: 100.02143, unit: 'K' }),
      expect.objectContaining({ metric: 'percentError', value: 12.14153, unit: '%' }),
      expect.objectContaining({ metric: 'volumeCubicMeters', value: 1.02479e-26, unit: 'm³' })
    ]));
  });
});
