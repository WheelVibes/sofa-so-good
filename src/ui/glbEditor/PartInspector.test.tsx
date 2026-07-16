// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { defaultPart, type ShapePart } from '../../furniture/glbEdit/editSpec'
import { DesignerContext, type DesignerContextValue } from './designerContext'
import { PartInspector } from './PartInspector'

// Swatch thumbnails paint a 2D canvas, which happy-dom doesn't implement —
// stub just the data-URL generator (everything else in the module is real).
vi.mock('../../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

// PartInspector reads the selected part + edit handlers off the designer context
// (Stage 4a) — mount it with a minimal hand-built value instead of the whole
// provider so the focused finish/slider/transform assertions stay isolated.
function withPart(
  part: ShapePart,
  onPatch: (patch: Partial<ShapePart>) => void,
  onMirror: () => void = () => {},
  onSetRotation: (rotation: [number, number, number]) => void = () => {},
): ReactElement {
  const value = {
    sel: part,
    patchSelectedPart: onPatch,
    setPartRotation: onSetRotation,
    mirror: onMirror,
  } as unknown as DesignerContextValue
  return (
    <DesignerContext.Provider value={value}>
      <PartInspector />
    </DesignerContext.Provider>
  )
}

describe('PartInspector — per-part texture picker (GE3c)', () => {
  it('offers the furniture finish vocabulary as `mat:<id>` options, defaulting to solid', () => {
    const onPatch = vi.fn()
    render(withPart(defaultPart('box'), onPatch))
    // The texture picker is now the custom Select (a combobox button).
    const combo = screen.getByRole('combobox', { name: 'Shape texture' })
    expect(combo).toHaveTextContent('None — solid colour') // no finish → solid colour
    fireEvent.click(combo) // open the listbox
    // Builtin catalog surfaces are listed; pick Oak planks (mat:floor-wood-oak).
    fireEvent.click(screen.getByRole('option', { name: /Oak planks/ }))
    expect(onPatch).toHaveBeenCalledWith({ finish: 'mat:floor-wood-oak' })
  })

  it('clears back to the solid colour via the "None" option', () => {
    const onPatch = vi.fn()
    render(withPart({ ...defaultPart('box'), finish: 'mat:floor-wood-oak' }, onPatch))
    const combo = screen.getByRole('combobox', { name: 'Shape texture' })
    expect(combo).toHaveTextContent('Oak planks')
    fireEvent.click(combo)
    fireEvent.click(screen.getByRole('option', { name: /None — solid colour/ }))
    expect(onPatch).toHaveBeenCalledWith({ finish: undefined })
  })

  it('quick-finish swatches pick a texture; tapping the active one clears it', () => {
    const onPatch = vi.fn()
    const { rerender } = render(withPart(defaultPart('box'), onPatch))
    fireEvent.click(screen.getByLabelText('Finish: Oak'))
    expect(onPatch).toHaveBeenLastCalledWith({ finish: 'mat:floor-wood-oak' })
    rerender(withPart({ ...defaultPart('box'), finish: 'mat:floor-wood-oak' }, onPatch))
    fireEvent.click(screen.getByLabelText('Finish: Oak'))
    expect(onPatch).toHaveBeenLastCalledWith({ finish: undefined })
  })

  it('hides the roughness/metalness sliders while a texture is set (its maps win)', () => {
    const { rerender } = render(withPart(defaultPart('box'), () => {}))
    expect(screen.getByLabelText('box roughness')).toBeInTheDocument()
    expect(screen.getByLabelText('box metalness')).toBeInTheDocument()
    rerender(withPart({ ...defaultPart('box'), finish: 'mat:floor-tile-marble' }, () => {}))
    expect(screen.queryByLabelText('box roughness')).toBeNull()
    expect(screen.queryByLabelText('box metalness')).toBeNull()
    // Glow + opacity still apply on top of the texture.
    expect(screen.getByLabelText('box emissiveIntensity')).toBeInTheDocument()
    expect(screen.getByLabelText('box opacity')).toBeInTheDocument()
  })

  it('keeps the existing transform fields (extraction did not change behaviour)', () => {
    const onPatch = vi.fn()
    const onSetRotation = vi.fn()
    render(withPart(defaultPart('box'), onPatch, () => {}, onSetRotation))
    fireEvent.change(screen.getByLabelText('box size X'), { target: { value: '0.8' } })
    expect(onPatch).toHaveBeenCalledWith({ size: [0.8, 0.4, 0.4] })
    // Rotation routes through the pivot-aware `setPartRotation` (Stage 6d), not the
    // plain patch — so the pivot compensation applies whether typed or dragged.
    fireEvent.change(screen.getByLabelText('box rotation Y'), { target: { value: '45' } })
    expect(onSetRotation).toHaveBeenCalledWith([0, 45, 0])
  })
})
