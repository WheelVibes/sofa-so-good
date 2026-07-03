// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('kaboom in render')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // The boundary logs the caught error; silence it for clean test output.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('safe content')).toBeInTheDocument()
  })

  it('shows the recovery card and scope when a child throws', () => {
    render(
      <ErrorBoundary scope="3D scene">
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/Something went wrong in the 3D scene/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByText(/kaboom in render/)).toBeInTheDocument()
  })

  it('supports a custom fallback renderer', () => {
    render(
      <ErrorBoundary fallback={(err) => <div>custom: {err.message}</div>}>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('custom: kaboom in render')).toBeInTheDocument()
  })

  it('passes a reset callback to the fallback', () => {
    const reset = vi.fn()
    let captured: (() => void) | null = null
    render(
      <ErrorBoundary
        fallback={(_err, r) => {
          captured = r
          return <div>fallback</div>
        }}
      >
        <Boom />
      </ErrorBoundary>,
    )
    expect(typeof captured).toBe('function')
    // The reset callback is a real function (not the spy); just assert it's callable.
    expect(() => captured?.()).not.toThrow()
    expect(reset).not.toHaveBeenCalled()
  })
})
