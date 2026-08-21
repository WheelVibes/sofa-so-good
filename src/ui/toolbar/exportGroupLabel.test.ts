import { describe, expect, it } from 'vitest'
import { exportGroupLabel } from './exportGroupLabel'

/**
 * The File surface's export heading must name only the buckets that render
 * (UIUX-71/73). A fixed "CAD, 3D & data" promised absent categories in Simple
 * mode, where the CAD rows (`dxfExport`, pro) and the CSV data rows
 * (`shopExport`, off by default) are both gated away.
 */
describe('exportGroupLabel', () => {
  it('names all three buckets as a phrase', () => {
    expect(exportGroupLabel({ cad: true, threeD: true, data: true })).toBe('CAD, 3D & data')
  })

  it('drops a gated-away bucket', () => {
    expect(exportGroupLabel({ cad: true, threeD: true, data: false })).toBe('CAD & 3D')
    // The Simple-mode shape: no CAD rows, no CSV rows.
    expect(exportGroupLabel({ cad: false, threeD: true, data: false })).toBe('3D')
    expect(exportGroupLabel({ cad: false, threeD: true, data: true })).toBe('3D & data')
    expect(exportGroupLabel({ cad: true, threeD: false, data: true })).toBe('CAD & data')
  })

  it('returns an empty string when nothing renders (caller skips the heading)', () => {
    expect(exportGroupLabel({ cad: false, threeD: false, data: false })).toBe('')
  })
})
