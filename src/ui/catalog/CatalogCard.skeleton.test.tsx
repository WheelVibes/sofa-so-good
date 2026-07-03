// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { CatalogCard } from './CatalogCard'

// A parametric def always queues a rendered thumbnail (P17's "expects a thumb"
// signal — see useBuiltinThumbnail/expectsBuiltinThumbnail in thumbnails.tsx).
// The off-screen Canvas host that actually produces the thumbnail isn't
// mounted in this test, so the thumbnail stays genuinely pending — exactly
// the state the skeleton should cover.
const PARAMETRIC_DEF = {
  kind: 'parametric',
  id: 'test-sofa' as FurnitureDef['id'],
  name: 'Test Sofa',
  category: 'seating',
  defaultFootprint: { w: 2, d: 1, h: 0.8 },
  primitive: 'Sofa' as never,
  paramSchema: [],
} as unknown as FurnitureDef

describe('CatalogCard skeleton (P17)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('shows a .skeleton fill in .card-thumb while the thumbnail is pending', () => {
    const { container } = render(<CatalogCard def={PARAMETRIC_DEF} />)
    const thumb = container.querySelector('.card-thumb')
    expect(thumb).toBeTruthy()
    expect(thumb?.querySelector('.skeleton')).toBeTruthy()
  })
})
