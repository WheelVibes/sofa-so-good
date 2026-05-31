import { describe, expect, it } from 'vitest'
import { createEventMerger } from '../scraper-server.mjs'

describe('createEventMerger', () => {
  it('re-emits group_ready as each new finish lands (so a multi-finish group re-imports with the fuller metadata)', () => {
    // A multi-finish product is scraped one finish per page, each re-writing
    // the shared metadata.json. The first metadata_written only has one usable
    // variant; later finishes fill in their stubs. The merger must re-fire
    // group_ready on each so the client re-registers with all variants.
    const emitted = []
    const optimized = []
    const handle = createEventMerger({
      onEmit: (ev) => emitted.push(ev),
      submitOptimize: (group, glb) => optimized.push(`${group}/${glb}`),
    })

    handle({ group: 'g', finish: 'white', glb: 'white.glb', phase: 'glb_written' })
    handle({ group: 'g', phase: 'metadata_written' })
    handle({ group: 'g', finish: 'black', glb: 'black.glb', phase: 'glb_written' })
    handle({ group: 'g', phase: 'metadata_written' })

    const ready = emitted.filter((e) => e.phase === 'group_ready')
    // Once per finish that landed — the second re-register picks up black.glb.
    expect(ready).toEqual([
      { phase: 'group_ready', group: 'g' },
      { phase: 'group_ready', group: 'g' },
    ])
    expect(optimized).toEqual(['g/white.glb', 'g/black.glb']) // each finish optimized
  })

  it('does not re-emit group_ready on a metadata refresh with no new finish', () => {
    const emitted = []
    const handle = createEventMerger({ onEmit: (ev) => emitted.push(ev), submitOptimize: () => {} })
    handle({ group: 'g', finish: 'white', glb: 'white.glb', phase: 'glb_written' })
    handle({ group: 'g', phase: 'metadata_written' }) // ready #1
    handle({ group: 'g', phase: 'metadata_written' }) // shared-spec refresh, no new GLB
    expect(emitted.filter((e) => e.phase === 'group_ready')).toHaveLength(1)
  })

  it('does not emit group_ready before any finish lands', () => {
    const emitted = []
    const handle = createEventMerger({ onEmit: (ev) => emitted.push(ev), submitOptimize: () => {} })
    handle({ group: 'g', phase: 'metadata_written' })
    expect(emitted.some((e) => e.phase === 'group_ready')).toBe(false)
  })
})
