import { describe, expect, it, vi } from 'vitest'
import { confirmAndRemoveDef } from './removeImportedDef'

describe('confirmAndRemoveDef', () => {
  it('removes immediately without prompting when nothing is placed', async () => {
    const confirmAction = vi.fn()
    const removeUserFurniture = vi.fn()
    const removed = await confirmAndRemoveDef(
      { id: 'ikea-malm' },
      { placedCount: 0, confirmAction, removeUserFurniture },
    )
    expect(confirmAction).not.toHaveBeenCalled()
    expect(removeUserFurniture).toHaveBeenCalledWith('ikea-malm')
    expect(removed).toBe(true)
  })

  it('prompts and removes when the user confirms a placed def', async () => {
    const confirmAction = vi.fn().mockResolvedValue(true)
    const removeUserFurniture = vi.fn()
    const removed = await confirmAndRemoveDef(
      { id: 'ikea-malm' },
      { placedCount: 2, confirmAction, removeUserFurniture },
    )
    expect(confirmAction).toHaveBeenCalledWith(
      expect.objectContaining({ danger: true, confirmLabel: 'Remove' }),
    )
    expect(confirmAction.mock.calls[0][0].message).toContain('2 placed items')
    expect(removeUserFurniture).toHaveBeenCalledWith('ikea-malm')
    expect(removed).toBe(true)
  })

  it('does not remove when the user cancels', async () => {
    const confirmAction = vi.fn().mockResolvedValue(false)
    const removeUserFurniture = vi.fn()
    const removed = await confirmAndRemoveDef(
      { id: 'ikea-malm' },
      { placedCount: 1, confirmAction, removeUserFurniture },
    )
    expect(confirmAction.mock.calls[0][0].message).toContain('1 placed item')
    expect(removeUserFurniture).not.toHaveBeenCalled()
    expect(removed).toBe(false)
  })
})
