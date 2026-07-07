import type { ConfirmRequest } from '../../state/slices/promptSlice'

export interface RemoveDefDeps {
  /** How many placed instances of the def exist across the whole design. */
  placedCount: number
  confirmAction: (req: ConfirmRequest) => Promise<boolean>
  removeUserFurniture: (id: string) => void
}

/** Remove an uploaded/imported furniture def, prompting first only when it has
 *  placed instances (which get wiped with it). Returns true if removed. */
export async function confirmAndRemoveDef(
  def: { id: string },
  { placedCount, confirmAction, removeUserFurniture }: RemoveDefDeps,
): Promise<boolean> {
  if (placedCount > 0) {
    const ok = await confirmAction({
      title: 'Remove asset?',
      message: `${placedCount} placed item${placedCount === 1 ? '' : 's'} will also be removed.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return false
  }
  removeUserFurniture(def.id)
  return true
}
