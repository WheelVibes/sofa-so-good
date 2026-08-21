// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompareOverlay } from './CompareOverlay'

/**
 * UIUX-76: four compare modals had each copy-pasted this overlay, and the copies
 * drifted (three knob font sizes, a literal rgba/#fff chip next to a tokenised
 * accent sibling, the accent chip on the left in three and the right in the
 * fourth). These tests pin the shared shape AND that every modal still uses it.
 */
describe('CompareOverlay', () => {
  it('renders a divider, a knob and one chip per side', () => {
    const { container } = render(
      <CompareOverlay dividerPct="42.0%" labelA="Before" labelB="After" />,
    )
    expect(container.querySelector('.cmp-divider')).toBeTruthy()
    expect(container.querySelector('.cmp-handle')).toBeTruthy()
    expect(container.querySelectorAll('.cmp-tag').length).toBe(2)
  })

  it('puts the baseline label in the a chip and the subject label in the b chip', () => {
    const { container } = render(
      <CompareOverlay dividerPct="10%" labelA="Current" labelB="Saved version" />,
    )
    expect(container.querySelector('.cmp-tag.a')?.textContent).toBe('Current')
    expect(container.querySelector('.cmp-tag.b')?.textContent).toBe('Saved version')
  })

  it('drives the divider and knob off one split position', () => {
    const { container } = render(<CompareOverlay dividerPct="42%" labelA="A" labelB="B" />)
    for (const sel of ['.cmp-divider', '.cmp-handle']) {
      expect(container.querySelector<HTMLElement>(sel)?.style.left).toBe('42%')
    }
  })

  it('hides the decorative parts from assistive tech, keeping the labels', () => {
    const { container } = render(<CompareOverlay dividerPct="50%" labelA="A" labelB="B" />)
    expect(container.querySelector('.cmp-divider')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.cmp-handle')?.getAttribute('aria-hidden')).toBe('true')
    // The chips carry the only content a screen reader needs.
    expect(container.querySelector('.cmp-tag.a')?.getAttribute('aria-hidden')).toBeNull()
  })
})

describe('CompareOverlay adoption', () => {
  const MODALS = [
    'StagingRevealModal.tsx',
    'RenderCompareModal.tsx',
    'TimeCompareModal.tsx',
    'VersionCompareModal.tsx',
  ]
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

  for (const f of MODALS) {
    it(`${f} renders the shared overlay`, () => {
      expect(read(f)).toContain('<CompareOverlay')
    })

    it(`${f} keeps no hand-rolled divider, knob or chip`, () => {
      const src = read(f)
      // The tells of the old inline copies. `left: dividerPct` is the strongest:
      // only a hand-rolled divider or knob positions itself off the split.
      // (A bare ⇄ is NOT a tell — RenderCompareModal has a legitimate
      // "Swap A and B" button using the same glyph.)
      expect(src, f).not.toContain('left: dividerPct')
      expect(src, f).not.toContain("transform: 'translateX(-50%)'")
      expect(src, f).not.toContain("borderRadius: '50%'")
      expect(src, f).not.toMatch(/rgba\(0,\s*0,\s*0,\s*0\.\d+\)/)
    })
  }
})
