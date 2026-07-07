import { describe, expect, it } from 'vitest'
import { roomShell } from '../apartment/roomShellGeometry'
import { isItemInRoom } from './roomFilter'

describe('isItemInRoom', () => {
  const b2 = roomShell('bedroom2')
  it('keeps an item whose center is inside the room', () => {
    expect(isItemInRoom({ position: [4.5, 1.5] }, b2)).toBe(true)
  })
  it('drops an item whose center is outside the room', () => {
    expect(isItemInRoom({ position: [11, 7] }, b2)).toBe(false)
  })
})

describe('isItemInRoom level matching (F13/ML5)', () => {
  it('requires the item and room to share a storey', () => {
    const shell = { contains: () => true, levelId: 'lvl-2' }
    expect(isItemInRoom({ position: [1, 1] as const }, shell)).toBe(false)
    expect(isItemInRoom({ position: [1, 1] as const, levelId: 'lvl-2' }, shell)).toBe(true)
    const groundShell = { contains: () => true }
    expect(isItemInRoom({ position: [1, 1] as const, levelId: 'lvl-2' }, groundShell)).toBe(false)
    expect(isItemInRoom({ position: [1, 1] as const }, groundShell)).toBe(true)
  })
})
