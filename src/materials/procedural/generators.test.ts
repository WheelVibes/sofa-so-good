import { describe, expect, it } from 'vitest'
import { getProceduralBaseSize, setProceduralBaseSize } from './generators'

describe('quality-aware base size (PERF9)', () => {
  it('round-trips the configured base size (generation itself needs a real canvas)', () => {
    expect(getProceduralBaseSize()).toBe(512) // module default
    setProceduralBaseSize(256)
    expect(getProceduralBaseSize()).toBe(256)
    setProceduralBaseSize(512)
    expect(getProceduralBaseSize()).toBe(512)
  })
})
