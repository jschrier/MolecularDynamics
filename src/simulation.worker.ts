/// <reference lib="webworker" />
import type { WorkerEvent, WorkerRequest } from './protocol';

interface MdModule {
  cwrap(name: string, result: string | null, args: string[]): (...args: Array<number | string>) => number | string | void;
  HEAPF32: Float32Array;
  UTF8ToString(pointer: number): string;
}
type Factory = (options?: { locateFile?: (file: string) => string }) => Promise<MdModule>;

let modulePromise: Promise<MdModule> | undefined;
let running = false;
let cancelRequested = false;
const CHUNK_STEPS = 20;

async function module(): Promise<MdModule> {
  if (!modulePromise) {
    // The Emscripten loader is generated into public/wasm by build:wasm.
    const loaderUrl: string = '/wasm/md-core.js';
    const factory = (await import(/* @vite-ignore */ loaderUrl)).default as Factory;
    modulePromise = factory({ locateFile: (file) => `/wasm/${file}` });
  }
  return modulePromise;
}
const send = (event: WorkerEvent, transfer?: Transferable[]) => postMessage(event, transfer ?? []);

async function start(request: Extract<WorkerRequest, { type: 'start' }>) {
  if (running) return;
  running = true; cancelRequested = false;
  try {
    const wasm = await module();
    const init = wasm.cwrap('md_initialize', 'number', ['string', 'string', 'number', 'number', 'number']);
    const seed = request.input.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
    const result = init(request.input.title, request.input.gas, request.input.temperatureKelvin, request.input.densityMolesPerM3, seed) as number;
    if (result === 1) throw new Error('Absolute temperature must be zero or greater.');
    if (result === 2) throw new Error('Density is too high: available volume is below 216 natural units.');
    const step = wasm.cwrap('md_step', 'number', ['number']);
    const finished = wasm.cwrap('md_is_finished', 'number', []);
    const cancel = wasm.cwrap('md_cancel', null, []);
    const progress = wasm.cwrap('md_progress', 'number', []);
    while (!(finished() as number)) {
      if (cancelRequested) { cancel(); send({ type: 'cancelled' }); return; }
      step(CHUNK_STEPS);
      const fraction = progress() as number;
      send({ type: 'progress', completed: Math.round(fraction * 1000), total: 1000 });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const frameCount = wasm.cwrap('md_frame_count', 'number', [])() as number;
    const ptr = wasm.cwrap('md_frame_ptr', 'number', [])() as number;
    const positions = wasm.HEAPF32.slice(ptr / Float32Array.BYTES_PER_ELEMENT, ptr / Float32Array.BYTES_PER_ELEMENT + frameCount * 216 * 3);
    const text = (name: string) => wasm.UTF8ToString(wasm.cwrap(name, 'number', [])() as number);
    send({ type: 'complete', frames: positions.buffer, frameCount, boxLength: wasm.cwrap('md_box_length', 'number', [])() as number, output: text('md_output_ptr'), averages: text('md_average_ptr'), transcript: text('md_console_ptr') }, [positions.buffer]);
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally { running = false; }
}

self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'start') void start(data);
  if (data.type === 'cancel') cancelRequested = true;
  if (data.type === 'reset') cancelRequested = true;
};
