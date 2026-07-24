export type Gas = 'He' | 'Ne' | 'Ar' | 'Kr' | 'Xe';

export interface SimulationInput {
  title: string;
  gas: Gas;
  temperatureKelvin: number;
  densityMolesPerM3: number;
  seed?: number;
}

export type WorkerRequest =
  | { type: 'start'; input: SimulationInput }
  | { type: 'cancel' }
  | { type: 'reset' };

export type WorkerEvent =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'complete'; frames: ArrayBuffer; frameCount: number; boxLength: number; output: string; averages: string; transcript: string }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };
