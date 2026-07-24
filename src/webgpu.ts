import type { Gas, SimulationInput } from './protocol';

const N = 216;
const NA = 6.022140857e23;
const kBSI = 1.38064852e-23;
const BATCH = 256;
const GPU_BUFFER_USAGE = { MAP_READ: 0x0001, COPY_SRC: 0x0004, COPY_DST: 0x0008, UNIFORM: 0x0040, STORAGE: 0x0080 };

type GasConstants = { volume: number; pressure: number; temperature: number; time: number; steps: number };
const gases: Record<Gas, GasConstants> = {
  He: { volume: 1.8399744000000005e-29, pressure: 8152287.336171632, temperature: 10.864459551225972, time: 1.7572698825166272e-12, steps: 50000 },
  Ne: { volume: 2.0570823999999997e-29, pressure: 27223022.27659913, temperature: 40.560648991243625, time: 2.1192341945685407e-12, steps: 20000 },
  Ar: { volume: 3.7949992920124995e-29, pressure: 51695201.06691862, temperature: 142.095, time: 2.09618e-12, steps: 20000 },
  Kr: { volume: 4.5882712000000004e-29, pressure: 59935428.40275003, temperature: 199.1817584391428, time: 8.051563913585078e-13, steps: 20000 },
  Xe: { volume: 5.4872e-29, pressure: 70527773.72794868, temperature: 280.30305642163006, time: 9.018957925790732e-13, steps: 20000 }
};

export type GpuResult = { frames: Float32Array; frameCount: number; boxLength: number; output: string; averages: string; transcript: string };
type Gpu = { requestAdapter(): Promise<any> };

export async function probeWebGpu(): Promise<{ available: boolean; reason?: string }> {
  const gpu = (self.navigator as Navigator & { gpu?: Gpu }).gpu;
  if (!gpu) return { available: false, reason: 'WebGPU is not supported by this browser.' };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { available: false, reason: 'No WebGPU adapter is available.' };
    const device = await adapter.requestDevice();
    device.destroy?.();
    return { available: true };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// A single 256-thread workgroup is intentional: the reference program always uses 216 particles.
const shader = /* wgsl */`
struct Params { dt: f32, box: f32, frames: u32, offset: u32 }
@group(0) @binding(0) var<storage, read_write> pos: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> vel: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> trajectory: array<f32>;
@group(0) @binding(3) var<storage, read_write> metrics: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;
var<workgroup> p: array<vec4<f32>, 216>;
var<workgroup> v: array<vec4<f32>, 216>;
var<workgroup> nextP: array<vec4<f32>, 216>;
var<workgroup> halfV: array<vec4<f32>, 216>;

fn force(i: u32) -> vec3<f32> {
  var a = vec3<f32>(0.0);
  for (var j = 0u; j < 216u; j++) {
    if (j != i) {
      let rij = p[i].xyz - p[j].xyz;
      let r2 = dot(rij, rij);
      let f = 24.0 * (2.0 * pow(r2, -7.0) - pow(r2, -4.0));
      a += rij * f;
    }
  }
  return a;
}
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) local: vec3<u32>) {
  let i = local.x;
  if (i < 216u) { p[i] = pos[i]; v[i] = vel[i]; }
  workgroupBarrier();
  for (var frame = 0u; frame < params.frames; frame++) {
    if (i < 216u) {
      let a = force(i);
      nextP[i] = vec4<f32>(p[i].xyz + v[i].xyz * params.dt + 0.5 * a * params.dt * params.dt, 0.0);
      halfV[i] = vec4<f32>(v[i].xyz + 0.5 * a * params.dt, 0.0);
    }
    workgroupBarrier();
    if (i < 216u) { p[i] = nextP[i]; v[i] = halfV[i]; }
    workgroupBarrier();
    if (i < 216u) {
      let a = force(i);
      var newV = v[i].xyz + 0.5 * a * params.dt;
      var impulse = 0.0;
      for (var k = 0u; k < 3u; k++) {
        if (p[i][k] < 0.0 || p[i][k] >= params.box) { newV[k] = -newV[k]; impulse += 2.0 * abs(newV[k]) / params.dt; }
      }
      v[i] = vec4<f32>(newV, 0.0);
      var potential = 0.0;
      for (var j = 0u; j < 216u; j++) {
        if (j != i) { let q = inverseSqrt(dot(p[i].xyz - p[j].xyz, p[i].xyz - p[j].xyz)); potential += 4.0 * (pow(q, 12.0) - pow(q, 6.0)); }
      }
      let base = (frame * 216u + i) * 3u;
      trajectory[base] = p[i].x; trajectory[base + 1u] = p[i].y; trajectory[base + 2u] = p[i].z;
      let metric = (frame * 216u + i) * 4u;
      metrics[metric] = dot(newV, newV); metrics[metric + 1u] = 0.5 * dot(newV, newV); metrics[metric + 2u] = potential; metrics[metric + 3u] = impulse;
    }
    workgroupBarrier();
  }
  if (i < 216u) { pos[i] = p[i]; vel[i] = v[i]; }
}`;

export function gpuInitialStateForTest(input: SimulationInput, seed: number) {
  const gas = gases[input.gas]; const volume = N / (input.densityMolesPerM3 * NA) / gas.volume;
  if (input.temperatureKelvin < 0 || input.densityMolesPerM3 <= 0) throw new Error('Absolute temperature must be zero or greater.');
  if (volume < N) throw new Error('Density is too high: available volume is below 216 natural units.');
  const box = Math.cbrt(volume), n = Math.ceil(Math.cbrt(N)), spacing = box / n, p = new Float32Array(N * 4), v = new Float32Array(N * 4);
  let index = 0; for (let x=0;x<n;x++) for (let y=0;y<n;y++) for (let z=0;z<n;z++,index++) if(index<N) { p[index*4]=(x+.5)*spacing; p[index*4+1]=(y+.5)*spacing; p[index*4+2]=(z+.5)*spacing; }
  let state = seed || 1, spare: number | undefined;
  const random = () => { state^=state<<13; state^=state>>>17; state^=state<<5; return (state>>>0)/4294967296; };
  const gaussian = () => { if(spare !== undefined) { const out=spare; spare=undefined; return out; } let a=0,b=0,q=0; do {a=2*random()-1;b=2*random()-1;q=a*a+b*b;} while(q>=1||q===0); const f=Math.sqrt(-2*Math.log(q)/q); spare=a*f; return b*f; };
  const cm=[0,0,0]; for(let i=0;i<N;i++) for(let k=0;k<3;k++) { const value=gaussian(); v[i*4+k]=value; cm[k]+=value; }
  let sum=0; for(let i=0;i<N;i++) for(let k=0;k<3;k++) { v[i*4+k]-=cm[k]/N; sum+=v[i*4+k]**2; }
  const scale=Math.sqrt(3*(N-1)*(input.temperatureKelvin/gas.temperature)/sum); for(let i=0;i<N*4;i++) v[i]*=scale;
  return { gas, volume, box, dt: (input.gas==='He' ? .2e-14 : .5e-14)/gas.time, p, v };
}

const fmt = (value: number, digits: number) => value.toFixed(digits);
const exp = (value: number, digits: number) => value.toExponential(digits);

export async function runWebGpu(input: SimulationInput, seed: number, progress: (completed: number, total: number) => void, cancelled: () => boolean): Promise<GpuResult | undefined> {
  const gpu = (self.navigator as Navigator & { gpu?: Gpu }).gpu;
  if (!gpu) return undefined;
  const adapter = await gpu.requestAdapter(); if (!adapter) return undefined;
  const device = await adapter.requestDevice(); let lost = false; void device.lost.then(() => { lost=true; });
  const setup = gpuInitialStateForTest(input, seed), total = setup.gas.steps + 1, frames = new Float32Array(total*N*3);
  const create = (size: number, usage: number) => device.createBuffer({ size, usage });
  const pos = create(setup.p.byteLength, GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST);
  const vel = create(setup.v.byteLength, GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST);
  const uniform = create(16, GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST);
  device.queue.writeBuffer(pos,0,setup.p); device.queue.writeBuffer(vel,0,setup.v);
  const module = device.createShaderModule({ code: shader }); const pipeline = device.createComputePipeline({ layout:'auto', compute:{module,entryPoint:'main'} });
  const rows: string[] = ['  time (s)              T(t) (K)              P(t) (Pa)           Kinetic En. (n.u.)     Potential En. (n.u.) Total En. (n.u.)'];
  let pAverage=0,tAverage=0, step=0;
  while(step<total) {
    if(cancelled()) throw new DOMException('Cancelled','AbortError'); if(lost) throw new Error('WebGPU device was lost.');
    const count=Math.min(BATCH,total-step), trajectoryBytes=count*N*3*4, metricBytes=count*N*4*4;
    const trajectory=create(trajectoryBytes,GPU_BUFFER_USAGE.STORAGE|GPU_BUFFER_USAGE.COPY_SRC), metrics=create(metricBytes,GPU_BUFFER_USAGE.STORAGE|GPU_BUFFER_USAGE.COPY_SRC);
    const readTrajectory=create(trajectoryBytes,GPU_BUFFER_USAGE.MAP_READ|GPU_BUFFER_USAGE.COPY_DST), readMetrics=create(metricBytes,GPU_BUFFER_USAGE.MAP_READ|GPU_BUFFER_USAGE.COPY_DST);
    const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:pos}},{binding:1,resource:{buffer:vel}},{binding:2,resource:{buffer:trajectory}},{binding:3,resource:{buffer:metrics}},{binding:4,resource:{buffer:uniform}}]});
    const params=new ArrayBuffer(16), view=new DataView(params); view.setFloat32(0,setup.dt,true); view.setFloat32(4,setup.box,true); view.setUint32(8,count,true); view.setUint32(12,step,true); device.queue.writeBuffer(uniform,0,params);
    const encoder=device.createCommandEncoder(); const pass=encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0,bind); pass.dispatchWorkgroups(1); pass.end(); encoder.copyBufferToBuffer(trajectory,0,readTrajectory,0,trajectoryBytes); encoder.copyBufferToBuffer(metrics,0,readMetrics,0,metricBytes); device.queue.submit([encoder.finish()]);
    await Promise.all([readTrajectory.mapAsync(GPU_BUFFER_USAGE.MAP_READ),readMetrics.mapAsync(GPU_BUFFER_USAGE.MAP_READ)]);
    frames.set(new Float32Array(readTrajectory.getMappedRange().slice(0)),step*N*3); const values=new Float32Array(readMetrics.getMappedRange().slice(0)); readTrajectory.unmap(); readMetrics.unmap(); trajectory.destroy(); metrics.destroy(); readTrajectory.destroy(); readMetrics.destroy();
    for(let frame=0;frame<count;frame++,step++) { let v2=0,ke=0,pe=0,impulse=0; for(let i=0;i<N;i++) { const m=(frame*N+i)*4; v2+=values[m];ke+=values[m+1];pe+=values[m+2];impulse+=values[m+3]; } const temperature=v2/N/3*setup.gas.temperature, pressure=impulse/(6*setup.box*setup.box)*setup.gas.pressure; pAverage+=pressure;tAverage+=temperature; rows.push(`  ${exp(step*setup.dt*setup.gas.time,4).padStart(8)}  ${fmt(temperature,8).padStart(20)}  ${fmt(pressure,8).padStart(20)} ${fmt(ke,8).padStart(20)}  ${fmt(pe,8).padStart(20)}  ${fmt(ke+pe,8).padStart(20)} `); }
    progress(step,total); await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  pos.destroy();vel.destroy();uniform.destroy(); const ta=tAverage/setup.gas.steps, pa=pAverage/setup.gas.steps, gc=NA*pa*(setup.volume*setup.gas.volume)/(N*ta), z=pa*(setup.volume*setup.gas.volume)/(N*kBSI*ta);
  const averages=`  Total Time (s)      T (K)               P (Pa)      PV/nT (J/(mol K))         Z           V (m^3)              N\n --------------   -----------        ---------------   --------------   ---------------   ------------   -----------\n  ${exp(total*setup.dt*setup.gas.time,4)}  ${fmt(ta,5).padStart(15)}       ${fmt(pa,5).padStart(15)}     ${fmt(gc,5).padStart(10)}       ${fmt(z,5).padStart(10)}        ${exp(setup.volume*setup.gas.volume,5)}         ${N}\n`;
  const transcript=`\n                     YOU ARE SIMULATING ${input.gas} GAS! \n\n  AVERAGE TEMPERATURE (K):                 ${fmt(ta,5)}\n  AVERAGE PRESSURE  (Pa):                  ${fmt(pa,5)}\n  PV/nT (J * mol^-1 K^-1):                 ${fmt(gc,5)}\n  PERCENT ERROR of pV/nT AND GAS CONSTANT: ${fmt(100*Math.abs(gc-8.3144598)/8.3144598,5)}\n  THE COMPRESSIBILITY (unitless):          ${fmt(z,5)}\n  TOTAL VOLUME (m^3):                      ${exp(setup.volume*setup.gas.volume,5)}\n  NUMBER OF PARTICLES (unitless):          ${N}\n`;
  return { frames, frameCount:total, boxLength:setup.box, output:rows.join('\n')+'\n', averages, transcript };
}
