import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ROOMS } from '../../apartment/constants'
import { useStore } from '../../state/store'
import { Toolbar } from './Toolbar'

const firstRoom = Object.values(ROOMS).find((r) => !r.external)!.id

describe('Toolbar', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('the orbit overview is view-only: it offers the Edit menu entry, not editing clusters', () => {
    useStore.getState().setCameraMode('orbit')
    render(<Toolbar />)
    // Primary entry into editing — the Edit menu (Edit a room / Floor plan).
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    // Furniture-editing clusters are NOT in the overview anymore.
    expect(screen.queryByRole('button', { name: /catalog/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /arrange/i })).toBeNull()
  })

  it('shows editing clusters only inside the per-room editor', () => {
    useStore.getState().enterRoomEditor(firstRoom)
    render(<Toolbar />)
    expect(screen.getByRole('button', { name: /catalog/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /arrange/i })).toBeTruthy()
  })

  it('walk mode is view-only (no editing clusters, no Edit-a-room)', () => {
    useStore.getState().setCameraMode('firstPerson')
    render(<Toolbar />)
    expect(screen.queryByRole('button', { name: /arrange/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /catalog/i })).toBeNull()
  })
})
