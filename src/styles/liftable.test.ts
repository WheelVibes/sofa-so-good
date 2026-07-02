import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P4 unified hover-lift', () => {
  it('defines one .liftable:hover lift using translateY(-2px) + --shadow-pop', () => {
    const c = read('./components.css')
    expect(c).toMatch(/\.liftable:hover\s*[^{]*\{[^}]*transform:\s*translateY\(-2px\)/s)
    expect(c).toMatch(/\.liftable:hover\s*[^{]*\{[^}]*box-shadow:\s*var\(--shadow-pop\)/s)
  })
  it('applies the lift to preset-card via the shared selector group', () => {
    expect(read('./components.css')).toMatch(/\.preset-card/)
  })
  it('no longer stacks a duplicate transform on the per-card hover rules', () => {
    expect(read('./parts.css')).not.toMatch(/\.cat-card:hover\s*\{[^}]*translateY/s)
    expect(read('./features.css')).not.toMatch(/\.swap-card:hover\s*\{[^}]*translateY/s)
    expect(read('./flows.css')).not.toMatch(/\.preset-card:hover\s*\{[^}]*translateY/s)
  })
})
