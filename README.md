# Lennard-Jones Molecular Dynamics

A GPU-accelerated molecular-dynamics application for simulating a
216-particle Lennard-Jones noble gas that runs entirely in a web-browser, with no servers, accounts, or data-upload required. [Try it.](https://jschrier.github.io/MolecularDynamics/)

This is adapted from [Foley et al's C++ code](https://github.com/FoleyLab/MolecularDynamics).  More information about this program, including detailed instructions for its use, can be found [here for instructions](https://pubs.acs.org/doi/suppl/10.1021/acs.jchemed.7b00747) and [here for discussion of its use in an undergraduate laboratory setting](https://pubs.acs.org/doi/pdf/10.1021/acs.jchemed.7b00747).

This [web version](https://jschrier.github.io/MolecularDynamics/) preserves the calculations and output conventions of the
original teaching code while replacing terminal prompts and trajectory files
with an interactive interface, downloadable text reports, and a WebGL
trajectory viewer.

## Features

- Supports He, Ne, Ar, Kr, and Xe with the original gas-specific settings.
- Uses WebAssembly as the portable reference backend.
- Uses WebGPU directly when a worker can acquire a usable device; users can
  switch to WebAssembly for the current page session.
- Displays retained trajectory frames with Three.js controls for orbit, pan,
  zoom, playback, and scrubbing.
- Provides reference-style instantaneous and average thermodynamic output for
  download.
- Designed to be easily navigable by AI coding agents.

WebGPU results use `float32` GPU state and are physically equivalent, but not
bitwise identical, to the `float64` WebAssembly reference.  WebGPU is optional:
the application continues to work with WebAssembly when it is unavailable.

## Try it and deploy it

[Try it](https://jschrier.github.io/MolecularDynamics/)

The production build is a static `dist/` directory and can be served by any
static-file host.  This repository includes a GitHub Pages workflow.  After
pushing it to GitHub, enable **Settings → Pages → Build and deployment →
GitHub Actions**.  Pushes to the default branch will then publish the site.

## Local development

### Prerequisites

- Node.js 20.19.0 (the checked-in `.nvmrc` selects this version)
- [Emscripten SDK 3.1.64](https://emscripten.org/docs/getting_started/downloads.html),
  activated so that `emcc` is on `PATH`

```sh
npm ci
npm run dev
```

For a production-equivalent static build:

```sh
npm run build
npm run preview
```

`npm run build` first recompiles `wasm/md_core.cpp` into
`public/wasm/md-core.js` and `public/wasm/md-core.wasm`, then bundles the
application with Vite.  The generated `dist/` directory is intentionally not
committed.

## Tests

```sh
npm test
npx tsc -b --pretty false
```

The GitHub Actions workflow runs these checks and a complete Emscripten/Vite
build for every push and pull request.

For development-only, matched complete-run WebGPU/WebAssembly timing
comparisons, append `?benchmark=1` to a local application URL.  This benchmark
never runs during an ordinary simulation; its result is specific to the
browser, hardware, thermal state, and selected simulation input.

## Browser automation

The rendered controls can be driven by browser-automation and agentic coding
tools. Stable `data-testid` attributes identify the form, controls, status,
progress bar, and result controls. After a run completes, the page exposes a
semantic summary table and an equivalent JSON record in the
`#simulation-summary-json` element; the **Download summary.json** button saves
the same record. This is a convenient automation path for one-off calculations
without requiring a separate server API.

For example, an agent can be prompted:

```
Open the Molecular Dynamics page, run Ar at 87 K and 35000 mol/m³ with seed
12345, wait for completion, and return the JSON summary as a table.
```

This automation path can also compose longer simulations and data-analysis
workflows in AI coding agents:

```
/browser Help me automate some simulations.  Access the webpage https://jschrier.github.io/MolecularDynamics/ and use it to run a series of Argon simulations where you set the temperature to [100, 200, 300, 400] K.  Run each simulation and save the outputs.  Then plot the compressibility as a function of temperature.
```

## Reference implementations

The original teaching implementations by [Foley et al.](https://github.com/FoleyLab/MolecularDynamics) are retained for provenance and
comparison:

- `reference/cpp/MD.cpp` and `reference/cpp/Makefile`: original C++ program.
- `reference/python/md.ipynb`: original notebook version.

The WebAssembly core in `wasm/md_core.cpp` is the browser adaptation used by
the application.

## License and acknowledgments

This project is licensed under the GNU General Public License, version 3 or
later; see [LICENSE](LICENSE).  The original C++ program is credited in its source
header to Jonathan J. Foley IV, Chelsea Sweet, and Oyewumi Akinfenwa.  This revision to a web-browser-based system was performed by Joshua Schrier with the help of gpt-5.6-terra.

The browser renderer bundles [three.js](https://threejs.org/), which is made
available under the MIT License.  Its license text is included in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
