import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  LatheGeometry,
  Vector2,
} from 'three'
import { describe, expect, it } from 'vitest'
import { partGeometry } from './buildObject'
import { defaultPart, type PartGradient } from './editSpec'
import { applyGradientColors } from './gradient'

/** Read the vertex colour at the geometry vertex whose chosen-axis position is
 *  the extreme (min or max). Returns the linear RGB the shader would see. */
function colorAtExtreme(geo: BufferGeometry, axis: 'x' | 'y' | 'z', which: 'min' | 'max'): Color {
  const pos = geo.getAttribute('position')
  const col = geo.getAttribute('color')
  const get = (i: number) => (axis === 'x' ? pos.getX(i) : axis === 'y' ? pos.getY(i) : pos.getZ(i))
  let idx = 0
  let best = which === 'min' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  for (let i = 0; i < pos.count; i++) {
    const v = get(i)
    if ((which === 'min' && v < best) || (which === 'max' && v > best)) {
      best = v
      idx = i
    }
  }
  return new Color(col.getX(idx), col.getY(idx), col.getZ(idx))
}

const RED = '#ff0000'
const BLUE = '#0000ff'

describe('applyGradientColors', () => {
  it('writes a COLOR_0 attribute matching the position count', () => {
    const geo = new BoxGeometry(1, 1, 1)
    const grad: PartGradient = { axis: 'y', from: RED, to: BLUE }
    applyGradientColors(geo, grad)
    const col = geo.getAttribute('color')
    expect(col).toBeTruthy()
    expect(col.count).toBe(geo.getAttribute('position').count)
    expect(col.itemSize).toBe(3)
  })

  it('endpoints match the from/to colours (Y axis)', () => {
    const geo = new BoxGeometry(1, 2, 1)
    applyGradientColors(geo, { axis: 'y', from: RED, to: BLUE })
    const from = new Color(RED)
    const to = new Color(BLUE)
    expect(colorAtExtreme(geo, 'y', 'min').getHexString()).toBe(from.getHexString())
    expect(colorAtExtreme(geo, 'y', 'max').getHexString()).toBe(to.getHexString())
  })

  it('respects the chosen axis (X endpoints, not Y)', () => {
    const geo = new BoxGeometry(2, 2, 2)
    applyGradientColors(geo, { axis: 'x', from: RED, to: BLUE })
    expect(colorAtExtreme(geo, 'x', 'min').getHexString()).toBe(new Color(RED).getHexString())
    expect(colorAtExtreme(geo, 'x', 'max').getHexString()).toBe(new Color(BLUE).getHexString())
  })

  it('degenerate axis span fills every vertex with the from colour', () => {
    // A single-ring lathe flattened would be degenerate; simulate with a thin box.
    const geo = new BoxGeometry(1, 1e-9, 1)
    applyGradientColors(geo, { axis: 'y', from: RED, to: BLUE })
    const col = geo.getAttribute('color')
    const from = new Color(RED)
    for (let i = 0; i < col.count; i++) {
      expect(col.getX(i)).toBeCloseTo(from.r, 5)
      expect(col.getY(i)).toBeCloseTo(from.g, 5)
      expect(col.getZ(i)).toBeCloseTo(from.b, 5)
    }
  })

  it('works on a non-box kind (lathe/cylinder)', () => {
    const geo = new CylinderGeometry(0.3, 0.3, 1, 16)
    applyGradientColors(geo, { axis: 'y', from: RED, to: BLUE })
    expect(geo.getAttribute('color').count).toBe(geo.getAttribute('position').count)
    const lathe = new LatheGeometry([new Vector2(0.1, 0), new Vector2(0.2, 1)], 12)
    applyGradientColors(lathe, { axis: 'y', from: RED, to: BLUE })
    expect(lathe.getAttribute('color').count).toBe(lathe.getAttribute('position').count)
  })
})

describe('partGeometry gradient integration', () => {
  it('a part with a gradient gets a COLOR_0 attribute', () => {
    const part = {
      ...defaultPart('box'),
      gradient: { axis: 'y', from: RED, to: BLUE } as PartGradient,
    }
    const geo = partGeometry(part)
    expect(geo.getAttribute('color')).toBeTruthy()
  })

  it('a part without a gradient has no COLOR_0 (byte-identical to before)', () => {
    const geo = partGeometry(defaultPart('box'))
    expect(geo.getAttribute('color')).toBeUndefined()
  })

  it('gradient survives every shape kind (extrude/sweep/lathe)', () => {
    for (const kind of ['extrude', 'sweep', 'lathe'] as const) {
      const part = {
        ...defaultPart(kind),
        gradient: { axis: 'y', from: RED, to: BLUE } as PartGradient,
      }
      const geo = partGeometry(part)
      expect(geo.getAttribute('color'), kind).toBeTruthy()
      expect(geo.getAttribute('color').count, kind).toBe(geo.getAttribute('position').count)
    }
  })
})
