import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P12 row-padding normalization', () => {
  it('.lyr-row uses the compact-row composition var(--s-2) var(--s-3)', () => {
    expect(read('./features.css')).toMatch(/\.lyr-row\s*\{[^}]*padding:\s*var\(--s-2\)\s+var\(--s-3\)/s)
  })
  it('.menu-item and .row use the standard-row s-3 composition', () => {
    const c = read('./components.css')
    expect(c).toMatch(/\.menu-item\s*\{[^}]*padding:\s*var\(--s-3\)/s)
    expect(c).toMatch(/\.row\s*\{[^}]*padding:\s*var\(--s-3\)\s+0/s)
  })
  it('.chip uses the pill-row composition var(--s-3) var(--s-4)', () => {
    expect(read('./parts.css')).toMatch(/\.chip\s*\{[^}]*padding:\s*var\(--s-3\)\s+var\(--s-4\)/s)
  })
  it('leaves no bare px paddings on those four row selectors', () => {
    expect(read('./features.css')).not.toMatch(/\.lyr-row\s*\{[^}]*padding:\s*6px\s+7px/s)
    expect(read('./components.css')).not.toMatch(/\.menu-item\s*\{[^}]*padding:\s*8px\s+9px/s)
  })
})
