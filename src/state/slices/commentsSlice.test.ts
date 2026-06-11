import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('pinned design comments (F24)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('adds a comment with the full shape (level-aware, unresolved, timestamped)', () => {
    const s = () => useStore.getState()
    const id = s().addComment({
      position: [2.5, 3.5],
      text: '  Swap this rug  ',
      levelId: 'lvl-2',
      author: 'Wei',
    })
    expect(id).toBeTruthy()
    expect(s().comments).toHaveLength(1)
    const c = s().comments[0]
    expect(c).toMatchObject({
      id,
      position: [2.5, 3.5],
      levelId: 'lvl-2',
      text: 'Swap this rug', // trimmed
      author: 'Wei',
      resolved: false,
    })
    expect(Number.isNaN(Date.parse(c.createdAt))).toBe(false)
    // Ground-floor pins omit levelId entirely (matches FurnitureItem.levelId).
    s().addComment({ position: [1, 1], text: 'Ground note' })
    expect(s().comments[1].levelId).toBeUndefined()
    expect(s().comments[1].author).toBeUndefined()
  })

  it('rejects blank text and non-finite positions', () => {
    const s = () => useStore.getState()
    expect(s().addComment({ position: [1, 1], text: '   ' })).toBeNull()
    expect(s().addComment({ position: [Number.NaN, 1], text: 'x' })).toBeNull()
    expect(s().addComment({ position: [1, Number.POSITIVE_INFINITY], text: 'x' })).toBeNull()
    expect(s().comments).toHaveLength(0)
    expect(s().past).toHaveLength(0) // rejected adds push no history
  })

  it('edits text, toggles resolved and deletes', () => {
    const s = () => useStore.getState()
    const id = s().addComment({ position: [1, 2], text: 'first' })!
    s().updateCommentText(id, '  reworded  ')
    expect(s().comments[0].text).toBe('reworded')
    s().updateCommentText(id, '   ') // blank rejected, text unchanged
    expect(s().comments[0].text).toBe('reworded')
    s().setCommentResolved(id, true)
    expect(s().comments[0].resolved).toBe(true)
    s().setCommentResolved(id, false)
    expect(s().comments[0].resolved).toBe(false)
    s().deleteComment(id)
    expect(s().comments).toHaveLength(0)
  })

  it('no-op edits/resolves/deletes push no history', () => {
    const s = () => useStore.getState()
    const id = s().addComment({ position: [1, 2], text: 'note' })!
    const depth = s().past.length
    s().updateCommentText(id, 'note') // same text
    s().setCommentResolved(id, false) // already unresolved
    s().updateCommentText('missing', 'x')
    s().setCommentResolved('missing', true)
    s().deleteComment('missing')
    expect(s().past.length).toBe(depth)
  })

  it('every mutation is one undoable step (add / resolve / delete)', () => {
    const s = () => useStore.getState()
    const id = s().addComment({ position: [1, 1], text: 'keep me' })!
    s().setCommentResolved(id, true)
    s().deleteComment(id)
    expect(s().comments).toHaveLength(0)
    s().undo() // un-delete
    expect(s().comments).toHaveLength(1)
    expect(s().comments[0].resolved).toBe(true)
    s().undo() // un-resolve
    expect(s().comments[0].resolved).toBe(false)
    s().undo() // un-add
    expect(s().comments).toHaveLength(0)
    s().redo()
    expect(s().comments).toHaveLength(1)
    expect(s().comments[0].text).toBe('keep me')
  })

  it('toggleCommentMode arms and disarms the placement tool', () => {
    const s = () => useStore.getState()
    expect(s().commentMode).toBe(false)
    s().toggleCommentMode()
    expect(s().commentMode).toBe(true)
    s().toggleCommentMode()
    expect(s().commentMode).toBe(false)
  })
})
