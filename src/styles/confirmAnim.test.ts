import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P5 success/confirm micro-animations', () => {
  it('pops the success toast checkmark via a scale keyframe', () => {
    const f = read('./features.css')
    expect(f).toMatch(/@keyframes checkPop/)
    expect(f).toMatch(/\.toast .icn\.pop\s*\{[^}]*animation:\s*checkPop/s)
  })
  it('gives EditConfirmBar a slide-down leave and a shake reject (translateX preserved)', () => {
    const p = read('./parts.css')
    expect(p).toMatch(/@keyframes editConfirmLeave/)
    expect(p).toMatch(/@keyframes editConfirmShake/)
    expect(p).toMatch(/editConfirmLeave\s*\{[^}]*translateX\(-50%\)/s)
  })
})
