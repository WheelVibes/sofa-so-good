import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { defaultPart } from '../../furniture/glbEdit/editSpec'
import { PartInspector } from './PartInspector'

// Swatch thumbnails paint a 2D canvas, which happy-dom doesn't implement —
// stub just the data-URL generator (everything else in the module is real).
vi.mock('../../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

describe('PartInspector — per-part texture picker (GE3c)', () => {
  it('offers the furniture finish vocabulary as `mat:<id>` options, defaulting to solid', () => {
    const onPatch = vi.fn()
    render(<PartInspector part={defaultPart('box')} onPatch={onPatch} onMirror={() => {}} />)
    const select = screen.getByLabelText('Shape texture') as HTMLSelectElement
    expect(select.value).toBe('') // no finish → solid colour
    const values = [...select.options].map((o) => o.value)
    expect(values[0]).toBe('')
    expect(values).toContain('mat:floor-wood-oak') // builtin catalog surfaces
    fireEvent.change(select, { target: { value: 'mat:floor-wood-oak' } })
    expect(onPatch).toHaveBeenCalledWith({ finish: 'mat:floor-wood-oak' })
  })

  it('clears back to the solid colour via the "None" option', () => {
    const onPatch = vi.fn()
    render(
      <PartInspector
        part={{ ...defaultPart('box'), finish: 'mat:floor-wood-oak' }}
        onPatch={onPatch}
        onMirror={() => {}}
      />,
    )
    const select = screen.getByLabelText('Shape texture') as HTMLSelectElement
    expect(select.value).toBe('mat:floor-wood-oak')
    fireEvent.change(select, { target: { value: '' } })
    expect(onPatch).toHaveBeenCalledWith({ finish: undefined })
  })

  it('quick-finish swatches pick a texture; tapping the active one clears it', () => {
    const onPatch = vi.fn()
    const { rerender } = render(
      <PartInspector part={defaultPart('box')} onPatch={onPatch} onMirror={() => {}} />,
    )
    fireEvent.click(screen.getByLabelText('Finish: Oak'))
    expect(onPatch).toHaveBeenLastCalledWith({ finish: 'mat:floor-wood-oak' })
    rerender(
      <PartInspector
        part={{ ...defaultPart('box'), finish: 'mat:floor-wood-oak' }}
        onPatch={onPatch}
        onMirror={() => {}}
      />,
    )
    fireEvent.click(screen.getByLabelText('Finish: Oak'))
    expect(onPatch).toHaveBeenLastCalledWith({ finish: undefined })
  })

  it('hides the roughness/metalness sliders while a texture is set (its maps win)', () => {
    const { rerender } = render(
      <PartInspector part={defaultPart('box')} onPatch={() => {}} onMirror={() => {}} />,
    )
    expect(screen.getByLabelText('box roughness')).toBeInTheDocument()
    expect(screen.getByLabelText('box metalness')).toBeInTheDocument()
    rerender(
      <PartInspector
        part={{ ...defaultPart('box'), finish: 'mat:floor-tile-marble' }}
        onPatch={() => {}}
        onMirror={() => {}}
      />,
    )
    expect(screen.queryByLabelText('box roughness')).toBeNull()
    expect(screen.queryByLabelText('box metalness')).toBeNull()
    // Glow + opacity still apply on top of the texture.
    expect(screen.getByLabelText('box emissiveIntensity')).toBeInTheDocument()
    expect(screen.getByLabelText('box opacity')).toBeInTheDocument()
  })

  it('keeps the existing transform fields (extraction did not change behaviour)', () => {
    const onPatch = vi.fn()
    render(<PartInspector part={defaultPart('box')} onPatch={onPatch} onMirror={() => {}} />)
    fireEvent.change(screen.getByLabelText('box size X'), { target: { value: '0.8' } })
    expect(onPatch).toHaveBeenCalledWith({ size: [0.8, 0.4, 0.4] })
    fireEvent.change(screen.getByLabelText('box rotation Y'), { target: { value: '45' } })
    expect(onPatch).toHaveBeenCalledWith({ rotation: [0, 45, 0] })
  })
})
