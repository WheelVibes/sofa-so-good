import { describe, expect, it } from 'vitest'
import { pageWindow } from './pageWindow'

describe('pageWindow', () => {
  it('returns a full first page when the list exceeds the page size', () => {
    expect(pageWindow(120, 50, 0)).toEqual({ page: 0, start: 0, end: 50, pageCount: 3 })
  })

  it('caps the last page at the item count', () => {
    expect(pageWindow(120, 50, 2)).toEqual({ page: 2, start: 100, end: 120, pageCount: 3 })
  })

  it('clamps a page past the end back to the last valid page (list shrank)', () => {
    expect(pageWindow(30, 50, 4)).toEqual({ page: 0, start: 0, end: 30, pageCount: 1 })
  })

  it('clamps a negative page to the first page', () => {
    expect(pageWindow(120, 50, -3)).toEqual({ page: 0, start: 0, end: 50, pageCount: 3 })
  })

  it('handles an empty list (one empty page, no negative bounds)', () => {
    expect(pageWindow(0, 50, 0)).toEqual({ page: 0, start: 0, end: 0, pageCount: 1 })
  })

  it('handles an exact multiple of the page size', () => {
    expect(pageWindow(100, 50, 1)).toEqual({ page: 1, start: 50, end: 100, pageCount: 2 })
  })

  it('treats a single item as one page', () => {
    expect(pageWindow(1, 50, 0)).toEqual({ page: 0, start: 0, end: 1, pageCount: 1 })
  })

  it('guards against a non-positive page size', () => {
    expect(pageWindow(10, 0, 0)).toEqual({ page: 0, start: 0, end: 10, pageCount: 1 })
  })
})
