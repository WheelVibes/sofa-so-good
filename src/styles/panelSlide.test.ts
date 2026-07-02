import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P3 desktop panel slide', () => {
  it('defines a dock-panel mount entrance using --dur-2 + --ease-out with backwards fill', () => {
    const c = read('./components.css')
    expect(c).toMatch(/@keyframes dockPanelIn\b/)
    expect(c).toMatch(
      /\.dock-panel[^{]*\{[^}]*animation:\s*dockPanelIn var\(--dur-2\) var\(--ease-out\) backwards/s,
    )
    expect(c).not.toMatch(/dockPanelIn var\(--dur-2\) var\(--ease-out\) both/)
  })
  it('eases the canvas reflow via a transition on the rail widths', () => {
    expect(read('./components.css')).toMatch(
      /\.stage-area\s*\{[^}]*transition:[^}]*(left|right)[^}]*var\(--dur-2\)/s,
    )
  })
  it('scopes the entrance to desktop (≥641px)', () => {
    expect(read('./components.css')).toMatch(/min-width:\s*641px/)
  })
})
