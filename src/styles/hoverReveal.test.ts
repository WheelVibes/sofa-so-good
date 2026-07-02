import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P13 hover-reveal row actions', () => {
  it('reveals .lyr-acts on hover, selection, and keyboard focus-within', () => {
    const f = read('./features.css')
    expect(f).toMatch(/\.lyr-row:focus-within\s+\.lyr-acts/)
    expect(f).toMatch(/\.lyr-row:hover\s+\.lyr-acts/)
  })
  it('keeps .lyr-acts always visible on touch (body.mobile)', () => {
    const r = read('./responsive.css')
    expect(r).toMatch(/\.lyr-acts\s*\{[^}]*opacity:\s*1/s)
  })
})
