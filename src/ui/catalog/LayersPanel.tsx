import { useMemo, useState } from 'react'
import { ROOMS } from '../../apartment/constants'
import { roomShell } from '../../apartment/roomShell'
import type { RoomId } from '../../apartment/types'
import { useCatalog } from '../../furniture/catalog'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { CategoryIcon } from './CategoryIcon'

/** Objects / Layers tree: every placed item grouped by room, with select /
 *  lock / delete. The left-dock alternative to the catalog grid. */
export function LayersPanel() {
  const items = useStore((s) => s.items)
  const selectedIds = useStore((s) => s.selectedItemIds)
  const selectItem = useStore((s) => s.selectItem)
  const toggleLock = useStore((s) => s.toggleLock)
  const deleteItem = useStore((s) => s.deleteItem)
  const hiddenIds = useStore((s) => s.hiddenItemIds)
  const toggleItemHidden = useStore((s) => s.toggleItemHidden)
  const showAllItems = useStore((s) => s.showAllItems)
  const hiddenSet = new Set<string>(hiddenIds)
  const catalog = useCatalog()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => {
    const roomIds = (Object.keys(ROOMS) as RoomId[]).filter((id) => !ROOMS[id].external)
    const shells = roomIds.map((id) => ({ id, shell: roomShell(id) }))
    const byRoom = new Map<string, FurnitureItem[]>()
    const other: FurnitureItem[] = []
    for (const it of items) {
      const hit = shells.find((s) => s.shell.contains(it.position[0], it.position[1]))
      if (hit) {
        if (!byRoom.has(hit.id)) byRoom.set(hit.id, [])
        byRoom.get(hit.id)?.push(it)
      } else other.push(it)
    }
    const out: { key: string; name: string; items: FurnitureItem[] }[] = roomIds
      .filter((id) => byRoom.has(id))
      .map((id) => ({ key: id as string, name: ROOMS[id].name, items: byRoom.get(id) ?? [] }))
    if (other.length) out.push({ key: 'other', name: 'Unassigned', items: other })
    return out
  }, [items])

  const roomCount = groups.filter((g) => g.key !== 'other').length

  return (
    <>
      <div className="lyr-body">
        {groups.length === 0 ? (
          <div className="empty-mini">
            <span className="em-ic">
              <Icon.Layers width={20} height={20} />
            </span>
            <b>Nothing placed yet</b>
            <span>Switch to the catalog and drag items onto the floor.</span>
          </div>
        ) : (
          groups.map((g) => {
            const isCollapsed = !!collapsed[g.key]
            return (
              <div className="lyr-group" key={g.key}>
                <button
                  type="button"
                  className={`lyr-ghead${isCollapsed ? ' collapsed' : ''}`}
                  onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                >
                  <Icon.Chevron className="chev" width={14} height={14} />
                  {g.name}
                  <span className="gcount">{g.items.length}</span>
                </button>
                {!isCollapsed &&
                  g.items.map((it) => {
                    const def = catalog[it.defId]
                    const selected = selectedIds.includes(it.id)
                    return (
                      <div
                        key={it.id}
                        className={`lyr-row${selected ? ' sel' : ''}`}
                        onClick={() => selectItem(it.id)}
                      >
                        <span className="lyr-ic">
                          {def ? (
                            <CategoryIcon category={def.category} width={14} height={14} />
                          ) : (
                            <Icon.Cube width={14} height={14} />
                          )}
                        </span>
                        <span className="lyr-nm">{def?.name ?? it.defId}</span>
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
        <span>{items.length} objects</span>
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
