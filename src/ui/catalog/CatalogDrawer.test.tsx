// @vitest-environment happy-dom
/**
 * Empty-state CTA coverage for CatalogDrawer (P28 — empty-state CTA sweep).
 * "No favourites yet" / "Nothing placed yet" (recent) / "No items here yet"
 * (a real category with zero cards) all get a "Browse furniture" CTA wired to the
 * panel's own real `selectCategory` tab-switch handler, landing on the first
 * category that actually has cards (never inventing state).
 *
 * The `no-matches` (search) and `nothing-in-budget` (max-price) empty states
 * already ship a CTA and are untouched here.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { CatalogDrawer } from './CatalogDrawer'
import type { UnifiedCatalog } from './useUnifiedCatalog'

const PREFS_KEY = 'hdb_catalog_browse'

function setBrowsePrefs(active: string) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ active, sortBy: 'default' }))
}

vi.mock('./useUnifiedCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useUnifiedCatalog')>()
  return {
    ...actual,
    // Wrap the real hook: keep every real category's cards (so navigating to
    // a non-empty category still renders real, valid catalog cards) but force
    // favourites/recent empty, and zero out 'seating' to exercise the
    // "No items here yet" (empty real-category) branch without inventing data.
    useUnifiedCatalog: (...args: Parameters<typeof actual.useUnifiedCatalog>): UnifiedCatalog => {
      const real = actual.useUnifiedCatalog(...args)
      return {
        ...real,
        favourites: [],
        recent: [],
        byCategory: { ...real.byCategory, seating: [] },
        counts: { ...real.counts, seating: 0 },
      }
    },
  }
})

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({
    catalogOpen: true,
    cameraMode: 'orbit',
    roomEditor: { active: true, roomId: 'r1' },
  })
  localStorage.removeItem(PREFS_KEY)
})

afterEach(() => {
  useStore.setState({ catalogOpen: false, roomEditor: { active: false, roomId: null } })
  localStorage.removeItem(PREFS_KEY)
})

describe('CatalogDrawer empty states', () => {
  it('renders + fires "Browse furniture" from the empty favourites tab', () => {
    setBrowsePrefs('favourites')
    render(<CatalogDrawer />)
    expect(screen.getByText('No favourites yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse furniture' }))
    // Lands on 'beds' (first category with cards; 'seating' is zeroed in the mock).
    expect(screen.queryByText('No favourites yet')).toBeNull()
  })

  it('renders + fires "Browse furniture" from the empty recent tab', () => {
    setBrowsePrefs('recent')
    render(<CatalogDrawer />)
    expect(screen.getByText('Nothing placed yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse furniture' }))
    expect(screen.queryByText('Nothing placed yet')).toBeNull()
  })

  it('renders + fires "Browse furniture" when the active category has no cards', () => {
    setBrowsePrefs('seating')
    render(<CatalogDrawer />)
    expect(screen.getByText('No items here yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse furniture' }))
    expect(screen.queryByText('No items here yet')).toBeNull()
  })
})

describe('CatalogDrawer room-aware landing (CATALOG-ROOMAWARE + RM1)', () => {
  it('is unaffected by RM1 when the entered room has no explicit category (name-inference fallback)', () => {
    // No `floorPlan.rooms` entry for 'r1' at all — resolves via `roomDisplayName`'s
    // raw-id fallback, an unmapped kind, so `active` stays at its persisted default
    // exactly as before the RM1 migration.
    setBrowsePrefs('seating')
    render(<CatalogDrawer />)
    expect(screen.getByText('No items here yet')).toBeInTheDocument()
  })

  it("lands on the category for a room's EXPLICIT category even when its name is renamed to gibberish", () => {
    setBrowsePrefs('seating')
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        rooms: [
          {
            id: 'r1',
            name: "Ella's room",
            origin: [0, 0],
            width: 3,
            depth: 3,
            category: 'kitchen',
          },
        ],
      },
    })
    render(<CatalogDrawer />)
    // Kitchen's most-relevant category ('appliances') has real cards in the
    // unmocked catalog, so the empty 'seating' landing is overridden.
    expect(screen.queryByText('No items here yet')).toBeNull()
  })
})
