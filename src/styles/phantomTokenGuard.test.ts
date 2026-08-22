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

/**
 * Blank out comment bodies while preserving line structure, so a guard scans
 * declarations rather than the prose explaining them. (A previous guard matched
 * its own comment quoting the literal it bans — the fix is to look at code.)
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
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

  it('no colour literals in DOM style objects (UIUX-76)', () => {
    // The className scan below and the CSS-file guards both miss an inline
    // React `style={{ background: 'rgba(0,0,0,0.45)' }}` — which is how four
    // compare modals ended up painting an off-theme scrim chip next to a
    // correctly tokenised accent sibling, and how the drag-select marquee kept a
    // Tailwind-palette blue. Only DOM surfaces are scanned: three material
    // colours (`furniture/`, `apartment/`, `scene/` meshes), colour-PICKER
    // instruments and finish-swatch data are real pigment values, not themed
    // surfaces, so their directories are exempt.
    // `ColorPicker`'s SV pad paints `hsl(<hue>, 100%, 50%)` as the instrument's
    // own base — the value IS the colour being picked, not a themed surface.
    const EXEMPT =
      /^(?:furniture|apartment|materials|analysis|export|floorplan|state|utils|scene)\/|^ui\/controls\/ColorPicker\.tsx$/
    // The colour-valued CSS properties a themed surface would use. `color:` on
    // its own is excluded — it is also the property name for pigment data.
    const PROPS =
      /\b(?:background|backgroundColor|borderColor|boxShadow|outlineColor|textShadow|caretColor|border|outline|textDecorationColor)\s*:\s*[`'"][^`'"]*(?:rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b)/
    // Self-check: the scan must still bite after comment-stripping, and must
    // not fire on the tokenised form it is steering people towards.
    expect(PROPS.test("background: 'rgba(0,0,0,0.45)',")).toBe(true)
    expect(PROPS.test("border: '1px solid #3b82f6',")).toBe(true)
    expect(PROPS.test("background: 'var(--surface-solid)',")).toBe(false)
    expect(stripComments("/* background: '#fff' */").trim()).toBe('')

    const offenders: string[] = []
    for (const f of walk(SRC).filter((p) => p.endsWith('.tsx'))) {
      const rel = f.slice(SRC.length + 1)
      if (EXEMPT.test(rel)) continue
      stripComments(readFileSync(f, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (PROPS.test(line)) offenders.push(`${rel}:${i + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it('no colour-literal fallbacks inside a var() (UIUX-76)', () => {
    // `var(--on-accent, #fff)` hides a real token behind a literal: if the token
    // is ever renamed the surface silently goes off-theme instead of breaking
    // loudly. Same objection as a phantom reference.
    const RX = /var\(\s*--[\w-]+\s*,\s*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/
    expect(RX.test('color: var(--on-accent, #fff);')).toBe(true)
    // A var() falling back to another var() is fine — still no literal.
    expect(RX.test('background: var(--sec-h-bg, var(--surface-solid));')).toBe(false)

    const offenders: string[] = []
    for (const f of walk(SRC)) {
      const rel = f.slice(SRC.length + 1)
      stripComments(readFileSync(f, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (RX.test(line)) {
            offenders.push(`${rel}:${i + 1}`)
          }
        })
    }
    expect(offenders).toEqual([])
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
