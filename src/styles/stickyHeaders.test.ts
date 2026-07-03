import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P36 sticky section headers', () => {
  it('pins the layers group header row (.lyr-ghead-row) to the top of the scroll body', () => {
    const f = read('./features.css')
    expect(f).toMatch(/\.lyr-ghead-row\s*\{[^}]*position:\s*sticky/s)
    expect(f).toMatch(/\.lyr-ghead-row\s*\{[^}]*top:\s*0/s)
  })
  it('pins .sec-h and gives both a background + subtle bottom hairline', () => {
    const p = read('./parts.css')
    expect(p).toMatch(/\.sec-h\s*\{[^}]*position:\s*sticky/s)
    expect(p).toMatch(/\.sec-h\s*\{[^}]*box-shadow:\s*0 1px 0 var\(--border\)/s)
  })
  it('.sec-h background is overridable per-container via --sec-h-bg (falls back to --surface)', () => {
    // The default (anchored glass panels — catalog/inspector/budget) keeps the
    // translucent --surface it always had. Containers that go opaque (modal
    // dialogs) override --sec-h-bg to the same opaque tone so the sticky
    // header composites to an identical colour as the card behind it instead
    // of double-compositing a second translucent layer (the "white bar" bug).
    const p = read('./parts.css')
    expect(p).toMatch(/\.sec-h\s*\{[^}]*background:\s*var\(--sec-h-bg,\s*var\(--surface\)\)/s)
  })
  it('modal dialogs go opaque and pin --sec-h-bg to match, so their sticky headers seam-lessly match the card', () => {
    const c = read('./components.css')
    expect(c).toMatch(/\.modal-overlay > \.panel\s*\{[^}]*background:\s*var\(--surface-solid\)/s)
    expect(c).toMatch(/\.modal-overlay > \.panel\s*\{[^}]*--sec-h-bg:\s*var\(--surface-solid\)/s)
  })
})
