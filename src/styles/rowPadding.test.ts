import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// P12 normalized row paddings onto the --s scale; P38's density indirection then
// rebased the row rules onto --row-pad-y/-x (seeded from that scale). These
// tests pin the CURRENT contract: rows consume the density tokens, and no bare
// px paddings remain on the row selectors. The token values + compact override
// themselves are pinned by density.test.ts.
describe('P12/P38 row padding contract', () => {
  it('.lyr-row consumes the density tokens via the tighter calc composition', () => {
    expect(read('./features.css')).toMatch(
      /\.lyr-row\s*\{[^}]*padding:\s*calc\(var\(--row-pad-y\) - 2px\)\s+calc\(var\(--row-pad-x\) - 2px\)/s,
    )
  })
  it('.menu-item consumes the density tokens; .row keeps the s-scale composition', () => {
    const c = read('./components.css')
    expect(c).toMatch(/\.menu-item\s*\{[^}]*padding:\s*var\(--row-pad-y\)\s+var\(--row-pad-x\)/s)
    expect(c).toMatch(/\.row\s*\{[^}]*padding:\s*var\(--s-3\)\s+0/s)
  })
  it('.chip keeps the pill composition var(--s-3) var(--s-4)', () => {
    expect(read('./parts.css')).toMatch(/\.chip\s*\{[^}]*padding:\s*var\(--s-3\)\s+var\(--s-4\)/s)
  })
  it('leaves no bare px paddings on the row selectors', () => {
    expect(read('./features.css')).not.toMatch(/\.lyr-row\s*\{[^}]*padding:\s*6px\s+7px/s)
    expect(read('./components.css')).not.toMatch(/\.menu-item\s*\{[^}]*padding:\s*8px\s+9px/s)
    expect(read('./components.css')).not.toMatch(/\.menu-item\s*\{[^}]*padding:\s*var\(--s-3\);/s)
  })
})
