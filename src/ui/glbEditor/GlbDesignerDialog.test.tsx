import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { GlbDesignerDialog } from './GlbDesignerDialog'

// The designer's preview is a full R3F canvas — happy-dom has no WebGL, so stub
// the renderer layer; everything outside the <Canvas> (the controls we assert
// on) renders for real.
vi.mock('@react-three/fiber', () => ({
  Canvas: () => null,
}))
vi.mock('@react-three/drei', () => ({
  Bounds: () => null,
  OrbitControls: () => null,
  TransformControls: () => null,
  useGLTF: () => ({ scene: null }),
}))
// Swatch thumbnails paint a 2D canvas (not implemented in happy-dom).
vi.mock('../../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

describe('GlbDesignerDialog — Simple/Pro gating + per-part texture picker', () => {
  afterEach(() => {
    useStore.getState().setGlbDesignerOpen(false)
    useStore.getState().setUiMode('simple')
  })

  it('renders nothing in Simple mode even when opened (pro-only tool)', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().setGlbDesignerOpen(true)
    render(<GlbDesignerDialog />)
    expect(screen.queryByText('3D asset designer')).toBeNull()
  })

  it('in Pro mode, a selected part exposes the texture picker (GE3c)', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().setGlbDesignerOpen(true)
    render(<GlbDesignerDialog />)
    expect(screen.getByText('3D asset designer')).toBeInTheDocument()
    // Add a box — it auto-selects, mounting the part inspector.
    fireEvent.click(screen.getByText('Box'))
    const select = screen.getByLabelText('Shape texture') as HTMLSelectElement
    expect(select.value).toBe('')
    fireEvent.change(select, { target: { value: 'mat:floor-wood-oak' } })
    // The controlled select reflects the spec — the finish was committed.
    expect((screen.getByLabelText('Shape texture') as HTMLSelectElement).value).toBe(
      'mat:floor-wood-oak',
    )
    // Curated one-tap swatches are there too.
    expect(screen.getByLabelText('Finish: Marble')).toBeInTheDocument()
  })
})
