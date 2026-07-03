import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P20 line-height tokens', () => {
  it('defines --lh-tight 1.25 and --lh-body 1.5 in tokens.css', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--lh-tight:\s*1\.25/)
    expect(tokens).toMatch(/--lh-body:\s*1\.5/)
  })
  it('applies --lh-body to multiline descriptions and empty states', () => {
    const features = read('./features.css')
    const flows = read('./flows.css')
    expect(features).toMatch(/\.empty-mini span\b[^}]*line-height:\s*var\(--lh-body\)/s)
    expect(features).toMatch(/\.ci-detail\b[^}]*line-height:\s*var\(--lh-body\)/s)
    expect(flows).toMatch(/\.empty-sub\b[^}]*line-height:\s*var\(--lh-body\)/s)
    expect(flows).toMatch(/\.onb-lede\b[^}]*line-height:\s*var\(--lh-body\)/s)
  })
  it('uses --lh-body (not a hand-tuned near-value) on other multiline reading copy', () => {
    // `.preset-desc` and `.help-list li` were guarded here too until both were
    // pruned as dead CSS (see CHANGELOG v0.11.2.1) — only live selectors stay.
    const features = read('./features.css')
    const flows = read('./flows.css')
    expect(flows).toMatch(/\.ss-card-desc\b[^}]*line-height:\s*var\(--lh-body\)/s)
    expect(features).toMatch(/\.stamp-banner-text\b[^}]*line-height:\s*var\(--lh-body\)/s)
  })
})
