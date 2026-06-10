import { describe, expect, it } from 'vitest'
import { designerPickIds, resolveDesignerPicks } from './designerPicks'

describe('designerPickIds', () => {
  it('returns floor vs wall curated lists', () => {
    expect(designerPickIds('floor')).toContain('floor-wood-oak')
    expect(designerPickIds('wall')).toContain('wall-paint-greige')
    expect(designerPickIds('floor')).not.toContain('wall-paint-greige')
  })
})

describe('resolveDesignerPicks', () => {
  const available = {
    'floor-wood-oak': { id: 'floor-wood-oak' },
    'floor-tile-marble': { id: 'floor-tile-marble' },
    // floor-wood-walnut intentionally absent → must be skipped
  }

  it('keeps curated order and drops missing ids', () => {
    const out = resolveDesignerPicks('floor', available)
    expect(out.map((m) => m.id)).toEqual(['floor-wood-oak', 'floor-tile-marble'])
  })

  it('returns empty when nothing matches', () => {
    expect(resolveDesignerPicks('wall', available)).toEqual([])
  })
})
