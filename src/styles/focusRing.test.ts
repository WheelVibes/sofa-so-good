import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P14 unified focus ring', () => {
  it('defines --focus-ring in tokens.css as a 3px accent color-mix', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--focus-ring-w:\s*3px/)
    expect(tokens).toMatch(/--focus-ring:[^;]*color-mix\([^;]*var\(--accent\)/)
  })
  it('applies --focus-ring via a shared :focus-visible rule over every control class', () => {
    const parts = read('./parts.css')
    const components = read('./components.css')
    const css = components + parts
    for (const sel of [
      '.btn',
      '.icon-btn',
      '.tool-btn',
      '.input',
      '.select-trigger',
      '.chip',
      '.tab',
    ]) {
      expect(css).toContain(`${sel}:focus-visible`)
    }
    expect(components).toMatch(/box-shadow:\s*var\(--focus-ring\)/)
  })
  it('hardcodes no colour literals in the new focus block', () => {
    const components = read('./components.css')
    const start = components.indexOf('--- Unified focus ring')
    const end = components.indexOf('--- end unified focus ring', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const block = components.slice(start, end)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
