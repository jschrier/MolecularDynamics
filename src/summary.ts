import type { SimulationEngine, SimulationInput, SimulationSummary } from './protocol';

export interface SimulationSummaryRecord {
  title: string;
  gas: SimulationInput['gas'];
  initialTemperatureKelvin: number;
  densityMolesPerM3: number;
  engine: SimulationEngine;
  seed?: number;
  summary: SimulationSummary;
}

export interface SummaryTableRow {
  metric: keyof SimulationSummary;
  label: string;
  unit: string;
  value: number;
  displayValue: string;
}

// The JSON keys and metric identifiers below are stable automation-facing interfaces.
// Coordinate any rename with consumers that read the rendered table or JSON payload.
const rowDefinitions: Array<Omit<SummaryTableRow, 'value' | 'displayValue'>> = [
  { metric: 'totalTimeSeconds', label: 'Total simulation time', unit: 's' },
  { metric: 'averageTemperatureKelvin', label: 'Average temperature', unit: 'K' },
  { metric: 'averagePressurePascal', label: 'Average pressure', unit: 'Pa' },
  { metric: 'pvOverNtJoulesPerMoleKelvin', label: 'PV/nT', unit: 'J/(mol K)' },
  { metric: 'percentError', label: 'Percent error of pV/nT and gas constant', unit: '%' },
  { metric: 'compressibilityFactor', label: 'Compressibility factor', unit: 'unitless' },
  { metric: 'volumeCubicMeters', label: 'Total volume', unit: 'm³' },
  { metric: 'particleCount', label: 'Particle count', unit: 'unitless' }
];

// This record is exposed in the DOM and downloaded as JSON for browser agents.
// Preserve its keys unless consumers have been given a coordinated migration path.
export function buildSummaryRecord(input: SimulationInput, engine: SimulationEngine, summary: SimulationSummary): SimulationSummaryRecord {
  return { title: input.title, gas: input.gas, initialTemperatureKelvin: input.temperatureKelvin, densityMolesPerM3: input.densityMolesPerM3, engine, ...(input.seed === undefined ? {} : { seed: input.seed }), summary };
}

function format(metric: keyof SimulationSummary, value: number): string {
  if (metric === 'totalTimeSeconds' || metric === 'volumeCubicMeters') return value.toExponential(5);
  if (metric === 'particleCount') return String(value);
  return value.toFixed(5);
}

export function summaryTableRows(summary: SimulationSummary): SummaryTableRow[] {
  return rowDefinitions.map((definition) => ({ ...definition, value: summary[definition.metric], displayValue: format(definition.metric, summary[definition.metric]) }));
}
