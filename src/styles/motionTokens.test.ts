import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P1 motion scale tokens', () => {
  it('defines the --dur-1/-2/-3 scale (~150/300/600ms) in tokens.css', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--dur-1:\s*150ms/)
    expect(tokens).toMatch(/--dur-2:\s*300ms/)
    expect(tokens).toMatch(/--dur-3:\s*600ms/)
  })
  it('defines the easeOutExpo entrance easing token', () => {
    expect(read('./tokens.css')).toMatch(/--ease-out:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/)
  })
  it('keeps the existing --dur/--ease tokens intact', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--dur:\s*0\.16s/)
    expect(tokens).toMatch(/--ease:\s*cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\)/)
  })
})
