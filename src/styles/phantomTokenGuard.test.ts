import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UIUX-52 phantom-token guard: every `var(--…)` reference in src must resolve to
 * a custom property that is actually DEFINED somewhere in src — as a CSS
 * declaration (`--name: …`), a JS `setProperty('--name', …)`, or a style-object
 * key (`'--name': …`). A phantom reference is not a style no-op: an undefined
 * var() makes the whole declaration invalid at computed-value time, so the
 * property silently falls back to its initial/inherited value (UIUX-50's Design
 * score dial rendered as a solid pie with an invisible grade letter; UIUX-52
 * found an SVG badge filled black by an undefined `--panel`). Fallbacks inside
 * var() don't excuse a phantom either — they hide a misspelt token behind a
 * literal, which is exactly the hardcoded-colour rule this repo bans.
 */

const SRC = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (/\.(css|tsx|ts)$/.test(entry) && !/\.test\./.test(entry)) out.push(p)
  }
  return out
}

describe('UIUX-52 no phantom CSS custom-property references', () => {
  it('every var(--token) reference in src resolves to a defined custom property', () => {
    const files = walk(SRC)
    const defined = new Set<string>()
    const referenced = new Map<string, string[]>()

    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) defined.add(m[1])
        for (const m of line.matchAll(/setProperty\(\s*['"](--[\w-]+)['"]/g)) defined.add(m[1])
        for (const m of line.matchAll(/['"](--[\w-]+)['"]\s*:/g)) defined.add(m[1])
        for (const m of line.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) {
          const locs = referenced.get(m[1]) ?? []
          if (locs.length < 4) locs.push(`${f.slice(SRC.length + 1)}:${i + 1}`)
          referenced.set(m[1], locs)
        }
      })
    }

    // Sanity: the scan actually saw the token sheet, not an empty walk.
    expect(defined.has('--accent')).toBe(true)
    expect(defined.has('--surface-2')).toBe(true)

    const phantoms = [...referenced.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, locs]) => `${name} (${locs.join(', ')})`)
    expect(phantoms).toEqual([])
  })

  it('no Tailwind colour-literal utilities in TSX (UIUX-69)', () => {
    // "No hardcoded colour" hard rule: a `text-white`/`bg-black` utility paints
    // a literal that ignores the theme tokens (TapeMeasure's Pin badge wore
    // `text-white` on an accent that isn't guaranteed a white foreground —
    // `--on-accent` is the token for that). Scan className strings only.
    const offenders: string[] = []
    for (const f of walk(SRC).filter((p) => p.endsWith('.tsx'))) {
      const lines = readFileSync(f, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!line.includes('className')) return
        if (/\b(?:text|bg|border|ring|fill|stroke)-(?:white|black)\b/.test(line)) {
          offenders.push(`${f.slice(SRC.length + 1)}:${i + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
