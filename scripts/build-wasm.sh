#!/usr/bin/env bash
set -euo pipefail

if ! command -v emcc >/dev/null 2>&1; then
  echo "Emscripten is required. Install/activate the pinned SDK described in README.md." >&2
  exit 1
fi

mkdir -p public/wasm
emcc wasm/md_core.cpp -O3 -std=c++17 \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=worker \
  -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=67108864 \
  -s EXPORTED_FUNCTIONS='["_md_initialize","_md_step","_md_is_finished","_md_is_cancelled","_md_cancel","_md_frame_count","_md_frame_ptr","_md_box_length","_md_progress","_md_output_ptr","_md_average_ptr","_md_console_ptr","_md_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","UTF8ToString"]' \
  -o public/wasm/md-core.js
