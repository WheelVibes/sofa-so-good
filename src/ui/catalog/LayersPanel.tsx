import { type CSSProperties, useMemo, useRef, useState } from 'react'
import { ROOMS } from '../../apartment/constants'
import type { RoomId } from '../../apartment/types'
import { useFeature } from '../../features/useFeature'
import { pointInRoom } from '../../floorplan/types'
import { useCatalog } from '../../furniture/catalog'
import type { FurnitureItem } from '../../furniture/types'
import { resolveFinishDrop } from '../../materials/finishDrop'
import {
  applyFinishDropAction,
  isFinishDrag,
  readFinishDragPayload,
} from '../../state/finishDropApply'
import { useStore } from '../../state/store'
import { useFlip } from '../controls/useFlip'
import { EmptyState } from '../EmptyState'
import { Icon } from '../toolbar/icons'
import { CategoryIcon } from './CategoryIcon'

/** Objects / Layers tree: every placed item grouped by room, with select /
 *  lock / delete. The left-dock alternative to the catalog grid. */
export function LayersPanel() {
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const selectedIds = useStore((s) => s.selectedItemIds)
  const selectItem = useStore((s) => s.selectItem)
  const toggleSelectedItem = useStore((s) => s.toggleSelectedItem)
  const toggleLock = useStore((s) => s.toggleLock)
  const setAllLocked = useStore((s) => s.setAllLocked)
  const deleteItem = useStore((s) => s.deleteItem)
  const hiddenIds = useStore((s) => s.hiddenItemIds)
  const toggleItemHidden = useStore((s) => s.toggleItemHidden)
  const setItemsHidden = useStore((s) => s.setItemsHidden)
  const setItemsLocked = useStore((s) => s.setItemsLocked)
  const showAllItems = useStore((s) => s.showAllItems)
  const setLeftMode = useStore((s) => s.setLeftMode)
  const setCatalogOpen = useStore((s) => s.setCatalogOpen)
  const hiddenSet = new Set<string>(hiddenIds)

  const fFinishDnd = useFeature('finishDnd')
  /** Apply a finish dragged from the Finish picker onto a specific item —
   *  same commit path as the 3D-canvas drop (state/finishDropApply.ts). */
  const applyFinishDrop = (itemId: string, dt: DataTransfer) => {
    if (!fFinishDnd) return
    applyFinishDropAction(resolveFinishDrop({ kind: 'item', itemId }, readFinishDragPayload(dt)))
  }
  const catalog = useCatalog()
  // Collapse state is lifted into the store (persisted per-device) so a
  // collapsed group survives a reload (P39).
  const collapsed = useStore((s) => s.layersCollapsed)
  const setCollapsed = useStore((s) => s.setLayersCollapsed)
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()
  const itemLabel = (it: FurnitureItem) => it.label ?? catalog[it.defId]?.name ?? it.defId
  const itemName = (it: FurnitureItem) => itemLabel(it).toLowerCase()

  const groups = useMemo(() => {
    // Group by the ACTIVE plan's rooms (not the default ROOMS constant) so custom
    // floor plans group correctly; skip only the default plan's external ledges.
    const rooms = plan.rooms.filter((r) => !ROOMS[r.id as RoomId]?.external)
    const byRoom = new Map<string, FurnitureItem[]>()
    const other: FurnitureItem[] = []
    for (const it of items) {
      const hit = rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
      if (hit) {
        if (!byRoom.has(hit.id)) byRoom.set(hit.id, [])
        byRoom.get(hit.id)?.push(it)
      } else other.push(it)
    }
    const out: { key: string; name: string; items: FurnitureItem[] }[] = rooms
      .filter((r) => byRoom.has(r.id))
      .map((r) => ({ key: r.id, name: r.name, items: byRoom.get(r.id) ?? [] }))
    if (other.length) out.push({ key: 'other', name: 'Unassigned', items: other })
    return out
  }, [items, plan])

  const roomCount = groups.filter((g) => g.key !== 'other').length
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed[g.key])
  // Filter items by name; drop empty groups and force-expand while filtering so
  // matches are always visible regardless of a group's collapsed state.
  const visibleGroups = q
    ? groups
        .map((g) => ({ ...g, items: g.items.filter((it) => itemName(it).includes(q)) }))
        .filter((g) => g.items.length > 0)
    : groups
  const matchCount = visibleGroups.reduce((n, g) => n + g.items.length, 0)

  // FLIP row movement (UIUX-36): rows glide to their new slot on reorder /
  // filter / collapse instead of teleporting. Keyed on the visible row order.
  const lyrBodyRef = useRef<HTMLDivElement>(null)
  const flipKey = useMemo(
    () =>
      visibleGroups
        .map((g) => `${g.key}:${collapsed[g.key] ? 'c' : g.items.map((it) => it.id).join(',')}`)
        .join('|'),
    [visibleGroups, collapsed],
  )
  useFlip(lyrBodyRef, flipKey)

  return (
    <>
      {items.length > 0 ? (
        <div className="cat-search" style={{ paddingBottom: 'var(--s-2)' }}>
          <div className="field">
            <Icon.Search width={16} height={16} className="icn" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${items.length} objects…`}
              className="input"
            />
          </div>
        </div>
      ) : null}
      <div className="lyr-body" ref={lyrBodyRef}>
        {groups.length === 0 ? (
          <EmptyState
            icon={Icon.Layers}
            title="Nothing placed yet"
            description="Switch to the catalog and drag items onto the floor — they'll show up here as a layer list."
            cta={{
              label: 'Open catalog',
              onClick: () => {
                setLeftMode('catalog')
                setCatalogOpen(true)
              },
            }}
          />
        ) : visibleGroups.length === 0 ? (
          <EmptyState
            icon={Icon.Search}
            title="No objects match"
            description={`Nothing here matches “${filter.trim()}”. Try a different word.`}
            cta={{ label: 'Clear filter', onClick: () => setFilter('') }}
          />
        ) : (
          visibleGroups.map((g) => {
            const isCollapsed = !q && !!collapsed[g.key]
            const groupHidden = g.items.length > 0 && g.items.every((it) => hiddenSet.has(it.id))
            const groupLocked = g.items.length > 0 && g.items.every((it) => it.locked)
            return (
              <div className="lyr-group stagger-in" key={g.key}>
                <div className="lyr-ghead-row">
                  <button
                    type="button"
                    className={`lyr-ghead${isCollapsed ? ' collapsed' : ''}`}
                    onClick={() => setCollapsed({ ...collapsed, [g.key]: !collapsed[g.key] })}
                  >
                    <Icon.Chevron className="chev" width={14} height={14} />
                    {g.name}
                    <span className="gcount">{g.items.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`lyr-geye${groupHidden ? ' on' : ''}`}
                    title={groupHidden ? 'Show all in room' : 'Hide all in room'}
                    aria-label={groupHidden ? 'Show all in room' : 'Hide all in room'}
                    onClick={() =>
                      setItemsHidden(
                        g.items.map((it) => it.id),
                        !groupHidden,
                      )
                    }
                  >
                    {groupHidden ? (
                      <Icon.EyeOff width={14} height={14} />
                    ) : (
                      <Icon.Eye width={14} height={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`lyr-geye${groupLocked ? ' on' : ''}`}
                    title={groupLocked ? 'Unlock all in room' : 'Lock all in room'}
                    aria-label={groupLocked ? 'Unlock all in room' : 'Lock all in room'}
                    onClick={() =>
                      setItemsLocked(
                        g.items.map((it) => it.id),
                        !groupLocked,
                      )
                    }
                  >
                    {groupLocked ? (
                      <Icon.Lock width={14} height={14} />
                    ) : (
                      <Icon.Unlock width={14} height={14} />
                    )}
                  </button>
                </div>
                {!isCollapsed &&
                  g.items.map((it, idx) => {
                    const def = catalog[it.defId]
                    const selected = selectedIds.includes(it.id)
                    return (
                      <div
                        key={it.id}
                        data-flip-id={it.id}
                        className={`lyr-row${selected ? ' sel' : ''}${
                          hiddenSet.has(it.id) ? ' hidden' : ''
                        }`}
                        style={{ '--i': idx } as CSSProperties}
                        onDragOver={(e) => {
                          if (fFinishDnd && isFinishDrag(e.dataTransfer)) {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'copy'
                            e.currentTarget.classList.add('drop-target')
                          }
                        }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('drop-target')}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.remove('drop-target')
                          applyFinishDrop(it.id, e.dataTransfer)
                        }}
                      >
                        {/* Primary select action is a real button (UIUX-41) so a
                            keyboard user can Tab to an object and Enter-select it;
                            the row div stays the drag-and-drop finish target
                            (drop zones must be a <div>, src/ui/CLAUDE.md). */}
                        <button
                          type="button"
                          className="lyr-sel"
                          aria-pressed={selected}
                          onClick={(e) =>
                            e.metaKey || e.ctrlKey ? toggleSelectedItem(it.id) : selectItem(it.id)
                          }
                        >
                          <span className="lyr-ic">
                            {def ? (
                              <CategoryIcon category={def.category} width={14} height={14} />
                            ) : (
                              <Icon.Cube width={14} height={14} />
                            )}
                          </span>
                          <span className="lyr-nm" title={itemLabel(it)}>
                            {itemLabel(it)}
                          </span>
                        </button>
                        <span className="lyr-acts">
                          <button
                            type="button"
                            className={hiddenSet.has(it.id) ? 'on' : ''}
                            title={hiddenSet.has(it.id) ? 'Show' : 'Hide'}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleItemHidden(it.id)
                            }}
                          >
                            {hiddenSet.has(it.id) ? (
                              <Icon.EyeOff width={14} height={14} />
                            ) : (
                              <Icon.Eye width={14} height={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            className={it.locked ? 'on' : ''}
                            title={it.locked ? 'Unlock' : 'Lock'}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleLock(it.id)
                            }}
                          >
                            {it.locked ? (
                              <Icon.Lock width={14} height={14} />
                            ) : (
                              <Icon.Unlock width={14} height={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!it.locked) deleteItem(it.id)
                            }}
                          >
                            <Icon.Trash width={14} height={14} />
                          </button>
                        </span>
                      </div>
                    )
                  })}
              </div>
            )
          })
        )}
      </div>
      <div className="lyr-foot">
        <span>{q ? `${matchCount} of ${items.length} objects` : `${items.length} objects`}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
          {hiddenIds.length > 0 ? (
            <button type="button" className="lyr-showall" onClick={() => showAllItems()}>
              Show all ({hiddenIds.length})
            </button>
          ) : null}
          {!q && roomCount > 1 ? (
            <button
              type="button"
              className="lyr-showall"
              title={allCollapsed ? 'Expand all rooms' : 'Collapse all rooms'}
              onClick={() =>
                setCollapsed(
                  allCollapsed ? {} : Object.fromEntries(groups.map((g) => [g.key, true])),
                )
              }
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          ) : null}
          {items.length > 0 ? (
            <button
              type="button"
              className="lyr-showall"
              onClick={() => setAllLocked(!(items.length > 0 && items.every((it) => it.locked)))}
            >
              {items.length > 0 && items.every((it) => it.locked) ? 'Unlock all' : 'Lock all'}
            </button>
          ) : (
            <span>{roomCount} rooms</span>
          )}
        </span>
      </div>
    </>
  )
}
