import { describe, expect, it } from 'vitest'
import { mainBedroom } from './mainBedroom'

/**
 * CURTAIN-NIGHTSTAND (v0.31.5.87) — pins the clearance that stops the north-window
 * curtain cutting a notch out of the bedside lamp shades.
 *
 * The overlap is unavoidable in z: the curtain panel hangs at z 0.48-0.58 and the
 * room's north interior wall is at z 0.20, so a 0.40-deep nightstand placed against
 * that wall always reaches z >= 0.60. `.61` measured the only z fix as moving the
 * nightstands 0.33 m out into the room, which reads wrong for a bedside table. The
 * clearance is therefore taken in **x**, so that is what these tests assert.
 */

/** Real primitive dimensions, from `primitives/Nightstand.tsx` / `TableLamp.tsx`. */
const NIGHTSTAND_W = 0.45
const LAMP_SHADE_R = 0.15 // 'empire' profile, max radius

/** Room interior + window, from this layout's own header comment. */
const ROOM_X = [0.2, 3.28] as const
const GLASS_X = [0.8, 2.6] as const

const byId = (id: string) => {
  const e = mainBedroom.find((i) => i.id === id)
  if (!e) throw new Error(`missing layout entry ${id}`)
  return e
}
const spanX = (centre: number, halfWidth: number) => [centre - halfWidth, centre + halfWidth]

const curtain = byId('default-main-curtain')
const curtainX = spanX(curtain.position[0], (curtain.props.width as number) / 2)

describe('mainBedroom curtain vs bedside furniture', () => {
  it('still covers the window glass, with overhang on both sides', () => {
    // Narrowing to clear the nightstands must not uncover the window.
    expect(curtainX[0]).toBeLessThanOrEqual(GLASS_X[0])
    expect(curtainX[1]).toBeGreaterThanOrEqual(GLASS_X[1])
  })

  for (const [label, standId, lampId] of [
    ['left', 'default-main-nightstand-l', 'default-main-tablelamp-l'],
    ['right', 'default-main-nightstand', 'default-main-tablelamp'],
  ] as const) {
    it(`${label} nightstand clears the curtain in x`, () => {
      const [lo, hi] = spanX(byId(standId).position[0], NIGHTSTAND_W / 2)
      // Entirely outboard of the curtain — no shared x, so no intersection.
      expect(hi <= curtainX[0] || lo >= curtainX[1]).toBe(true)
    })

    it(`${label} lamp shade clears the curtain in x`, () => {
      const [lo, hi] = spanX(byId(lampId).position[0], LAMP_SHADE_R)
      expect(hi <= curtainX[0] || lo >= curtainX[1]).toBe(true)
    })

    it(`${label} nightstand still fits inside the room`, () => {
      const [lo, hi] = spanX(byId(standId).position[0], NIGHTSTAND_W / 2)
      expect(lo).toBeGreaterThanOrEqual(ROOM_X[0])
      expect(hi).toBeLessThanOrEqual(ROOM_X[1])
    })
  }

  it('keeps the lamp centred on its nightstand', () => {
    // The lamp is set-dressing ON the nightstand: if one moves the other must.
    expect(byId('default-main-tablelamp-l').position).toEqual(
      byId('default-main-nightstand-l').position,
    )
    expect(byId('default-main-tablelamp').position).toEqual(
      byId('default-main-nightstand').position,
    )
  })

  it('keeps the desk plant on the east nightstand surface', () => {
    expect(byId('default-main-decor-plant').position).toEqual(
      byId('default-main-nightstand').position,
    )
  })
})
