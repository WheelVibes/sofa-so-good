/**
 * UIUX-18 guard: every reference to a *scale* design token (--t-*, --s-N,
 * --r-*, --modal-*, --dur*, --ease*, --z-*, --lh-*) must be defined in
 * src/styles/*.css. An undefined token in `var()` silently computes to the
 * inherited/initial value — `var(--t-1)` and `var(--t-3xs)` shipped that way
 * (nonexistent steps of the type scale) and just rendered wrong sizes.
 * Theme/dynamic vars (--mx, --accent, --glow-a, …) are out of scope — only the
 * fixed scales are checked, so this can't false-positive on JS-set properties.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLE_DIR = join(__dirname, '../styles')
const SCALE = /^--(?:t|lh|s|r|modal|dur|ease|z)(?:-[a-z0-9-]+)?$/

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((x) => e.name.endsWith(x)) && !e.name.includes('.test.')) out.push(p)
  }
  return out
}

const cssText = readdirSync(STYLE_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(STYLE_DIR, f), 'utf8'))
  .join('\n')

const defined = new Set<string>()
for (const m of cssText.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]!)

describe('scale-token reference guard (UIUX-18)', () => {
  it('every var(--scale-token) referenced in src/ui TSX + src/styles CSS is defined', () => {
    const missing = new Set<string>()
    const sources = [...walk(join(__dirname), ['.tsx', '.ts']), ...walk(STYLE_DIR, ['.css'])]
    for (const f of sources) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/var\((--[a-z0-9-]+)[),]/g)) {
        const tok = m[1]!
        if (SCALE.test(tok) && !defined.has(tok)) missing.add(`${f}: ${tok}`)
      }
    }
    expect([...missing]).toEqual([])
  })
})
