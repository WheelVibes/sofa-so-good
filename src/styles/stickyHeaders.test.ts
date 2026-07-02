import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P36 sticky section headers', () => {
  it('pins the layers group header row (.lyr-ghead-row) to the top of the scroll body', () => {
    const f = read('./features.css')
    expect(f).toMatch(/\.lyr-ghead-row\s*\{[^}]*position:\s*sticky/s)
    expect(f).toMatch(/\.lyr-ghead-row\s*\{[^}]*top:\s*0/s)
  })
  it('pins .sec-h and gives both a background + subtle bottom hairline', () => {
    const p = read('./parts.css')
    expect(p).toMatch(/\.sec-h\s*\{[^}]*position:\s*sticky/s)
    expect(p).toMatch(/\.sec-h\s*\{[^}]*box-shadow:\s*0 1px 0 var\(--border\)/s)
  })
})
