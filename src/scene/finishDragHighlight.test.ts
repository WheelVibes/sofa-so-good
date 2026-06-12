import { Object3D } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _resetFinishDragSignal,
  getFinishDragActive,
  setFinishDragActive,
  subscribeFinishDrag,
} from './finishDragSignal'
import { findFinishDropTarget, finishSurfaceUserData, hasUntaggedHits } from './finishDropTarget'

// ── finishDragSignal state machine ─────────────────────────────────────────

afterEach(() => {
  _resetFinishDragSignal()
})

describe('finishDragSignal', () => {
  it('starts inactive', () => {
    expect(getFinishDragActive()).toBe(false)
  })

  it('becomes active on dragenter (set true)', () => {
    setFinishDragActive(true)
    expect(getFinishDragActive()).toBe(true)
  })

  it('clears on dragleave (set false)', () => {
    setFinishDragActive(true)
    setFinishDragActive(false)
    expect(getFinishDragActive()).toBe(false)
  })

  it('clears on drop (set false from true)', () => {
    setFinishDragActive(true)
    setFinishDragActive(false)
    expect(getFinishDragActive()).toBe(false)
  })

  it('clears on dragend from window (set false)', () => {
    setFinishDragActive(true)
    setFinishDragActive(false)
    expect(getFinishDragActive()).toBe(false)
  })

  it('is idempotent — no spurious notifications on same-value set', () => {
    const listener = vi.fn()
    subscribeFinishDrag(listener)
    setFinishDragActive(false) // already false
    expect(listener).not.toHaveBeenCalled()
    setFinishDragActive(true)
    expect(listener).toHaveBeenCalledTimes(1)
    setFinishDragActive(true) // already true
    expect(listener).toHaveBeenCalledTimes(1)
    setFinishDragActive(false)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('notifies all subscribers on change', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribeFinishDrag(a)
    subscribeFinishDrag(b)
    setFinishDragActive(true)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes cleanly — unsubscribed listener not called after cancel → drag cycle', () => {
    const listener = vi.fn()
    const unsub = subscribeFinishDrag(listener)
    setFinishDragActive(true)
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    setFinishDragActive(false)
    setFinishDragActive(true)
    expect(listener).toHaveBeenCalledTimes(1) // still just the one call
  })

  it('reset (_resetFinishDragSignal) clears state and listeners', () => {
    const listener = vi.fn()
    subscribeFinishDrag(listener)
    setFinishDragActive(true)
    _resetFinishDragSignal()
    expect(getFinishDragActive()).toBe(false)
    // After reset listeners are gone — a further set should not call the old one
    setFinishDragActive(true)
    expect(listener).toHaveBeenCalledTimes(1) // only the first call before reset
  })
})

// ── hasUntaggedHits (custom-plan overview wall detection) ──────────────────

describe('hasUntaggedHits', () => {
  it('returns false for an empty hit list (sky / no geometry)', () => {
    expect(hasUntaggedHits([])).toBe(false)
  })

  it('returns false when all hits are classifiable (tagged floor)', () => {
    const floor = new Object3D()
    floor.userData = finishSurfaceUserData('floor', 'living')
    expect(hasUntaggedHits([{ object: floor }])).toBe(false)
  })

  it('returns false when all hits are classifiable (tagged wall)', () => {
    const wall = new Object3D()
    wall.userData = finishSurfaceUserData('wall', 'bedroom2')
    expect(hasUntaggedHits([{ object: wall }])).toBe(false)
  })

  it('returns false when all hits are classifiable (furniture itemId)', () => {
    const item = new Object3D()
    item.userData = { itemId: 'sofa-1' }
    expect(hasUntaggedHits([{ object: item }])).toBe(false)
  })

  it('returns true when there is an untagged visible hit (plan wall)', () => {
    const planWall = new Object3D() // no finishTarget / itemId — like FadeWall
    expect(hasUntaggedHits([{ object: planWall }])).toBe(true)
  })

  it('returns true when the first untagged hit is in front (overview wall in front of floor)', () => {
    // This mirrors the real scenario: the plan overview FadeWall is opaque and
    // in front of the floor in the raycast list. findFinishDropTarget skips
    // untagged hits; if ALL visible hits are untagged, it returns null.
    // hasUntaggedHits detects the wall so we can show the cue.
    const planWall = new Object3D()
    const floor = new Object3D()
    floor.userData = finishSurfaceUserData('floor', 'living')
    // Wall first (nearest), floor behind it — findFinishDropTarget finds floor,
    // so applyFinishDropAction succeeds and we never call hasUntaggedHits.
    // The cue is only needed when target === null (all hits untagged).
    expect(hasUntaggedHits([{ object: planWall }])).toBe(true)
    // When there is a classifiable hit mixed in alongside untagged ones,
    // hasUntaggedHits still sees the untagged entry — this is correct because
    // the caller only invokes it when target===null (so a classifiable hit
    // would have already been found and no cue would be needed).
    expect(hasUntaggedHits([{ object: floor }, { object: planWall }])).toBe(true)
  })

  it('skips invisible hits (camera-facing wall reveal)', () => {
    const hidden = new Object3D()
    hidden.visible = false
    expect(hasUntaggedHits([{ object: hidden }])).toBe(false)
  })

  it('skips a null object entry', () => {
    // Safety: guard against null objects in the hit list
    expect(hasUntaggedHits([{ object: null as unknown as Object3D }])).toBe(false)
  })

  it('returns false for a tagged item buried in an ancestor (classify walks ancestors)', () => {
    // A child of a tagged furniture root should be classifiable — not untagged.
    const root = new Object3D()
    root.userData = { itemId: 'lamp-7' }
    const child = new Object3D()
    root.add(child)
    // findFinishDropTarget and hasUntaggedHits both use classifyFinishDropObject
    expect(findFinishDropTarget([{ object: child }])).toEqual({ kind: 'item', itemId: 'lamp-7' })
    expect(hasUntaggedHits([{ object: child }])).toBe(false)
  })
})
