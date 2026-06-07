import { describe, expect, it } from 'vitest'
import { ROOMS } from '../apartment/constants'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { getRoomEditorShell } from './roomEditorShell'

const firstRoom = Object.values(ROOMS).find((r) => !r.external)!.id

describe('getRoomEditorShell', () => {
  it('resolves a valid default-apartment room', () => {
    const shell = getRoomEditorShell(buildDefaultPlan(), firstRoom)
    expect(shell).not.toBeNull()
    expect(shell?.kind).toBe('default')
    expect(shell?.shell.center).toHaveLength(2)
  })

  it('returns null for an unknown/stale room id instead of throwing', () => {
    // Regression: an invalid id used to crash (`ROOMS[id].origin` on undefined).
    expect(() => getRoomEditorShell(buildDefaultPlan(), 'living')).not.toThrow()
    expect(getRoomEditorShell(buildDefaultPlan(), 'living')).toBeNull()
    expect(getRoomEditorShell(buildDefaultPlan(), 'does-not-exist')).toBeNull()
  })
})
