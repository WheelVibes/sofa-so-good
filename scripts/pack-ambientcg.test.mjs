import { describe, expect, it } from 'vitest'
import { displayName, familyOf } from './pack-ambientcg.mjs'

describe('familyOf', () => {
  it('takes the leading letter run as the family', () => {
    expect(familyOf('Wood065')).toBe('Wood')
    expect(familyOf('WoodFloor008')).toBe('WoodFloor')
    expect(familyOf('PavingStones115B')).toBe('PavingStones')
  })

  it('keeps a variant suffix out of the family', () => {
    // `Metal048C` and `Metal048` are the same family, different scans.
    expect(familyOf('Metal048C')).toBe('Metal')
    expect(familyOf('Concrete044B')).toBe('Concrete')
  })
})

describe('displayName', () => {
  it('splits the CamelCase family and keeps the asset number', () => {
    expect(displayName('WoodFloor008')).toBe('Wood Floor 008')
    expect(displayName('PaintedPlaster018')).toBe('Painted Plaster 018')
    expect(displayName('Wood065')).toBe('Wood 065')
  })

  it('preserves a variant letter', () => {
    expect(displayName('Metal048C')).toBe('Metal 048C')
  })
})
