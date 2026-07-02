import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P10 panel width tokens', () => {
  it('defines --panel-w 320px and --panel-w-compact 288px', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--panel-w:\s*320px/)
    expect(tokens).toMatch(/--panel-w-compact:\s*288px/)
  })
  it('drives the floating catalog/inspector/finish widths off --panel-w', () => {
    expect(read('./parts.css')).toMatch(/\.catalog\s*\{[^}]*width:\s*var\(--panel-w\)/s)
    expect(read('./parts.css')).toMatch(/\.inspector\s*\{[^}]*width:\s*var\(--panel-w\)/s)
    expect(read('./flows.css')).toMatch(/\.er-finish\s*\{[^}]*width:\s*var\(--panel-w\)/s)
  })
  it('drives the tablet variants off --panel-w-compact and leaves no bare 326/312px', () => {
    const r = read('./responsive.css')
    expect(r).toMatch(/\.catalog\s*\{\s*width:\s*var\(--panel-w-compact\)/)
    expect(read('./parts.css')).not.toMatch(/\.catalog\s*\{[^}]*width:\s*326px/s)
    expect(read('./flows.css')).not.toMatch(/\.er-finish\s*\{[^}]*width:\s*312px/s)
  })
})
