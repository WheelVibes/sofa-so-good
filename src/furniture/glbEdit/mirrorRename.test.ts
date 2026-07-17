import { describe, expect, it } from 'vitest'
import {
  type AssetEditSpec,
  mirroredTransform,
  mirrorPartAxis,
  mirrorPartsAxis,
  partLabel,
  renamePart,
  type ShapePart,
} from './editSpec'

function box(
  id: string,
  position: [number, number, number],
  rotation?: [number, number, number],
): ShapePart {
  return { id, kind: 'box', position, size: [0.4, 0.4, 0.4], color: '#888', rotation }
}
function spec(parts: ShapePart[]): AssetEditSpec {
  return { sourceScale: 1, meshOverrides: {}, parts }
}

describe('mirroredTransform', () => {
  it('negates X and Y/Z rotation for an X mirror', () => {
    expect(mirroredTransform([1, 2, 3], [10, 20, 30], 'x')).toEqual({
      position: [-1, 2, 3],
      rotation: [10, -20, -30],
    })
  })
  it('negates Z and X/Y rotation for a Z mirror', () => {
    expect(mirroredTransform([1, 2, 3], [10, 20, 30], 'z')).toEqual({
      position: [1, 2, -3],
      rotation: [-10, -20, 30],
    })
  })
})

describe('mirrorPartAxis / mirrorPartsAxis', () => {
  it('appends a single mirrored copy on X', () => {
    const s = spec([box('a', [0.5, 0.2, 0])])
    const { spec: out, newId } = mirrorPartAxis(s, 'a', 'x')
    expect(out.parts).toHaveLength(2)
    const copy = out.parts.find((p) => p.id === newId)!
    expect(copy.position[0]).toBe(-0.5)
  })

  it('mirrors a whole multi-selection on Z as a rigid set', () => {
    const s = spec([box('a', [0.5, 0.2, 0.3]), box('b', [-0.5, 0.2, 0.6])])
    const { spec: out, newIds } = mirrorPartsAxis(s, ['a', 'b'], 'z')
    expect(newIds).toHaveLength(2)
    const zs = newIds.map((id) => out.parts.find((p) => p.id === id)!.position[2])
    expect(zs).toEqual([-0.3, -0.6])
  })
})

describe('renamePart / partLabel', () => {
  it('sets and clears the name', () => {
    const s = spec([box('a', [0, 0, 0])])
    const named = renamePart(s, 'a', 'Front leg')
    expect(named.parts[0].name).toBe('Front leg')
    const cleared = renamePart(named, 'a', '   ')
    expect(cleared.parts[0].name).toBeUndefined()
  })

  it('labels from the name, else the default kind N', () => {
    expect(partLabel(box('a', [0, 0, 0]), 3)).toBe('box 3')
    expect(partLabel({ ...box('a', [0, 0, 0]), name: 'Seat' }, 3)).toBe('Seat')
  })
})
