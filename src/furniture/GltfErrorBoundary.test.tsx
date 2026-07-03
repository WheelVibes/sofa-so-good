// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GltfErrorBoundary } from './GltfErrorBoundary'

function Boom(): never {
  throw new Error('GLB failed to load')
}

describe('GltfErrorBoundary', () => {
  it('renders children when they do not throw', () => {
    const { container } = render(
      <GltfErrorBoundary width={1} depth={1} height={1}>
        <mesh data-testid="model" />
      </GltfErrorBoundary>,
    )
    expect(container.querySelector('[data-testid="model"]')).not.toBeNull()
    expect(container.querySelector('boxGeometry')).toBeNull() // no fallback box
  })

  it('catches a throwing child and renders the placeholder box instead of crashing', () => {
    // Silence React's expected error log for the caught boundary error.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <GltfErrorBoundary width={2} depth={1} height={0.8}>
        <Boom />
      </GltfErrorBoundary>,
    )
    // The boundary swallowed the throw and rendered a fallback mesh + box.
    expect(container.querySelector('boxGeometry')).not.toBeNull()
    spy.mockRestore()
  })
})
