// @vitest-environment happy-dom
/**
 * UIUX-34: useSlideDir reports which way a tab selection travelled — null on
 * mount (no slide), 'right' for a higher index, 'left' for lower.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSlideDir } from './useSlideDir'

describe('useSlideDir (UIUX-34)', () => {
  it('is null on first render, then tracks travel direction', () => {
    const { result, rerender } = renderHook(({ i }) => useSlideDir(i), {
      initialProps: { i: 0 },
    })
    expect(result.current).toBeNull()
    rerender({ i: 2 })
    expect(result.current).toBe('right')
    rerender({ i: 1 })
    expect(result.current).toBe('left')
    rerender({ i: 1 })
    expect(result.current).toBeNull()
  })
})
