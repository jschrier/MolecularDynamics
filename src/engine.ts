import type { EngineState } from './protocol';

export function engineLabel(state: EngineState) {
  if (state === 'enabled') return 'WebGPU enabled';
  if (state === 'forced-wasm') return 'WebGPU turned off — using WebAssembly';
  if (state === 'unavailable') return 'WebGPU unavailable — using WebAssembly';
  return 'WebGPU checking…';
}

export function canToggleEngine(state: EngineState, running: boolean) {
  return !running && (state === 'enabled' || state === 'forced-wasm');
}

export function nextEngineEnabled(state: EngineState) { return state !== 'enabled'; }
