// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDisposeOnUnmount } from './geometryUtil'

function Probe({ objs }: { objs: Array<{ dispose: () => void } | null> }) {
  useDisposeOnUnmount(objs)
  return null
}

describe('useDisposeOnUnmount', () => {
  it('disposes every object on unmount, and not before', () => {
    const a = { dispose: vi.fn() }
    const b = { dispose: vi.fn() }
    const { unmount } = render(<Probe objs={[a, b]} />)
    expect(a.dispose).not.toHaveBeenCalled()
    expect(b.dispose).not.toHaveBeenCalled()
    unmount()
    expect(a.dispose).toHaveBeenCalledTimes(1)
    expect(b.dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes the latest set after re-renders (stable across updates)', () => {
    const a = { dispose: vi.fn() }
    const { rerender, unmount } = render(<Probe objs={[a]} />)
    rerender(<Probe objs={[a]} />)
    rerender(<Probe objs={[a]} />)
    expect(a.dispose).not.toHaveBeenCalled() // not disposed on re-render
    unmount()
    expect(a.dispose).toHaveBeenCalledTimes(1) // exactly once on unmount
  })

  it('tolerates null/undefined entries without throwing', () => {
    expect(() => {
      const { unmount } = render(<Probe objs={[null, { dispose: vi.fn() }, null]} />)
      unmount()
    }).not.toThrow()
  })
})
