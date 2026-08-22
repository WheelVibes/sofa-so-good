import { describe, expect, it } from 'vitest'
import { wallEntryOverlayPos } from './wallEntryPlacement'

const BASE = { panelW: 200, panelH: 74, margin: 12, vw: 1440, vh: 900 }

describe('wallEntryOverlayPos', () => {
  it('sits below-right of the endpoint when there is room', () => {
    expect(wallEntryOverlayPos({ ...BASE, endScreenPx: [400, 300] })).toEqual({
      left: 418,
      top: 318,
    })
  })

  it('flips to the left of the endpoint near the right edge', () => {
    // 1210 is the last x that still fits to the right (1210 + 18 + 200 + 12 = 1440).
    expect(wallEntryOverlayPos({ ...BASE, endScreenPx: [1210, 300] }).left).toBe(1228)
    // One px further and it flips to the near side: 1211 - 200 - 12.
    expect(wallEntryOverlayPos({ ...BASE, endScreenPx: [1211, 300] }).left).toBe(999)
  })

  it('flips above the endpoint near the bottom edge', () => {
    expect(wallEntryOverlayPos({ ...BASE, endScreenPx: [400, 860] }).top).toBe(774)
  })

  it('stays on screen when the endpoint is off the left/top of the viewport', () => {
    // The reachable bug: the plan canvas pans, so a draft end can sit outside
    // the viewport. Nothing overflows the far edge, so no flip fires, and the
    // old code placed the panel at endpoint+18 — off-screen.
    expect(wallEntryOverlayPos({ ...BASE, endScreenPx: [-900, 300] }).left).toBe(12)
    expect(wallEntryOverlayPos({ ...BASE, endScreenPx: [400, -780] }).top).toBe(12)
  })

  it('stays on screen when the endpoint is off the right/bottom of the viewport', () => {
    const p = wallEntryOverlayPos({ ...BASE, endScreenPx: [2600, 1700] })
    expect(p.left).toBe(1440 - 200 - 12)
    expect(p.top).toBe(900 - 74 - 12)
  })

  it('keeps the taller error-state panel fully on screen near the bottom edge', () => {
    // panelH grows with the validation row; the caller used to pass the
    // error-free height, so the message itself fell below the fold.
    const tall = { ...BASE, panelH: 92 }
    const p = wallEntryOverlayPos({ ...tall, endScreenPx: [400, 890] })
    expect(p.top + 92).toBeLessThanOrEqual(900 - 12)
  })

  it('pins to the near edge when the viewport cannot fit panel + both margins', () => {
    const p = wallEntryOverlayPos({ ...BASE, endScreenPx: [100, 100], vw: 180, vh: 80 })
    expect(p).toEqual({ left: 12, top: 12 })
  })

  it('keeps the panel on screen for every endpoint, on or off canvas', () => {
    for (let x = -1200; x <= 2600; x += 100) {
      for (let y = -800; y <= 1700; y += 100) {
        const p = wallEntryOverlayPos({ ...BASE, endScreenPx: [x, y] })
        expect(p.left, `x=${x}`).toBeGreaterThanOrEqual(12)
        expect(p.top, `y=${y}`).toBeGreaterThanOrEqual(12)
        expect(p.left + BASE.panelW, `x=${x}`).toBeLessThanOrEqual(1440 - 12)
        expect(p.top + BASE.panelH, `y=${y}`).toBeLessThanOrEqual(900 - 12)
      }
    }
  })
})
