// @vitest-environment happy-dom
/**
 * CATALOG-FITS "Fits only" browse filter (`catalogFitsFilter`, pro tier) —
 * verifies the toggle only appears when a real room is being edited AND the
 * app is in Pro mode, per the CLAUDE.md hard rule that any pro-tier-flagged
 * UI must be tested in BOTH Simple and Pro.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'

// The thumbnail host mounts an R3F <Canvas> (no WebGL in jsdom) and cards pull
// GLB-thumbnail rendering — none of that is under test here.
vi.mock('./thumbnails', () => ({ ThumbnailHost: () => null }))
vi.mock('./CatalogCard', () => ({ CatalogCard: () => null }))
vi.mock('./RemoteCard', () => ({ RemoteCard: () => null }))

import { CatalogDrawer } from './CatalogDrawer'

/** Open the drawer inside a REAL, resolvable room (the default flat's
 *  living/dining) so `useActiveRoomFreeRects` returns non-null rects — a
 *  precondition for the "Fits only" toggle to render at all. Also mark the
 *  remote index 'ready' so Pro mode's `remoteFurniture` flag doesn't fire an
 *  unrelated network bootstrap effect during the test. */
function openDrawerInRealRoom() {
  useStore.setState({
    catalogOpen: true,
    cameraMode: 'orbit',
    roomEditor: { active: true, roomId: 'livingDining' },
    remoteIndexes: {
      polyhaven: { status: 'ready', entries: [] },
      ambientcg: { status: 'ready', entries: [] },
    },
  } as never)
}

describe('CatalogDrawer "Fits only" filter tier gating (CATALOG-FITS)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('shows the toggle in Pro mode with a real room being edited', () => {
    useStore.getState().setUiMode('pro')
    expect(useStore.getState().featureFlags.catalogFitsFilter).toBe(true)
    openDrawerInRealRoom()
    render(<CatalogDrawer />)
    expect(screen.getByLabelText('Show only items that fit this room')).toBeInTheDocument()
  })

  it('hides the toggle in Simple mode (catalogFitsFilter is pro-tier)', () => {
    useStore.getState().setUiMode('simple')
    expect(useStore.getState().featureFlags.catalogFitsFilter).toBe(false)
    openDrawerInRealRoom()
    render(<CatalogDrawer />)
    expect(screen.queryByLabelText('Show only items that fit this room')).toBeNull()
  })

  it('hides the toggle when the room id is unresolved (edge case, never crashes)', () => {
    useStore.getState().setUiMode('pro')
    openDrawerInRealRoom()
    // The drawer itself only mounts while `roomEditor.active` — keep it active
    // but null the room id to exercise `useActiveRoomFreeRects`' null-id guard.
    useStore.setState({ roomEditor: { active: true, roomId: null } })
    render(<CatalogDrawer />)
    expect(screen.queryByLabelText('Show only items that fit this room')).toBeNull()
  })
})
