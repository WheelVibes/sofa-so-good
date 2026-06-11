import { describe, expect, it } from 'vitest'
import {
  EMPTY_GALLERY,
  type GalleryState,
  galleryReducer,
  ORIGINAL_ID,
  selectedEntry,
} from './variantGallery'

const seeded = (): GalleryState => galleryReducer(EMPTY_GALLERY, { type: 'seed', url: 'u0' })

describe('galleryReducer', () => {
  it('seed restarts the gallery with the original selected', () => {
    const s = seeded()
    expect(s.entries).toEqual([{ id: ORIGINAL_ID, label: 'Original', url: 'u0' }])
    expect(s.selectedId).toBe(ORIGINAL_ID)
    expect(s.pendingId).toBeNull()
    expect(selectedEntry(s)?.url).toBe('u0')
  })

  it('start → success appends the variant and selects it', () => {
    let s = seeded()
    s = galleryReducer(s, { type: 'start', id: 'japandi' })
    expect(s.pendingId).toBe('japandi')
    s = galleryReducer(s, { type: 'success', id: 'japandi', label: 'Japandi', url: 'u1' })
    expect(s.entries.map((e) => e.id)).toEqual([ORIGINAL_ID, 'japandi'])
    expect(s.selectedId).toBe('japandi')
    expect(s.pendingId).toBeNull()
  })

  it('only one variant runs at a time', () => {
    let s = seeded()
    s = galleryReducer(s, { type: 'start', id: 'japandi' })
    const blocked = galleryReducer(s, { type: 'start', id: 'luxury' })
    expect(blocked).toBe(s) // second start ignored while pending
  })

  it('cannot start before a seed exists', () => {
    expect(galleryReducer(EMPTY_GALLERY, { type: 'start', id: 'japandi' })).toBe(EMPTY_GALLERY)
  })

  it('re-running a style replaces its entry in place (no duplicates)', () => {
    let s = seeded()
    s = galleryReducer(s, { type: 'start', id: 'japandi' })
    s = galleryReducer(s, { type: 'success', id: 'japandi', label: 'Japandi', url: 'u1' })
    s = galleryReducer(s, { type: 'start', id: 'japandi' })
    s = galleryReducer(s, { type: 'success', id: 'japandi', label: 'Japandi', url: 'u2' })
    expect(s.entries.map((e) => e.id)).toEqual([ORIGINAL_ID, 'japandi'])
    expect(s.entries[1].url).toBe('u2')
  })

  it('fail surfaces the message, keeps existing entries, clears pending', () => {
    let s = seeded()
    s = galleryReducer(s, { type: 'start', id: 'luxury' })
    s = galleryReducer(s, { type: 'fail', id: 'luxury', message: 'Invalid API key.' })
    expect(s.error).toBe('Invalid API key.')
    expect(s.pendingId).toBeNull()
    expect(s.entries).toHaveLength(1)
    // next start clears the error
    s = galleryReducer(s, { type: 'start', id: 'tropical' })
    expect(s.error).toBeNull()
  })

  it('drops a stale success/fail after the gallery was re-seeded', () => {
    let s = seeded()
    s = galleryReducer(s, { type: 'start', id: 'japandi' })
    s = galleryReducer(s, { type: 'seed', url: 'u0b' }) // user re-ran Make photoreal
    const after = galleryReducer(s, { type: 'success', id: 'japandi', label: 'Japandi', url: 'u1' })
    expect(after).toBe(s)
    expect(galleryReducer(s, { type: 'fail', id: 'japandi', message: 'x' })).toBe(s)
  })

  it('select switches between known entries and ignores unknown ids', () => {
    let s = seeded()
    s = galleryReducer(s, { type: 'start', id: 'japandi' })
    s = galleryReducer(s, { type: 'success', id: 'japandi', label: 'Japandi', url: 'u1' })
    s = galleryReducer(s, { type: 'select', id: ORIGINAL_ID })
    expect(selectedEntry(s)?.url).toBe('u0')
    expect(galleryReducer(s, { type: 'select', id: 'nope' })).toBe(s)
  })

  it('reset returns to the empty gallery', () => {
    const s = galleryReducer(seeded(), { type: 'reset' })
    expect(s).toEqual(EMPTY_GALLERY)
    expect(selectedEntry(s)).toBeNull()
  })
})
