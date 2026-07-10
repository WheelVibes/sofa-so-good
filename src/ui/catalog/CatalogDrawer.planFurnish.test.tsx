// @vitest-environment happy-dom
/**
 * PLAN-FURNISH — the catalog also surfaces inside the 2D floor-plan editor
 * (desktop dock in Phase 1; the mobile bottom sheet since Phase 2), behind
 * the pro-tier `planFurnish` flag, WITHOUT loosening `roomEditorActive`'s
 * existing meaning (it's an OR, not a replacement). Tested in both Simple
 * (hidden) and Pro (shown) per the CLAUDE.md hard rule, on desktop AND
 * mobile, plus the room-editor-unaffected case.
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { CatalogDrawer } from './CatalogDrawer'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({
    catalogOpen: true,
    cameraMode: 'orbit',
    roomEditor: { active: false, roomId: null },
    floorPlanEditing: true,
  })
})

afterEach(() => {
  useStore.setState({
    catalogOpen: false,
    roomEditor: { active: false, roomId: null },
    floorPlanEditing: false,
  })
})

describe('CatalogDrawer in the 2D plan editor (PLAN-FURNISH)', () => {
  it('renders in the plan editor in Pro mode', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    const { container } = render(<CatalogDrawer />)
    expect(container.querySelector('.panel.catalog')).not.toBeNull()
    expect(container.querySelector('.catalog-in-plan')).not.toBeNull()
  })

  it('stays hidden in Simple mode (planFurnish is pro-tier)', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    const { container } = render(<CatalogDrawer />)
    expect(container.firstChild).toBeNull()
  })

  it('stays hidden when the planFurnish flag is explicitly off, even in Pro', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, planFurnish: false },
    })
    const { container } = render(<CatalogDrawer />)
    expect(container.firstChild).toBeNull()
  })

  // PLAN-FURNISH Phase 2: the plan-editor catalog is no longer desktop-only —
  // on mobile it surfaces as the standard bottom sheet (arming from a card
  // auto-closes it so the plan is visible for the placement tap). Tested in
  // BOTH modes per the CLAUDE.md hard rule.
  describe('on mobile (Phase 2)', () => {
    const original = window.matchMedia
    beforeEach(() => {
      // Force the ≤640px mobile breakpoint `useIsMobile` reads (matches the
      // `setViewport` helper pattern in `ui/tour/ProductTour.test.tsx`).
      window.matchMedia = ((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia
    })
    afterEach(() => {
      window.matchMedia = original
    })

    it('surfaces in the plan editor on mobile in Pro mode', () => {
      useStore.getState().setUiMode('pro')
      useStore.getState().reresolveFeatureFlags()
      const { container } = render(<CatalogDrawer />)
      expect(container.querySelector('.panel.catalog')).not.toBeNull()
      expect(container.querySelector('.catalog-in-plan')).not.toBeNull()
    })

    it('stays hidden on mobile in Simple mode (planFurnish is pro-tier)', () => {
      useStore.getState().setUiMode('simple')
      useStore.getState().reresolveFeatureFlags()
      const { container } = render(<CatalogDrawer />)
      expect(container.firstChild).toBeNull()
    })
  })

  it('does not carry the plan modifier class when opened for the room editor normally', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    useStore.setState({ roomEditor: { active: true, roomId: 'r1' }, floorPlanEditing: false })
    const { container } = render(<CatalogDrawer />)
    expect(container.querySelector('.panel.catalog')).not.toBeNull()
    expect(container.querySelector('.catalog-in-plan')).toBeNull()
  })
})
