import { describe, expect, it } from 'vitest'
import { buildPlanSvgDocument } from './planSvgExport'

const FRAGMENT =
  '<svg class="plan-svg" viewBox="0 0 4 3" role="img"><line x1="0" y1="0" x2="4" y2="0"/></svg>'

describe('buildPlanSvgDocument', () => {
  it('prepends an XML declaration and injects the SVG namespace', () => {
    const doc = buildPlanSvgDocument(FRAGMENT)
    expect(doc.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(doc).toContain('<svg xmlns="http://www.w3.org/2000/svg" class="plan-svg"')
    // The original content survives untouched.
    expect(doc).toContain('<line x1="0" y1="0" x2="4" y2="0"/>')
    expect(doc.endsWith('</svg>\n')).toBe(true)
  })

  it('adds the namespace exactly once', () => {
    const doc = buildPlanSvgDocument(FRAGMENT)
    expect(doc.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)).toHaveLength(1)
  })

  it('returns an empty string for empty input (no-extent plan)', () => {
    expect(buildPlanSvgDocument('')).toBe('')
  })

  it('leaves an unexpected (non-<svg) fragment otherwise intact but still wrapped', () => {
    const doc = buildPlanSvgDocument('<g></g>')
    expect(doc).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<g></g>\n')
  })
})
