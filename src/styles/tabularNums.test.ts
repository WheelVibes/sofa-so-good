import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P21 tabular numerals', () => {
  it('sets tabular-nums on .fld .val, .num input and budget HUD readouts', () => {
    const app = read('./app.css')
    const components = read('./components.css')
    const parts = read('./parts.css')
    expect(app).toMatch(/\.fld \.val\b[^}]*font-variant-numeric:\s*tabular-nums/s)
    expect(components).toMatch(/\.num input\b[^}]*font-variant-numeric:\s*tabular-nums/s)
    expect(parts).toMatch(/\.budget-hud-spent[^}]*font-variant-numeric:\s*tabular-nums/s)
  })
  it('keeps dimension readouts tabular via .mono tnum', () => {
    expect(read('./components.css')).toMatch(/\.mono\b[^}]*font-feature-settings:\s*'tnum'\s*1/s)
  })
})
