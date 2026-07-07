// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MaterialDef } from '../../materials/types'
import { useStore } from '../../state/store'
import { MaterialComposer } from './MaterialComposer'

// The textured-base repaint preview loads + recolours an image — resolve null
// (the flat colour-block fallback) so no canvas/network work runs in happy-dom.
vi.mock('../../materials/recolor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recolorThumbnailDataUrl: async () => null,
}))

// A textured (photo) floor material — the exact case bug #1 is about: recolour
// it while KEEPING its texture. `textured` kind → no procedural canvas preview,
// so the composer renders cleanly in happy-dom.
const WOOD: MaterialDef = {
  id: 'floor-wood-oak',
  name: 'Oak',
  category: 'floor',
  kind: 'textured',
  source: 'polyhaven',
  swatch: '#b88f5d',
  textures: { albedo: 'https://example.test/oak_albedo.jpg' },
  uvScale: [1, 1],
}

describe('MaterialComposer — recolour keeps the picked texture (bug #1)', () => {
  beforeEach(() => {
    // Some ColorPicker internals touch matchMedia; stub it for happy-dom.
    if (!window.matchMedia) {
      // @ts-expect-error test stub
      window.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      })
    }
  })

  it('seeds a plain catalog material as the tint base, so Apply yields a tint of THAT material', () => {
    const onApply = vi.fn()
    render(
      <MaterialComposer
        label="Floor"
        active="floor-wood-oak"
        materials={[WOOD]}
        onApply={onApply}
      />,
    )
    // Open the "Compose your own…" disclosure.
    fireEvent.click(screen.getByText('Compose your own…'))
    // Apply immediately: with the active plain material seeded as the base and a
    // white (identity) colour, the composed id is a TINT of that material — i.e.
    // its texture is retained, only recolourable — not a procedural pattern.
    fireEvent.click(screen.getByRole('button', { name: /Apply composed floor finish/i }))
    expect(onApply).toHaveBeenCalledOnce()
    const id = onApply.mock.calls[0][0] as string
    expect(id.startsWith('tint:floor-wood-oak:')).toBe(true)
  })
})

// A flat painted colour — no texture to repaint, so no mode control.
const PAINT: MaterialDef = {
  id: 'wall-solid-sage',
  name: 'Sage paint',
  category: 'wall',
  swatch: '#9caf88',
  kind: 'solid',
}

describe('MaterialComposer — Repaint/Shade colour mode (FINISH-RECOLOR)', () => {
  beforeEach(() => {
    if (!window.matchMedia) {
      // @ts-expect-error test stub
      window.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      })
    }
  })

  afterEach(() => {
    useStore.getState().__resetForTest?.()
  })

  it('shows the mode control for a textured base and builds a repaint (!r) id by default', () => {
    const onApply = vi.fn()
    render(
      <MaterialComposer
        label="Floor"
        active="floor-wood-oak"
        materials={[WOOD]}
        onApply={onApply}
      />,
    )
    fireEvent.click(screen.getByText('Compose your own…'))
    const seg = screen.getByRole('group', { name: 'Floor colour mode' })
    expect(seg).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Repaint' })).toHaveClass('on')
    fireEvent.click(screen.getByRole('button', { name: /Apply composed floor finish/i }))
    expect(onApply).toHaveBeenCalledWith('tint:floor-wood-oak:#ffffff!r')
  })

  it('builds the legacy multiply id (no !r) in Shade mode', () => {
    const onApply = vi.fn()
    render(
      <MaterialComposer
        label="Floor"
        active="floor-wood-oak"
        materials={[WOOD]}
        onApply={onApply}
      />,
    )
    fireEvent.click(screen.getByText('Compose your own…'))
    fireEvent.click(screen.getByRole('button', { name: 'Shade' }))
    fireEvent.click(screen.getByRole('button', { name: /Apply composed floor finish/i }))
    expect(onApply).toHaveBeenCalledWith('tint:floor-wood-oak:#ffffff')
  })

  it('seeds Shade from an active legacy multiply tint id (no !r token)', () => {
    render(
      <MaterialComposer
        label="Floor"
        active="tint:floor-wood-oak:#ff0000"
        materials={[WOOD]}
        onApply={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Compose your own…'))
    expect(screen.getByRole('button', { name: 'Shade' })).toHaveClass('on')
    expect(screen.getByRole('button', { name: 'Repaint' })).not.toHaveClass('on')
  })

  it('hides the mode control for a non-textured (solid paint) base', () => {
    render(
      <MaterialComposer
        label="Walls"
        active="wall-solid-sage"
        materials={[PAINT]}
        onApply={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Compose your own…'))
    expect(screen.queryByRole('group', { name: 'Walls colour mode' })).toBeNull()
  })

  it('hides the mode control and keeps legacy id building when the flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, finishRecolor: false },
    })
    const onApply = vi.fn()
    render(
      <MaterialComposer
        label="Floor"
        active="floor-wood-oak"
        materials={[WOOD]}
        onApply={onApply}
      />,
    )
    fireEvent.click(screen.getByText('Compose your own…'))
    expect(screen.queryByRole('group', { name: 'Floor colour mode' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Apply composed floor finish/i }))
    expect(onApply).toHaveBeenCalledWith('tint:floor-wood-oak:#ffffff')
  })
})
