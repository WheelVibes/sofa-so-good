import { useFeature } from '../../features/useFeature'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

/**
 * The inspector's "act on other items" tail block: replace-with-similar,
 * apply-finish-to-all-of-type, select-all-of-type, copy/paste appearance,
 * recolour-by-category, and add-to-active-group. Each button is independently
 * gated exactly as it was inline in `InspectorPanel.tsx` (no shared wrapper
 * gate existed before this extraction, so none is introduced here) — moved
 * verbatim, self-fetching the flags/derived counts it needs.
 */
export function ItemBulkActions({
  item,
  catalog,
}: {
  item: FurnitureItem
  catalog: Record<string, FurnitureDef>
}) {
  // Replace-with-similar (PARITY-REPLACE): swap to a nearest-size sibling.
  const replaceSimilarOn = useFeature('replaceSimilar')
  // Copy/paste appearance (look-only transfer) + recolour-by-category.
  const copyAppearanceOn = useFeature('copyAppearance')
  const appearanceClipboard = useStore((s) => s.appearanceClipboard)
  const activeGroupId = useStore((s) => s.activeGroupId)
  const addToGroup = useStore((s) => s.addToGroup)
  // How many *other* placed items share this def — gates the "apply finish to
  // all of this type" action (also in the right-click menu, surfaced here for
  // touch where right-click is a long-press).
  const sameTypeCount = useStore((s) => s.items.filter((i) => i.defId === item.defId).length)
  const sameCategoryCount = useStore((s) => {
    const cat = catalog[item.defId]?.category
    if (!cat) return 0
    return s.items.filter((i) => catalog[i.defId]?.category === cat).length
  })

  return (
    <>
      {replaceSimilarOn ? (
        <button
          type="button"
          onClick={() => useStore.getState().setSwapItemId(item.id)}
          className="btn btn-soft btn-block"
          style={{ marginTop: 'var(--s-2)' }}
          title="Swap this piece for a nearest-size catalog alternative, keeping its place"
        >
          <Icon.Copy width={14} height={14} />
          Replace with similar…
        </button>
      ) : null}
      {sameTypeCount > 1 ? (
        <button
          type="button"
          onClick={() => {
            const n = useStore.getState().applyStyleToAll(item.id)
            if (n > 0)
              useStore.getState().notify.start({
                title: `Applied this finish to ${n} more`,
                kind: 'success',
              })
          }}
          className="btn btn-soft btn-block"
          style={{ marginTop: 'var(--s-2)' }}
          title="Copy this item's finish, colour & material to every other item of the same type"
        >
          <Icon.Palette width={14} height={14} />
          Apply finish to all ({sameTypeCount - 1})
        </button>
      ) : null}
      {sameTypeCount > 1 ? (
        <button
          type="button"
          onClick={() => {
            const s = useStore.getState()
            s.setSelectedItemIds(s.items.filter((i) => i.defId === item.defId).map((i) => i.id))
          }}
          className="btn btn-soft btn-block"
          style={{ marginTop: 'var(--s-2)' }}
          title="Select every item of this type to move, rotate or delete them together"
        >
          <Icon.Cube width={14} height={14} />
          Select all of type ({sameTypeCount})
        </button>
      ) : null}
      {copyAppearanceOn ? (
        <>
          <button
            type="button"
            onClick={() => {
              if (useStore.getState().copyAppearance(item.id))
                useStore.getState().notify.start({
                  title: 'Appearance copied',
                  message: 'Select another item and Paste appearance.',
                  kind: 'success',
                })
            }}
            className="btn btn-soft btn-block"
            style={{ marginTop: 'var(--s-2)' }}
            title="Copy this item's finish, colour & material (not its size) to reuse on others"
          >
            <Icon.Copy width={14} height={14} />
            Copy appearance
          </button>
          {appearanceClipboard ? (
            <button
              type="button"
              onClick={() => {
                const s = useStore.getState()
                const ids = s.selectedItemIds.length > 0 ? s.selectedItemIds : [item.id]
                const n = s.pasteAppearanceTo(ids)
                s.notify.start({
                  title: n > 0 ? `Pasted appearance to ${n}` : 'Nothing to change',
                  kind: n > 0 ? 'success' : 'info',
                })
              }}
              className="btn btn-soft btn-block"
              style={{ marginTop: 'var(--s-2)' }}
              title={`Apply the copied “${appearanceClipboard.name}” look to the selection`}
            >
              <Icon.Palette width={14} height={14} />
              Paste appearance
            </button>
          ) : null}
          {sameCategoryCount > 1 ? (
            <button
              type="button"
              onClick={() => {
                const n = useStore.getState().applyAppearanceToCategory(item.id)
                if (n > 0)
                  useStore.getState().notify.start({
                    title: `Recoloured ${n} in this category`,
                    kind: 'success',
                  })
              }}
              className="btn btn-soft btn-block"
              style={{ marginTop: 'var(--s-2)' }}
              title="Apply this item's finish/colour to every item in the same category"
            >
              <Icon.Palette width={14} height={14} />
              Recolour category ({sameCategoryCount - 1})
            </button>
          ) : null}
        </>
      ) : null}
      {activeGroupId && item.groupId !== activeGroupId && (
        <button
          type="button"
          onClick={() => addToGroup(item.id, activeGroupId)}
          className="btn btn-soft btn-block"
          style={{ marginTop: 'var(--s-2)' }}
        >
          <Icon.Group width={14} height={14} />
          Add to group
        </button>
      )}
    </>
  )
}
