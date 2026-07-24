import type { SimulationInput } from './protocol';

export function validateInput(input: SimulationInput): string | undefined {
  if (!Number.isFinite(input.temperatureKelvin) || input.temperatureKelvin < 0) return 'Enter a non-negative temperature.';
  if (!Number.isFinite(input.densityMolesPerM3) || input.densityMolesPerM3 <= 0) return 'Enter a positive number density.';
  if (input.seed !== undefined && (!Number.isInteger(input.seed) || input.seed < 1 || input.seed > 0xffffffff)) return 'Seed must be an integer from 1 to 4294967295.';
  return undefined;
}

export function fileStem(title: string): string {
  return (title.trim() || 'calculation').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}
