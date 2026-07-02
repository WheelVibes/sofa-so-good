import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('P6 screen-transition crossfade', () => {
  it('fades the floor-plan editor in on mount using --dur-2 + --ease-out with backwards fill', () => {
    const c = read('./screens.css')
    expect(c).toMatch(/@keyframes screenFadeIn\b/)
    expect(c).toMatch(
      /\.plan-screen\s*\{[^}]*animation:\s*screenFadeIn var\(--dur-2\) var\(--ease-out\) backwards/s,
    )
    expect(c).not.toMatch(/screenFadeIn var\(--dur-2\) var\(--ease-out\) both/)
  })
  it('uses no colour literal in the keyframe', () => {
    const kf = read('./screens.css').match(/@keyframes screenFadeIn\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(kf).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|oklch/i)
  })
})
