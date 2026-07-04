// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MaterialDef } from '../../materials/types'
import { MaterialComposer } from './MaterialComposer'

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
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    }
  })

  it('seeds a plain catalog material as the tint base, so Apply yields a tint of THAT material', () => {
    const onApply = vi.fn()
    render(
      <MaterialComposer label="Floor" active="floor-wood-oak" materials={[WOOD]} onApply={onApply} />,
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
