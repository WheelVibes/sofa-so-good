import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf-8')
const components = readFileSync(join(__dirname, 'components.css'), 'utf-8')

describe('density tokens (P38)', () => {
  it('the token root defines --row-pad-y and --row-pad-x', () => {
    expect(tokens).toMatch(/:root\s*{[^}]*--row-pad-y:\s*[^;]+;/s)
    expect(tokens).toMatch(/:root\s*{[^}]*--row-pad-x:\s*[^;]+;/s)
  })

  it('.menu-item consumes var(--row-pad-y) (and --row-pad-x)', () => {
    const rule = components.match(/\.menu-item\s*{[^}]*}/s)?.[0] ?? ''
    expect(rule).toMatch(/padding:\s*var\(--row-pad-y\)\s+var\(--row-pad-x\)/)
  })

  it('a [data-density="compact"] block overrides --row-pad-y', () => {
    const compactBlock = tokens.match(/\[data-density=['"]compact['"]\]\s*{[^}]*}/s)?.[0] ?? ''
    expect(compactBlock).toMatch(/--row-pad-y:\s*[^;]+;/)
  })

  it('has no colour literal (hex/rgb/oklch/named) in the compact override block', () => {
    const compactBlock = tokens.match(/\[data-density=['"]compact['"]\]\s*{[^}]*}/s)?.[0] ?? ''
    expect(compactBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(compactBlock).not.toMatch(/\brgb\(|\brgba\(|\boklch\(/)
  })
})
