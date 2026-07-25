export type Gas = 'He' | 'Ne' | 'Ar' | 'Kr' | 'Xe';

export interface SimulationInput {
  title: string;
  gas: Gas;
  temperatureKelvin: number;
  densityMolesPerM3: number;
  seed?: number;
}

export type SimulationEngine = 'webgpu' | 'wasm';

export interface SimulationSummary {
  totalTimeSeconds: number;
  averageTemperatureKelvin: number;
  averagePressurePascal: number;
  pvOverNtJoulesPerMoleKelvin: number;
  percentError: number;
  compressibilityFactor: number;
  volumeCubicMeters: number;
  particleCount: number;
}

export type WorkerRequest =
  | { type: 'start'; input: SimulationInput }
  | { type: 'probe-engine' }
  | { type: 'set-engine'; enabled: boolean }
  | { type: 'benchmark'; input: SimulationInput }
  | { type: 'cancel' }
  | { type: 'reset' };

export type EngineState = 'checking' | 'enabled' | 'forced-wasm' | 'unavailable';

export type WorkerEvent =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'engine'; state: EngineState; reason?: string }
  | { type: 'benchmark'; gpuMs?: number; wasmMs?: number; speedup?: number; selected: 'webgpu' | 'wasm'; reason?: string }
  | { type: 'complete'; engine: SimulationEngine; frames: ArrayBuffer; frameCount: number; boxLength: number; output: string; averages: string; transcript: string; summary: SimulationSummary }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };
