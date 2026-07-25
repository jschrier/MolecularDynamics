/// <reference lib="webworker" />
import type { EngineState, SimulationEngine, SimulationInput, SimulationSummary, WorkerEvent, WorkerRequest } from './protocol';
import { probeWebGpu, runWebGpu, type GpuResult } from './webgpu';

interface MdModule {
  cwrap(name: string, result: string | null, args: string[]): (...args: Array<number | string>) => number | string | void;
  HEAPF32: Float32Array;
  UTF8ToString(pointer: number): string;
}
type Factory = (options?: { locateFile?: (file: string) => string }) => Promise<MdModule>;
type SimulationResult = GpuResult;

let modulePromise: Promise<MdModule> | undefined;
let running = false;
let cancelRequested = false;
let webGpuAvailable = false;
let webGpuEnabled = true;
let probeComplete = false;
let probePromise: Promise<void> | undefined;
const CHUNK_STEPS = 20;

async function module(): Promise<MdModule> {
  if (!modulePromise) {
    // Resolve from this hashed worker asset so GitHub Pages project URLs work.
    const loaderUrl = new URL('../wasm/md-core.js', self.location.href).href;
    const factory = (await import(/* @vite-ignore */ loaderUrl)).default as Factory;
    modulePromise = factory({ locateFile: (file) => new URL(file, loaderUrl).href });
  }
  return modulePromise;
}

const send = (event: WorkerEvent, transfer?: Transferable[]) => postMessage(event, transfer ?? []);
const engine = (state: EngineState, reason?: string) => send({ type: 'engine', state, reason });

function probeEngine(): Promise<void> {
  if (probePromise) return probePromise;
  probeComplete = false;
  engine('checking');
  probePromise = probeWebGpu().then((result) => {
    webGpuAvailable = result.available;
    if (!webGpuAvailable) engine('unavailable', result.reason);
    else if (!webGpuEnabled) engine('forced-wasm');
    else engine('enabled');
  }).finally(() => {
    probeComplete = true;
    probePromise = undefined;
  });
  return probePromise;
}

async function runWasm(input: SimulationInput, seed: number, reportProgress = true): Promise<SimulationResult> {
  const wasm = await module();
  const init = wasm.cwrap('md_initialize', 'number', ['string', 'string', 'number', 'number', 'number']);
  const result = init(input.title, input.gas, input.temperatureKelvin, input.densityMolesPerM3, seed) as number;
  if (result === 1) throw new Error('Absolute temperature must be zero or greater.');
  if (result === 2) throw new Error('Density is too high: available volume is below 216 natural units.');
  const step = wasm.cwrap('md_step', 'number', ['number']);
  const finished = wasm.cwrap('md_is_finished', 'number', []);
  const cancel = wasm.cwrap('md_cancel', null, []);
  const progress = wasm.cwrap('md_progress', 'number', []);
  while (!(finished() as number)) {
    if (cancelRequested) { cancel(); throw new DOMException('Cancelled', 'AbortError'); }
    step(CHUNK_STEPS);
    if (reportProgress) send({ type: 'progress', completed: Math.round((progress() as number) * 1000), total: 1000 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const frameCount = wasm.cwrap('md_frame_count', 'number', [])() as number;
  const ptr = wasm.cwrap('md_frame_ptr', 'number', [])() as number;
  const frames = wasm.HEAPF32.slice(ptr / Float32Array.BYTES_PER_ELEMENT, ptr / Float32Array.BYTES_PER_ELEMENT + frameCount * 216 * 3);
  const text = (name: string) => wasm.UTF8ToString(wasm.cwrap(name, 'number', [])() as number);
  const number = (name: string) => wasm.cwrap(name, 'number', [])() as number;
  const summary: SimulationSummary = {
    totalTimeSeconds: number('md_total_time_seconds'),
    averageTemperatureKelvin: number('md_average_temperature'),
    averagePressurePascal: number('md_average_pressure'),
    pvOverNtJoulesPerMoleKelvin: number('md_pv_over_nt'),
    percentError: number('md_percent_error'),
    compressibilityFactor: number('md_compressibility_factor'),
    volumeCubicMeters: number('md_volume_cubic_meters'),
    particleCount: number('md_particle_count')
  };
  return { frames, frameCount, boxLength: number('md_box_length'), output: text('md_output_ptr'), averages: text('md_average_ptr'), transcript: text('md_console_ptr'), summary };
}

function complete(result: SimulationResult, usedEngine: SimulationEngine) {
  const frameBuffer = result.frames.buffer as ArrayBuffer;
  send({ type: 'complete', engine: usedEngine, frames: frameBuffer, frameCount: result.frameCount, boxLength: result.boxLength, output: result.output, averages: result.averages, transcript: result.transcript, summary: result.summary }, [frameBuffer]);
}

async function start(input: SimulationInput) {
  if (running) return;
  running = true; cancelRequested = false;
  try {
    // Do not let an eager Start click outrun the worker capability probe.
    if (!probeComplete) await probeEngine();
    const seed = input.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
    if (webGpuEnabled && webGpuAvailable) {
      try {
        const gpuResult = await runWebGpu(input, seed, (completed, total) => send({ type: 'progress', completed: Math.round(completed / total * 1000), total: 1000 }), () => cancelRequested);
        if (gpuResult) { complete(gpuResult, 'webgpu'); return; }
        webGpuAvailable = false;
        engine('unavailable', 'WebGPU became unavailable; restarting with WebAssembly.');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') { send({ type: 'cancelled' }); return; }
        webGpuAvailable = false;
        engine('unavailable', 'WebGPU failed; restarting with WebAssembly.');
      }
    }
    const wasmResult = await runWasm(input, seed);
    if (cancelRequested) send({ type: 'cancelled' }); else complete(wasmResult, 'wasm');
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally { running = false; }
}

async function benchmark(input: SimulationInput) {
  if (running) return;
  running = true; cancelRequested = false;
  try {
    await module();
    const probe = await probeWebGpu();
    if (!probe.available) { send({ type: 'benchmark', selected: 'wasm', reason: probe.reason }); return; }
    const seed = input.seed ?? 1;
    const gpuStarted = performance.now();
    const gpuResult = await runWebGpu(input, seed, () => {}, () => cancelRequested);
    const gpuMs = performance.now() - gpuStarted;
    if (!gpuResult) { send({ type: 'benchmark', selected: 'wasm', reason: 'WebGPU became unavailable.' }); return; }
    const wasmStarted = performance.now();
    await runWasm(input, seed, false);
    const wasmMs = performance.now() - wasmStarted;
    const speedup = wasmMs / gpuMs;
    send({ type: 'benchmark', gpuMs, wasmMs, speedup, selected: 'webgpu' });
    console.info(`LJ MD benchmark: WebGPU ${gpuMs.toFixed(0)} ms, WASM ${wasmMs.toFixed(0)} ms, ${speedup.toFixed(2)}x.`);
  } catch (error) {
    send({ type: 'benchmark', selected: 'wasm', reason: error instanceof Error ? error.message : String(error) });
  } finally { running = false; }
}

self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'start') void start(data.input);
  if (data.type === 'probe-engine') void probeEngine();
  if (data.type === 'set-engine') {
    webGpuEnabled = data.enabled;
    if (!webGpuEnabled) engine('forced-wasm');
    else void probeEngine();
  }
  if (data.type === 'benchmark') void benchmark(data.input);
  if (data.type === 'cancel' || data.type === 'reset') cancelRequested = true;
};
