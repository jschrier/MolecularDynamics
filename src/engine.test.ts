import { describe, expect, it } from 'vitest';
import { canToggleEngine, engineLabel, nextEngineEnabled } from './engine';

describe('engine indicator state', () => {
  it('labels each accessible engine state', () => {
    expect(engineLabel('enabled')).toBe('WebGPU enabled');
    expect(engineLabel('forced-wasm')).toContain('turned off');
    expect(engineLabel('unavailable')).toContain('unavailable');
  });

  it('only toggles available idle engines', () => {
    expect(canToggleEngine('enabled', false)).toBe(true);
    expect(canToggleEngine('forced-wasm', false)).toBe(true);
    expect(canToggleEngine('unavailable', false)).toBe(false);
    expect(canToggleEngine('enabled', true)).toBe(false);
    expect(nextEngineEnabled('enabled')).toBe(false);
    expect(nextEngineEnabled('forced-wasm')).toBe(true);
  });
});
