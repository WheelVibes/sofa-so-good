import { describe, it, expect } from 'vitest';
import { createEventMerger } from '../scraper-server.mjs';

describe('createEventMerger', () => {
  it('emits group_ready once metadata + a finish have landed, exactly once', () => {
    const emitted = [];
    const optimized = [];
    const handle = createEventMerger({
      onEmit: (ev) => emitted.push(ev),
      submitOptimize: (group, glb) => optimized.push(`${group}/${glb}`),
    });

    handle({ group: 'g', finish: 'white', glb: 'white.glb', phase: 'glb_written' });
    handle({ group: 'g', phase: 'metadata_written' });
    handle({ group: 'g', finish: 'black', glb: 'black.glb', phase: 'glb_written' });

    const ready = emitted.filter((e) => e.phase === 'group_ready');
    expect(ready).toEqual([{ phase: 'group_ready', group: 'g' }]); // exactly once
    expect(optimized).toEqual(['g/white.glb', 'g/black.glb']); // each finish optimized
  });

  it('does not emit group_ready before any finish lands', () => {
    const emitted = [];
    const handle = createEventMerger({ onEmit: (ev) => emitted.push(ev), submitOptimize: () => {} });
    handle({ group: 'g', phase: 'metadata_written' });
    expect(emitted.some((e) => e.phase === 'group_ready')).toBe(false);
  });
});
