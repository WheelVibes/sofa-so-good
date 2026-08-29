import { describe, expect, it } from 'vitest'
import { TEXTILES_DEFS } from '../defs/textiles'
import { bedroom2 } from './bedroom2'
import { bedroom3 } from './bedroom3'
import { livingDining } from './livingDining'
import { mainBedroom } from './mainBedroom'
import type { LayoutEntry } from './types'

/**
 * WINDOW-TIME-INVARIANT (v0.31.5.88) — the demo flat ships with its curtains OPEN.
 *
 * `.44` measured that the app bakes a city backdrop the out-of-box user never sees,
 * because every window in the default flat was covered: facing any of the 5 openings
 * in walk mode, a ray grid found essentially no exterior pixels. The fix is content —
 * `drawAmount: 0` on the default layouts — deliberately NOT a change to the def's own
 * default, so a curtain the user places themselves still arrives drawn.
 */

const LAYOUTS: Array<[string, LayoutEntry[]]> = [
  ['mainBedroom', mainBedroom],
  ['bedroom2', bedroom2],
  ['bedroom3', bedroom3],
  ['livingDining', livingDining],
]

const curtainsIn = (layout: LayoutEntry[]) => layout.filter((i) => i.defId === 'curtains')

describe('default flat ships with curtains open', () => {
  for (const [name, layout] of LAYOUTS) {
    it(`${name} has at least one curtain, and every one is open`, () => {
      const curtains = curtainsIn(layout)
      expect(curtains.length).toBeGreaterThan(0)
      for (const c of curtains) expect(c.props.drawAmount).toBe(0)
    })
  }

  it('leaves the DEF default drawn, so a user-placed curtain still arrives closed', () => {
    // The split is the point: staging the demo flat open must not change what a
    // curtain does when someone drops a new one on a window.
    const param = TEXTILES_DEFS.curtains.paramSchema?.find((p) => p.key === 'drawAmount')
    expect(param).toBeDefined()
    expect(param?.default).toBe(1)
  })
})
