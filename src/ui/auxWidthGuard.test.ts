/**
 * UIUX-49 — aux panels size via the named width ladder (.aux-320/-360/-380,
 * parts.css), never an inline `style={{ width: … }}`: an inline width beats
 * the mobile sheet override (`.aux { width: auto !important }` needs the
 * !important precisely because of past inline widths) and invents ad-hoc
 * steps outside the design system. Scans every aux `<aside>` for an inline
 * width on the same element.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return walk(p)
    return p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : []
  })

describe('aux panel width guard (UIUX-49)', () => {
  it('the width ladder classes exist and no per-panel ID width rule shadows them', () => {
    const parts = readFileSync(join(__dirname, '../styles/parts.css'), 'utf8')
    expect(parts).toMatch(/\.aux-320 \{ width: var\(--panel-w\); \}/)
    expect(parts).toMatch(/\.aux-360 \{ width: 360px; \}/)
    expect(parts).toMatch(/\.aux-380 \{ width: 380px; \}/)
    // No per-panel ID rule may set a NUMERIC width (a token width like
    // `#swapPanel { width: var(--modal-md) }` is the sanctioned modal pattern).
    const features = readFileSync(join(__dirname, '../styles/features.css'), 'utf8')
    expect(features).not.toMatch(/#\w+Panel[^{]*\{[^}]*\bwidth:\s*\d/)
  })

  it('no aux aside carries an inline width', () => {
    const offenders: string[] = []
    for (const file of walk(join(__dirname, '.'))) {
      const src = readFileSync(file, 'utf8')
      // An <aside …"panel mini aux…"…> opening tag with a width in its inline style.
      const m = src.match(/<aside[^>]*panel mini aux[^>]*style=\{\{[^}]*width\s*:/)
      if (m) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
