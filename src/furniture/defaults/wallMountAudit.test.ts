import { describe, expect, it } from 'vitest'
import { defaultLayout } from '../defaultLayout'
import { wallMountAudit } from './wallMountAudit'

/**
 * WALL-MOUNT-WINDOW-AUDIT — a seeded wall mount must never overlap a window
 * opening on its own host wall (a mount hanging in front of glass shows the
 * window frame behind it, and blocks the window it's supposedly beside). Two
 * hits were already fixed by hand (the living room fan-coil, v0.33.1.12; the
 * main-bedroom reading sconces, v0.33.1.14, MB-SCONCE-FLANK in
 * `src/furniture/CLAUDE.md`); a third (bath 1's mirror cabinet, over the
 * basin on the bathroom's south/window wall) is fixed alongside this audit
 * (see `defaults/bathrooms.ts`). This test is what enforces all three stay
 * fixed and catches the next one.
 */
describe('wallMountAudit — default flat', () => {
  it('has no seeded wall mount overlapping a window', () => {
    const hits = wallMountAudit(defaultLayout())
    expect(hits).toEqual([])
  })
})
