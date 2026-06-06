import { useMemo, useState } from 'react'
import { ROOMS } from '../../apartment/constants'
import { roomShell } from '../../apartment/roomShell'
import type { RoomId } from '../../apartment/types'
import { useCatalog } from '../../furniture/catalog'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { CategoryIcon } from './CategoryIcon'

// Room shells (wall-clipped footprints) depend only on the static apartment
// constants, so compute the non-external rooms' shells once — not per `items`
// change. Recomputing the clip geometry on every furniture drag was pure waste.
const NON_EXTERNAL_ROOM_SHELLS = (Object.keys(ROOMS) as RoomId[])
  .filter((id) => !ROOMS[id].external)
  .map((id) => ({ id, shell: roomShell(id) }))

/** Objects / Layers tree: every placed item grouped by room, with select /
 *  lock / delete. The left-dock alternative to the catalog grid. */
export function LayersPanel() {
  const items = useStore((s) => s.items)
  const selectedIds = useStore((s) => s.selectedItemIds)
  const selectItem = useStore((s) => s.selectItem)
  const toggleSelectedItem = useStore((s) => s.toggleSelectedItem)
  const toggleLock = useStore((s) => s.toggleLock)
  const deleteItem = useStore((s) => s.deleteItem)
  const hiddenIds = useStore((s) => s.hiddenItemIds)
  const toggleItemHidden = useStore((s) => s.toggleItemHidden)
  const setItemsHidden = useStore((s) => s.setItemsHidden)
  const showAllItems = useStore((s) => s.showAllItems)
  const hiddenSet = new Set<string>(hiddenIds)
  const catalog = useCatalog()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()
  const itemLabel = (it: FurnitureItem) => it.label ?? catalog[it.defId]?.name ?? it.defId
  const itemName = (it: FurnitureItem) => itemLabel(it).toLowerCase()

  const groups = useMemo(() => {
    const shells = NON_EXTERNAL_ROOM_SHELLS
    const byRoom = new Map<string, FurnitureItem[]>()
    const other: FurnitureItem[] = []
    for (const it of items) {
      const hit = shells.find((s) => s.shell.contains(it.position[0], it.position[1]))
      if (hit) {
        if (!byRoom.has(hit.id)) byRoom.set(hit.id, [])
        byRoom.get(hit.id)?.push(it)
      } else other.push(it)
    }
    const out: { key: string; name: string; items: FurnitureItem[] }[] = shells
      .filter(({ id }) => byRoom.has(id))
      .map(({ id }) => ({ key: id as string, name: ROOMS[id].name, items: byRoom.get(id) ?? [] }))
    if (other.length) out.push({ key: 'other', name: 'Unassigned', items: other })
    return out
  }, [items])

  const roomCount = groups.filter((g) => g.key !== 'other').length
  // Filter items by name; drop empty groups and force-expand while filtering so
  // matches are always visible regardless of a group's collapsed state.
  const visibleGroups = q
    ? groups
        .map((g) => ({ ...g, items: g.items.filter((it) => itemName(it).includes(q)) }))
        .filter((g) => g.items.length > 0)
    : groups
  const matchCount = visibleGroups.reduce((n, g) => n + g.items.length, 0)

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
      <div className="lyr-body">
        {groups.length === 0 ? (
          <div className="empty-mini">
            <span className="em-ic">
              <Icon.Layers width={20} height={20} />
            </span>
            <b>Nothing placed yet</b>
            <span>Switch to the catalog and drag items onto the floor.</span>
          </div>
        ) : visibleGroups.length === 0 ? (
          <p className="empty-mini">
            <span>No objects match “{filter.trim()}”.</span>
          </p>
        ) : (
          visibleGroups.map((g) => {
            const isCollapsed = !q && !!collapsed[g.key]
            const groupHidden = g.items.length > 0 && g.items.every((it) => hiddenSet.has(it.id))
            return (
              <div className="lyr-group" key={g.key}>
                <div className="lyr-ghead-row">
                  <button
                    type="button"
                    className={`lyr-ghead${isCollapsed ? ' collapsed' : ''}`}
                    onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
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
                </div>
                {!isCollapsed &&
                  g.items.map((it) => {
                    const def = catalog[it.defId]
                    const selected = selectedIds.includes(it.id)
                    return (
                      <div
                        key={it.id}
                        className={`lyr-row${selected ? ' sel' : ''}`}
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
                        <span className="lyr-nm">{itemLabel(it)}</span>
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
        {hiddenIds.length > 0 ? (
          <button type="button" className="lyr-showall" onClick={() => showAllItems()}>
            Show all ({hiddenIds.length} hidden)
          </button>
        ) : (
          <span>{roomCount} rooms</span>
        )}
      </div>
    </>
  )
}
