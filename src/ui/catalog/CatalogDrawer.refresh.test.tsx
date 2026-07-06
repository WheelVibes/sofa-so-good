// @vitest-environment happy-dom
/**
 * Refresh-control gating for an imported shared/ikea card (REFRESH-ASSET). The
 * "Re-download asset from library" button is wired ONLY when the def maps to a
 * loaded manifest item AND the session can actually re-fetch: admin +
 * `sharedLibrary` flag + backend. This asserts the admin vs non-admin split with
 * everything else held equal.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IkeaGltfDef } from '../../furniture/types'
import { FURNITURE_CATEGORIES } from '../../furniture/types'
import { useStore } from '../../state/store'
import { CatalogDrawer } from './CatalogDrawer'
import type { GridItem, UnifiedCatalog } from './useUnifiedCatalog'

// Force a backend so the refresh gate (`sharedOn && hasBackend()`) can pass; keep
// every other client export real.
vi.mock('../../features/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/api/client')>()
  return { ...actual, hasBackend: () => true }
})

const IKEA_DEF: IkeaGltfDef = {
  id: 'ikea-agen',
  name: 'AGEN Armchair',
  category: 'seating',
  kind: 'gltf',
  source: 'ikea',
  groupKey: 'agen',
  activeVariant: 'natural',
  variants: [
    {
      finish: 'natural',
      label: 'Natural',
      articleNumber: '1',
      url: 'u',
      assetId: null,
      glbMaterials: [],
    },
  ],
  defaultFootprint: { w: 0.8, d: 0.8, h: 0.9 },
  uploadedAt: '2026-07-07',
  license: 'IKEA',
  attribution: 'IKEA',
}

// One local ikea card in 'seating'; everything else empty.
vi.mock('./useUnifiedCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useUnifiedCatalog')>()
  return {
    ...actual,
    useUnifiedCatalog: (): UnifiedCatalog => {
      const card: GridItem = { kind: 'local', def: IKEA_DEF }
      const byCategory = Object.fromEntries(
        FURNITURE_CATEGORIES.map((c) => [c, c === 'seating' ? [card] : []]),
      ) as UnifiedCatalog['byCategory']
      const counts = Object.fromEntries(
        FURNITURE_CATEGORIES.map((c) => [c, c === 'seating' ? 1 : 0]),
      ) as UnifiedCatalog['counts']
      return { byCategory, counts, all: [card], favourites: [], recent: [] }
    },
  }
})

function seedCommon(admin: boolean) {
  useStore.getState().__resetForTest?.()
  localStorage.setItem(
    'hdb_catalog_browse',
    JSON.stringify({ active: 'seating', sortBy: 'default' }),
  )
  useStore.setState((s) => ({
    catalogOpen: true,
    cameraMode: 'orbit',
    roomEditor: { active: true, roomId: 'r1' },
    // A matching manifest item so sharedGroupForDef resolves agen → agen-folder.
    sharedLibrary: {
      ...s.sharedLibrary,
      items: [
        {
          group: 'agen-folder',
          groupKey: 'agen',
          name: 'AGEN Armchair',
          type: '',
          category: 'seating',
          size: '',
          series: '',
          variants: 1,
          thumbnail: null,
          price: null,
          currency: null,
        },
      ],
    },
    currentUser: admin
      ? { id: 'a', name: 'Admin', role: 'admin' as const }
      : { id: 'u', name: 'User', role: 'user' as const },
    featureFlags: { ...s.featureFlags, sharedLibrary: true },
  }))
}

beforeEach(() => {
  localStorage.clear()
})

describe('CatalogDrawer refresh-control gating', () => {
  it('renders the refresh button for an admin (backend + sharedLibrary + matching item)', () => {
    seedCommon(true)
    render(<CatalogDrawer />)
    expect(screen.getByLabelText('Re-download asset from library')).toBeTruthy()
  })

  it('hides the refresh button for a non-admin session', () => {
    seedCommon(false)
    render(<CatalogDrawer />)
    expect(screen.queryByLabelText('Re-download asset from library')).toBeNull()
    // ...but the card itself still renders (gating is refresh-only).
    expect(screen.getByText('AGEN Armchair')).toBeTruthy()
  })
})
