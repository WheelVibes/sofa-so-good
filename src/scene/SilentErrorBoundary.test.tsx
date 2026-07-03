// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SilentErrorBoundary } from './SilentErrorBoundary'

function Boom(): never {
  throw new Error('load failed')
}

describe('SilentErrorBoundary', () => {
  it('passes children through when they do not throw', () => {
    const { container } = render(
      <SilentErrorBoundary>
        <span data-testid="ok" />
      </SilentErrorBoundary>,
    )
    expect(container.querySelector('[data-testid="ok"]')).not.toBeNull()
  })

  it('renders the fallback (default nothing) on error instead of crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <SilentErrorBoundary fallback={<span data-testid="fb" />}>
        <Boom />
      </SilentErrorBoundary>,
    )
    expect(container.querySelector('[data-testid="fb"]')).not.toBeNull()
    spy.mockRestore()
  })

  it('recovers (re-renders children) when resetKey changes after a failure', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container, rerender } = render(
      <SilentErrorBoundary resetKey="a">
        <Boom />
      </SilentErrorBoundary>,
    )
    expect(container.textContent).toBe('') // failed → fallback (nothing)
    rerender(
      <SilentErrorBoundary resetKey="b">
        <span data-testid="recovered" />
      </SilentErrorBoundary>,
    )
    expect(container.querySelector('[data-testid="recovered"]')).not.toBeNull()
    spy.mockRestore()
  })
})
