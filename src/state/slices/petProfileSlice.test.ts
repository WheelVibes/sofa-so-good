import { beforeEach, describe, expect, it } from 'vitest'
import { applySerialized, serialize } from '../schema'
import { useStore } from '../store'
import { normalisePetTypes } from './petProfileSlice'

describe('petProfileSlice', () => {
  beforeEach(() => {
    useStore.getState().setPetTypes([])
  })

  it('starts empty', () => {
    expect(useStore.getState().petTypes).toEqual([])
  })

  it('toggles a pet type on and off (canonical order kept)', () => {
    useStore.getState().togglePetType('cat')
    expect(useStore.getState().petTypes).toEqual(['cat'])
    useStore.getState().togglePetType('dog')
    // canonical PET_TYPES order puts dog before cat
    expect(useStore.getState().petTypes).toEqual(['dog', 'cat'])
    useStore.getState().togglePetType('cat')
    expect(useStore.getState().petTypes).toEqual(['dog'])
  })

  it('setPetTypes dedupes + canonicalises order', () => {
    useStore.getState().setPetTypes(['fish', 'cat', 'cat', 'dog'])
    // canonical order is dog, cat, ..., fish
    expect(useStore.getState().petTypes).toEqual(['dog', 'cat', 'fish'])
  })

  it('normalisePetTypes drops unknown values', () => {
    expect(normalisePetTypes(['cat', 'small-pet', 'dragon', 'dog'])).toEqual(['dog', 'cat'])
  })

  it('round-trips petTypes through serialize / applySerialized', () => {
    useStore.getState().setPetTypes(['cat', 'fish'])
    const out = serialize(useStore.getState())
    expect(out.petTypes).toEqual(['cat', 'fish'])
    const patch = applySerialized(out, new Set())
    expect(patch.petTypes).toEqual(['cat', 'fish'])
  })

  it('omits petTypes from serialize when empty (lean saves)', () => {
    useStore.getState().setPetTypes([])
    const out = serialize(useStore.getState())
    expect(out.petTypes).toBeUndefined()
    // and load defaults it back to []
    const patch = applySerialized({ ...out } as never, new Set())
    expect(patch.petTypes).toEqual([])
  })
})
