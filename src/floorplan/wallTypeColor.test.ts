import { describe, expect, it } from 'vitest'
import { wallTypeOverlayColor } from './wallTypeColor'

describe('wallTypeOverlayColor', () => {
  it('tints structural walls danger red', () => {
    expect(wallTypeOverlayColor('load-bearing')).toBe('#e5484d')
    expect(wallTypeOverlayColor('rc-partition')).toBe('#e5484d')
  })

  it('tints the gable-end wall a distinct blue', () => {
    expect(wallTypeOverlayColor('gable-end')).toBe('#3e63dd')
  })

  it('tints permit-required partitions amber', () => {
    expect(wallTypeOverlayColor('brick-partition')).toBe('#f5a524')
    expect(wallTypeOverlayColor('drywall')).toBe('#f5a524')
  })

  it('leaves unknown / absent structure untinted', () => {
    expect(wallTypeOverlayColor('unknown')).toBeNull()
    expect(wallTypeOverlayColor(undefined)).toBeNull()
  })
})
