/**
 * Pure derivation for isolate/solo (focus) mode (FEAT-C): given every placed
 * item id, the current selection, and whether isolate is active, returns the
 * set of item ids that should render dimmed — everything NOT selected.
 *
 * Deliberately returns an empty set (nothing dimmed) when isolate is off OR
 * nothing is selected — dimming the whole room to no purpose (no selection to
 * contrast against) would just look like a broken render. Render-agnostic and
 * side-effect free so it's cheaply unit-testable without a store or scene.
 */
export function computeDimmedItemIds(
  allItemIds: readonly string[],
  selectedItemIds: readonly string[],
  isolateActive: boolean,
): Set<string> {
  const dimmed = new Set<string>()
  if (!isolateActive || selectedItemIds.length === 0) return dimmed
  const selected = new Set(selectedItemIds)
  for (const id of allItemIds) {
    if (!selected.has(id)) dimmed.add(id)
  }
  return dimmed
}
