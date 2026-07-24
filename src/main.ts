import './style.css';
import type { SimulationInput, WorkerEvent } from './protocol';
import { TrajectoryRenderer } from './renderer';
import { fileStem, validateInput } from './input';
import { RemainingTimeEstimator } from './eta';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header><h1>Lennard-Jones molecular dynamics</h1></header>
  <main><section class="panel controls"><h2>Simulation setup</h2><form id="setup">
    <label>Calculation title<input name="title" value="argon_md" required maxlength="80" /></label>
    <label>Noble gas<select name="gas"><option>He</option><option>Ne</option><option selected>Ar</option><option>Kr</option><option>Xe</option></select></label>
    <label>Initial temperature (K)<input name="temperature" type="number" min="0" step="any" value="87" required /></label>
    <label>Number density (mol/m³)<input name="density" type="number" min="0.000001" step="any" value="35000" required /></label>
    <details><summary>Reproducibility</summary><label>Optional random seed<input name="seed" type="number" min="1" max="4294967295" step="1" placeholder="random" /></label></details>
    <div class="actions"><button id="start" type="submit">Start simulation</button><button id="cancel" type="button" disabled>Cancel</button><button id="reset" type="button">Reset</button></div>
  </form><p id="status" role="status">Ready. The reference model uses 216 particles.</p><progress id="progress" max="1000" value="0"></progress></section>
  <section class="panel visualization"><div class="view-head"><h2>Trajectory</h2><span id="frame-label">Run a simulation to view particles.</span></div><div id="viewer" aria-label="3D molecular trajectory"></div>
  <div class="playback"><button id="previous" disabled>‹ Step</button><button id="play" disabled>Play</button><button id="next" disabled>Step ›</button><label>Speed <select id="speed" disabled><option value="30">Slow</option><option value="90" selected>Normal</option><option value="270">Fast</option></select></label></div><input id="scrubber" type="range" min="0" max="0" value="0" disabled aria-label="Trajectory frame" /></section>
  <section class="panel output"><div class="view-head"><h2>Textual output</h2><button id="download-average" disabled>Download average.txt</button></div><pre id="transcript">The reference-style transcript will appear here.</pre><div class="view-head"><h3>Instantaneous data</h3><button id="download-output" disabled>Download output.txt</button></div><div id="rows" class="rows">No simulation data.</div></section></main>`;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const form = $<HTMLFormElement>('#setup'), start = $<HTMLButtonElement>('#start'), cancel = $<HTMLButtonElement>('#cancel'), reset = $<HTMLButtonElement>('#reset');
const status = $<HTMLElement>('#status'), progress = $<HTMLProgressElement>('#progress'), transcript = $<HTMLElement>('#transcript'), rows = $<HTMLElement>('#rows');
const scrubber = $<HTMLInputElement>('#scrubber'), play = $<HTMLButtonElement>('#play'), previous = $<HTMLButtonElement>('#previous'), next = $<HTMLButtonElement>('#next'), speed = $<HTMLSelectElement>('#speed'), label = $<HTMLElement>('#frame-label');
const renderer = new TrajectoryRenderer($<HTMLElement>('#viewer')); const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
let frame = 0, frames = 0, playing = false, title = 'argon_md', output = '', averages = '', timer = 0;
const eta = new RemainingTimeEstimator();
const playable = (enabled: boolean) => [scrubber,play,previous,next,speed].forEach((element) => element.disabled=!enabled);
function showFrame(value: number) { frame=Math.max(0,Math.min(frames-1,value)); scrubber.value=String(frame); renderer.show(frame); label.textContent=`Frame ${frame + 1} / ${frames}`; }
function togglePlay() { playing=!playing; play.textContent=playing?'Pause':'Play'; if(playing) tick(); }
function tick() { if(!playing) return; showFrame((frame+1)%frames); timer=window.setTimeout(tick,1000/Number(speed.value)); }
function download(name: string, content: string) { const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([content],{type:'text/plain'})); link.download=name; link.click(); URL.revokeObjectURL(link.href); }
function renderRows(data: string) { const lines=data.trimEnd().split('\n'); rows.innerHTML=lines.slice(0,1).concat(lines.slice(1,201)).map((line)=>`<div>${line}</div>`).join('') + (lines.length>201 ? `<p>Showing first 200 of ${lines.length-1} data rows. Download the complete output for all rows.</p>`:''); }
worker.onmessage = ({ data }: MessageEvent<WorkerEvent>) => {
  if(data.type==='progress') { progress.value=data.completed; const seconds=eta.update(data.completed,data.total,performance.now()); if(seconds !== undefined) status.textContent=`Estimated time remaining: ${seconds} seconds`; }
  if(data.type==='error') { eta.reset(); status.textContent=`Unable to start: ${data.message}`; start.disabled=false; cancel.disabled=true; }
  if(data.type==='cancelled') { eta.reset(); status.textContent='Simulation canceled.'; start.disabled=false; cancel.disabled=true; }
  if(data.type==='complete') { eta.reset(); frames=data.frameCount; output=data.output; averages=data.transcript+'\n\n'+data.averages; renderer.load(new Float32Array(data.frames),frames,data.boxLength); showFrame(0); playable(true); transcript.textContent=averages; renderRows(output); status.textContent='Simulation complete.'; progress.value=1000; start.disabled=false; cancel.disabled=true; $<HTMLButtonElement>('#download-output').disabled=false; $<HTMLButtonElement>('#download-average').disabled=false; }
};
form.addEventListener('submit',(event)=>{ event.preventDefault(); const data=new FormData(form); const temperature=Number(data.get('temperature')), density=Number(data.get('density')); title=String(data.get('title')).trim()||'calculation'; const seedText=String(data.get('seed')).trim(); const input:SimulationInput={title,gas:String(data.get('gas')) as SimulationInput['gas'],temperatureKelvin:temperature,densityMolesPerM3:density,...(seedText?{seed:Number(seedText)}:{})}; const problem=validateInput(input); if(problem){ status.textContent=problem; return; } start.disabled=true; cancel.disabled=false; progress.value=0; playable(false); eta.start(performance.now()); status.textContent='Estimating time remaining…'; worker.postMessage({type:'start',input}); });
cancel.onclick=()=>{ worker.postMessage({type:'cancel'}); status.textContent='Canceling at the next simulation chunk…'; }; reset.onclick=()=>{ worker.postMessage({type:'reset'}); eta.reset(); clearTimeout(timer); playing=false; frame=frames=0; playable(false); progress.value=0; status.textContent='Ready.'; transcript.textContent='The reference-style transcript will appear here.'; rows.textContent='No simulation data.'; label.textContent='Run a simulation to view particles.'; };
scrubber.oninput=()=>showFrame(Number(scrubber.value)); play.onclick=togglePlay; previous.onclick=()=>showFrame(frame-1); next.onclick=()=>showFrame(frame+1); speed.onchange=()=>{ if(playing){ clearTimeout(timer); tick(); } };
$<HTMLButtonElement>('#download-output').onclick=()=>download(`${fileStem(title)}_output.txt`,output); $<HTMLButtonElement>('#download-average').onclick=()=>download(`${fileStem(title)}_average.txt`,averages);
