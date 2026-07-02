import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P17 skeleton loader', () => {
  it('defines a token-only shimmer with a background-position keyframe', () => {
    const p = read('./parts.css')
    expect(p).toMatch(/\.skeleton\s*\{[^}]*animation:\s*skeletonShimmer/s)
    expect(p).toMatch(/@keyframes skeletonShimmer/)
    expect(p).toMatch(/\.skeleton\s*\{[^}]*var\(--surface-3\)/s)
  })
  it('uses no colour literal in the skeleton rule', () => {
    const block = read('./parts.css').match(/\.skeleton\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(block).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|oklch/i)
  })
})
