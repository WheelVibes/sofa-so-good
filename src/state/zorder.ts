/**
 * Pure z-order (layer) reordering for an id-keyed list (PARITY-ZORDER). Render
 * order follows array order — later entries paint on top in the 2D plan SVG and
 * sit "in front" in the Layers tree — so bring-forward / send-to-back is just an
 * array reorder. A multi-selection moves as one block, preserving the relative
 * order of its members and never leap-frogging within the selection.
 *
 * Pure (no React/three/store) so it unit-tests in isolation.
 */

export type ZMove = 'front' | 'back' | 'forward' | 'backward'

/**
 * Return a new array with the `ids` moved per `move`:
 *  - `front`    → to the end (top of the stack)
 *  - `back`     → to the start (bottom)
 *  - `forward`  → one step toward the end
 *  - `backward` → one step toward the start
 * The input is never mutated. Unknown ids are ignored; an empty/cover-all
 * selection is a no-op (returns a shallow copy).
 */
export function reorderByIds<T extends { id: string }>(
  items: readonly T[],
  ids: Iterable<string>,
  move: ZMove,
): T[] {
  const sel = new Set(ids)
  if (sel.size === 0 || sel.size >= items.length) return items.slice()

  if (move === 'front') {
    return [...items.filter((it) => !sel.has(it.id)), ...items.filter((it) => sel.has(it.id))]
  }
  if (move === 'back') {
    return [...items.filter((it) => sel.has(it.id)), ...items.filter((it) => !sel.has(it.id))]
  }

  const arr = items.slice()
  if (move === 'forward') {
    // Shift each selected item one slot toward the end, scanning from the end so
    // a block moves together and members don't leap-frog one another.
    for (let i = arr.length - 2; i >= 0; i--) {
      if (sel.has(arr[i].id) && !sel.has(arr[i + 1].id)) {
        ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
      }
    }
    return arr
  }
  // backward — shift each selected item one slot toward the start.
  for (let i = 1; i < arr.length; i++) {
    if (sel.has(arr[i].id) && !sel.has(arr[i - 1].id)) {
      ;[arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]
    }
  }
  return arr
}
