/**
 * Unit tests for drawingCalloutsSlice — CRUD operations, validation, undo.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('drawingCalloutsSlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('starts with no callouts and panel closed', () => {
    const s = useStore.getState()
    expect(s.drawingCallouts).toEqual([])
    expect(s.drawingCalloutsOpen).toBe(false)
  })

  it('setDrawingCalloutsOpen toggles the panel', () => {
    const s = useStore.getState()
    s.setDrawingCalloutsOpen(true)
    expect(useStore.getState().drawingCalloutsOpen).toBe(true)
    s.setDrawingCalloutsOpen(false)
    expect(useStore.getState().drawingCalloutsOpen).toBe(false)
  })

  describe('addDrawingCallout', () => {
    it('adds a valid callout and returns its id', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({ sheet: 'floor-plan', text: 'GL = 0.00', x: 0.8, y: 0.1 })
      expect(id).not.toBeNull()
      const state = useStore.getState()
      expect(state.drawingCallouts).toHaveLength(1)
      const c = state.drawingCallouts[0]!
      expect(c.id).toBe(id)
      expect(c.text).toBe('GL = 0.00')
      expect(c.sheet).toBe('floor-plan')
      expect(c.x).toBe(0.8)
      expect(c.y).toBe(0.1)
      expect(c.leaderX).toBeUndefined()
    })

    it('stores leader coordinates when provided', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({
        sheet: 'elevations',
        text: 'Verify height',
        x: 0.5,
        y: 0.5,
        leaderX: 0.2,
        leaderY: 0.8,
      })
      expect(id).not.toBeNull()
      const c = useStore.getState().drawingCallouts[0]!
      expect(c.leaderX).toBe(0.2)
      expect(c.leaderY).toBe(0.8)
    })

    it('trims leading/trailing whitespace from text', () => {
      const s = useStore.getState()
      s.addDrawingCallout({ sheet: 'cover', text: '  Trimmed  ', x: 0.1, y: 0.1 })
      const c = useStore.getState().drawingCallouts[0]!
      expect(c.text).toBe('Trimmed')
    })

    it('rejects blank text and returns null', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({ sheet: 'cover', text: '   ', x: 0.1, y: 0.1 })
      expect(id).toBeNull()
      expect(useStore.getState().drawingCallouts).toHaveLength(0)
    })

    it('rejects out-of-range x/y and returns null', () => {
      const s = useStore.getState()
      expect(s.addDrawingCallout({ sheet: 'cover', text: 'hi', x: -0.1, y: 0.5 })).toBeNull()
      expect(s.addDrawingCallout({ sheet: 'cover', text: 'hi', x: 1.1, y: 0.5 })).toBeNull()
      expect(s.addDrawingCallout({ sheet: 'cover', text: 'hi', x: 0.5, y: NaN })).toBeNull()
      expect(useStore.getState().drawingCallouts).toHaveLength(0)
    })

    it('ignores a leader when only one coordinate is provided', () => {
      const s = useStore.getState()
      s.addDrawingCallout({
        sheet: 'floor-plan',
        text: 'Note',
        x: 0.1,
        y: 0.1,
        leaderX: 0.5,
        // leaderY omitted
      })
      const c = useStore.getState().drawingCallouts[0]!
      expect(c.leaderX).toBeUndefined()
      expect(c.leaderY).toBeUndefined()
    })
  })

  describe('updateDrawingCalloutText', () => {
    it('updates the text of a callout', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({ sheet: 'section', text: 'Old', x: 0.5, y: 0.5 })!
      s.updateDrawingCalloutText(id, 'New text')
      expect(useStore.getState().drawingCallouts[0]?.text).toBe('New text')
    })

    it('does nothing on blank text', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({ sheet: 'section', text: 'Keep', x: 0.5, y: 0.5 })!
      s.updateDrawingCalloutText(id, '  ')
      expect(useStore.getState().drawingCallouts[0]?.text).toBe('Keep')
    })

    it('does nothing for an unknown id', () => {
      const s = useStore.getState()
      s.addDrawingCallout({ sheet: 'section', text: 'Keep', x: 0.5, y: 0.5 })
      s.updateDrawingCalloutText('nonexistent', 'Something')
      expect(useStore.getState().drawingCallouts).toHaveLength(1)
      expect(useStore.getState().drawingCallouts[0]?.text).toBe('Keep')
    })
  })

  describe('moveDrawingCallout', () => {
    it('moves the anchor of a callout', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({ sheet: 'lighting', text: 'Move me', x: 0.1, y: 0.1 })!
      s.moveDrawingCallout(id, { x: 0.9, y: 0.9 })
      const c = useStore.getState().drawingCallouts[0]!
      expect(c.x).toBe(0.9)
      expect(c.y).toBe(0.9)
    })

    it('rejects out-of-range positions', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({ sheet: 'lighting', text: 'Me', x: 0.5, y: 0.5 })!
      s.moveDrawingCallout(id, { x: 2, y: 0.5 })
      expect(useStore.getState().drawingCallouts[0]?.x).toBe(0.5) // unchanged
    })
  })

  describe('deleteDrawingCallout', () => {
    it('removes a callout by id', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({ sheet: 'ffe', text: 'To delete', x: 0.5, y: 0.5 })!
      s.deleteDrawingCallout(id)
      expect(useStore.getState().drawingCallouts).toHaveLength(0)
    })

    it('does nothing for an unknown id', () => {
      const s = useStore.getState()
      s.addDrawingCallout({ sheet: 'ffe', text: 'Keep', x: 0.5, y: 0.5 })
      s.deleteDrawingCallout('nonexistent')
      expect(useStore.getState().drawingCallouts).toHaveLength(1)
    })
  })

  describe('undo integration', () => {
    it('undo restores state after an add', () => {
      const s = useStore.getState()
      s.addDrawingCallout({ sheet: 'cover', text: 'Undo me', x: 0.1, y: 0.1 })
      expect(useStore.getState().drawingCallouts).toHaveLength(1)
      useStore.getState().undo()
      expect(useStore.getState().drawingCallouts).toHaveLength(0)
    })

    it('undo restores state after a delete', () => {
      const s = useStore.getState()
      const id = s.addDrawingCallout({ sheet: 'cover', text: 'Keep me', x: 0.1, y: 0.1 })!
      // Two undo steps: one for add (will be first undo), one for delete.
      // We need to advance: add creates 1 undo step; delete creates another.
      s.deleteDrawingCallout(id)
      expect(useStore.getState().drawingCallouts).toHaveLength(0)
      useStore.getState().undo() // undo delete → callout is back
      expect(useStore.getState().drawingCallouts).toHaveLength(1)
    })
  })
})
