/**
 * UIUX-2 guard: every `btn*` modifier used in TSX must exist in the CSS
 * vocabulary. Four families of silent typos shipped because an undefined
 * class just renders the default button: `.sm` (→ `btn-sm`), `.ghost` /
 * `.btn-ghost` (no tertiary class exists — plain `.btn` IS the tertiary),
 * `.btn-icon` (→ `.icon-btn`), `.btn-primary` (→ `.btn-accent`), and
 * `.btn.on` with no CSS rule (a toggle with no visible on-state).
 * This scan makes those unrepresentable again.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const UI_DIR = __dirname
const STYLE_DIR = join(__dirname, '../styles')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...tsxFiles(p))
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) out.push(p)
  }
  return out
}

const css = readdirSync(STYLE_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(STYLE_DIR, f), 'utf8'))
  .join('\n')

/** All static className string fragments in a TSX source (plain + template). */
function classNameFragments(src: string): string[] {
  const frags: string[] = []
  for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const raw = m[1] ?? m[2] ?? ''
    // Strip ${…} interpolations from template literals; keep static text.
    frags.push(raw.replace(/\$\{[^}]*\}/g, ' '))
  }
  return frags
}

describe('btn class vocabulary guard (UIUX-2)', () => {
  const files = tsxFiles(UI_DIR)
  it('scans a realistic number of components', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('every btn-* modifier used in TSX exists as a CSS class', () => {
    const missing: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const frag of classNameFragments(src)) {
        for (const tok of frag.split(/\s+/)) {
          if (!/^btn-[a-z0-9-]+$/.test(tok)) continue
          if (!css.includes(`.${tok}`)) missing.push(`${f}: ${tok}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('no bare `sm`/`ghost` typo tokens alongside `btn`', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const frag of classNameFragments(src)) {
        const toks = frag.split(/\s+/)
        if (!toks.includes('btn')) continue
        for (const t of toks) {
          if (t === 'sm' || t === 'ghost' || t === 'btn-ghost') bad.push(`${f}: "${frag}"`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('.btn.on (standalone toggle armed state) is defined with the accent selection ring', () => {
    expect(css).toMatch(/\.btn\.on\s*\{[^}]*var\(--accent-soft\)/)
    expect(css).toMatch(/\.btn\.on\s*\{[^}]*inset 0 0 0 1px var\(--accent\)/)
  })
})
