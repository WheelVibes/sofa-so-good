import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ROOMS, roomArea } from '../apartment/constants'
import type { RoomId } from '../apartment/types'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import { useCatalog } from '../furniture/catalog'
import { arrangePlanRoom, arrangeRoom } from '../layout/autoArrange'
import { proceduralThumbnailDataUrl } from '../materials/procedural/generators'
import type { MaterialCategory, MaterialDef } from '../materials/types'
import { useMaterials } from '../materials/useMaterial'
import { useStore } from '../state/store'
import { formatArea } from '../utils/measurement'
import { RemoteBrowseTab } from './catalog/RemoteBrowseTab'
import { Icon } from './toolbar/icons'
import { UploadMaterialDialog } from './upload/UploadMaterialDialog'
import { useIsMobile } from './useIsMobile'

/** Filter finishes by a free-text query against the material name (empty query
 *  passes everything). Keeps the picker scannable as the catalog grows. */
function filterFinishes(mats: MaterialDef[], query: string): MaterialDef[] {
  const q = query.trim().toLowerCase()
  if (!q) return mats
  return mats.filter((m) => m.name.toLowerCase().includes(q))
}

/** Background-image URL for a swatch tile: the generated texture preview for
 *  procedural finishes, the provider thumbnail/albedo for textured ones. */
function swatchImage(m: MaterialDef): string | undefined {
  if (m.kind === 'procedural') {
    return `url("${proceduralThumbnailDataUrl(m.id, m.pattern, m.swatch)}")`
  }
  if (m.kind === 'textured') {
    return `url("${m.thumbUrl ?? m.runtimeUrls?.albedo ?? m.textures.albedo}")`
  }
  return undefined
}

type View = 'swatch' | 'browse'
type Surface = 'floor' | 'wall'

const LAST_SURFACE_KEY = 'hdb_last_finish_surface'

/**
 * Right-side panel shown when a room is selected. Floor / wall tabs
 * each present a swatch grid of available materials — built-ins, user
 * uploads (with an "Uploaded" badge), and any resolved remote materials
 * (with a provider tag).
 *
 * From here the user can also `Browse online…` which mounts the remote
 * material browser inline; resolving applies the material to the
 * last-edited surface and returns to the swatch view.
 */
export function FinishPicker() {
  const roomId = useStore((s) => s.selectedRoomId) as RoomId | null
  const finishes = useStore(useShallow((s) => s.finishes))
  const setFloorFinish = useStore((s) => s.setFloorFinish)
  const setWallFinish = useStore((s) => s.setWallFinish)
  const setAllFloorFinish = useStore((s) => s.setAllFloorFinish)
  const setAllWallFinish = useStore((s) => s.setAllWallFinish)
  const selectRoom = useStore((s) => s.selectRoom)
  const removeUserMaterial = useStore((s) => s.removeUserMaterial)
  const recentColors = useStore(useShallow((s) => s.recentColors))
  const pushRecentColor = useStore((s) => s.pushRecentColor)
  const recentFinishes = useStore(useShallow((s) => s.recentFinishes))
  const pushRecentFinish = useStore((s) => s.pushRecentFinish)
  const units = useStore((s) => s.units)
  const items = useStore(useShallow((s) => s.items))
  const plan = useStore((s) => s.floorPlan)
  const furnitureCatalog = useCatalog()
  const tidyRoom = () => {
    if (!roomId) return
    const s = useStore.getState()
    s.pushHistory()
    // arrangeRoom is keyed on the fixed apartment's RoomId tables and throws on
    // a custom plan's arbitrary room id — route custom plans to the plan-aware
    // single-room arranger.
    const next = isDefaultPlan(s.floorPlan)
      ? arrangeRoom(roomId as RoomId, s.items, furnitureCatalog, s.doors)
      : arrangePlanRoom(s.floorPlan, roomId, s.items, furnitureCatalog, s.doors)
    s.setItems(next)
  }
  // Unlocked items inside this room (the set the room editor shows). Drives the
  // "Clear room" action + its count.
  const planRoom = roomId ? plan.rooms.find((r) => r.id === roomId) : undefined
  const roomItemIds = planRoom
    ? items
        .filter((it) => !it.locked && pointInRoom(planRoom, it.position[0], it.position[1]))
        .map((it) => it.id)
    : []
  const clearRoom = async () => {
    if (roomItemIds.length === 0) return
    const s = useStore.getState()
    const ok = await s.confirmAction({
      title: 'Clear this room',
      message: `Remove ${roomItemIds.length} ${roomItemIds.length === 1 ? 'item' : 'items'} from this room? Locked items stay. Undo with Ctrl/⌘+Z.`,
      confirmLabel: 'Clear room',
      danger: true,
    })
    if (!ok) return
    const st = useStore.getState()
    st.pushHistory()
    for (const id of roomItemIds) st.deleteItem(id)
  }
  const bootstrapRemote = useStore((s) => s.bootstrapRemoteCatalog)
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status)
  const materials = useMaterials()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [finishQuery, setFinishQuery] = useState('')
  const [view, setView] = useState<View>('swatch')
  // Remember which surface was last finished, across sessions, so Browse opens
  // pre-filtered to it (and resolving applies to it).
  const [lastSurface, setLastSurfaceState] = useState<Surface>(() => {
    try {
      return localStorage.getItem(LAST_SURFACE_KEY) === 'wall' ? 'wall' : 'floor'
    } catch {
      return 'floor'
    }
  })
  const setLastSurface = (s: Surface) => {
    setLastSurfaceState(s)
    try {
      localStorage.setItem(LAST_SURFACE_KEY, s)
    } catch {
      // ignore (private mode / unavailable storage)
    }
  }

  useEffect(() => {
    if (view === 'browse' && phStatus === 'idle') void bootstrapRemote()
  }, [view, phStatus, bootstrapRemote])

  if (!roomId) return null
  // Resolve a display name + area from the fixed apartment (default plan) OR the
  // active custom plan, so the picker works for custom-plan rooms too (RE6).
  const builtinRoom = ROOMS[roomId]
  if (builtinRoom?.external) return null
  const roomName = builtinRoom?.name ?? planRoom?.name
  const roomAreaM2 = builtinRoom ? roomArea(builtinRoom) : planRoom ? planRoomArea(planRoom) : 0
  if (!roomName) return null

  const groups: Record<MaterialCategory, MaterialDef[]> = {
    floor: [],
    wall: [],
  }
  for (const m of Object.values(materials)) groups[m.category].push(m)

  const handleSelect = (surface: Surface, id: string) => {
    setLastSurface(surface)
    if (id.startsWith('#')) pushRecentColor(id)
    else pushRecentFinish(id)
    if (surface === 'floor') setFloorFinish(roomId, id)
    else setWallFinish(roomId, id)
  }

  const handleResolved = (id: string) => {
    if (lastSurface === 'floor') setFloorFinish(roomId, id)
    else setWallFinish(roomId, id)
    setView('swatch')
  }

  return (
    <aside className="panel inspector" style={view === 'browse' ? { width: 320 } : undefined}>
      <div className="panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {view === 'browse' && (
            <button
              type="button"
              onClick={() => setView('swatch')}
              className="icon-btn"
              aria-label="Back to swatches"
            >
              <Icon.ArrowLeft width={16} height={16} />
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="panel-title">{view === 'browse' ? 'Browse materials' : roomName}</div>
            <div className="panel-sub">
              {view === 'browse'
                ? `Apply to ${lastSurface}`
                : `Finishes · ${formatArea(roomAreaM2, units)}`}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => selectRoom(null)}
          className="icon-btn"
          aria-label="Close finish picker"
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <hr className="hr" />

      {view === 'swatch' ? (
        <div className="panel-body">
          <input
            type="search"
            className="input"
            placeholder="Search finishes…"
            value={finishQuery}
            onChange={(e) => setFinishQuery(e.target.value)}
            aria-label="Search finishes"
            style={{ marginBottom: 'var(--s-3)' }}
          />
          <SwatchGroup
            label="Floor"
            items={filterFinishes(groups.floor, finishQuery)}
            active={finishes.floor[roomId]}
            onSelect={(id) => handleSelect('floor', id)}
            onRemoveUser={removeUserMaterial}
            onCustom={(hex) => handleSelect('floor', hex)}
            recent={recentColors}
            recentFinishIds={recentFinishes}
          />
          <button
            type="button"
            className="finish-apply-all"
            onClick={() => setAllFloorFinish(finishes.floor[roomId])}
            title="Use this floor finish in every room"
          >
            Apply floor to all rooms
          </button>
          <SwatchGroup
            label="Walls"
            items={filterFinishes(groups.wall, finishQuery)}
            active={finishes.walls[roomId]}
            onSelect={(id) => handleSelect('wall', id)}
            onRemoveUser={removeUserMaterial}
            onCustom={(hex) => handleSelect('wall', hex)}
            recent={recentColors}
            recentFinishIds={recentFinishes}
          />
          <button
            type="button"
            className="finish-apply-all"
            onClick={() => setAllWallFinish(finishes.walls[roomId])}
            title="Use this wall finish in every room"
          >
            Apply walls to all rooms
          </button>
          <button
            type="button"
            onClick={tidyRoom}
            title="Auto-arrange this room's furniture: storage flush to walls, seating facing the TV, walkways + door clearances kept"
            className="btn btn-accent btn-block"
            style={{ marginTop: 'var(--s-4)' }}
          >
            <Icon.Tidy width={14} height={14} />
            Tidy up room
          </button>
          {roomItemIds.length > 0 ? (
            <button
              type="button"
              onClick={clearRoom}
              title="Remove all unlocked furniture from this room (undoable)"
              className="btn ghost btn-block"
              style={{ marginTop: 'var(--s-2)', color: 'var(--danger)' }}
            >
              <Icon.Trash width={14} height={14} />
              Clear room ({roomItemIds.length})
            </button>
          ) : null}
          <div className="export-row" style={{ marginTop: 'var(--s-2)' }}>
            <button type="button" onClick={() => setView('browse')} className="btn btn-soft">
              <Icon.Search width={14} height={14} />
              Browse
            </button>
            <button type="button" onClick={() => setUploadOpen(true)} className="btn btn-soft">
              <Icon.Upload width={14} height={14} />
              Upload
            </button>
          </div>
          <UploadMaterialDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
        </div>
      ) : (
        <div
          className="panel-body"
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
        >
          <RemoteBrowseTab
            kind="material"
            onResolved={handleResolved}
            defaultCategory={lastSurface}
          />
        </div>
      )}
    </aside>
  )
}

interface SwatchGroupProps {
  label: string
  items: MaterialDef[]
  active: string
  onSelect: (id: string) => void
  onRemoveUser: (id: string) => void
  onCustom?: (hex: string) => void
  recent?: string[]
  /** Recently-applied finish ids (any surface); filtered to this group's items. */
  recentFinishIds?: string[]
}

/** A compact row of recently-applied finish materials (filtered to one surface),
 *  for quickly re-applying the same finish across rooms. */
function RecentFinishes({
  mats,
  active,
  onSelect,
}: {
  mats: MaterialDef[]
  active: string
  onSelect: (id: string) => void
}) {
  if (mats.length === 0) return null
  return (
    <div style={{ marginBottom: 'var(--s-2)' }}>
      <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
        <span>Recently used</span>
      </div>
      <div className="swatches" style={{ paddingBlock: 0 }}>
        {mats.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`swatch${m.id === active ? ' on' : ''}`}
            title={m.name}
            aria-label={`Recently used: ${m.name}`}
            onClick={() => onSelect(m.id)}
            style={{
              backgroundColor: m.swatch,
              backgroundImage: swatchImage(m),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function providerTag(def: MaterialDef): { label: string; cls: string } | null {
  if (def.kind !== 'textured') return null
  if (def.source === 'user') return { label: 'user', cls: 'badge neutral' }
  if (def.source === 'polyhaven') return { label: 'PH', cls: 'badge ok' }
  if (def.source === 'ambientcg') return { label: 'ACG', cls: 'badge warn' }
  return null
}

/** A small finish-colour swatches row (recent custom colours). */
function RecentColors({
  recent,
  active,
  onCustom,
}: {
  recent: string[]
  active: string
  onCustom: (hex: string) => void
}) {
  return (
    <div style={{ marginTop: 'var(--s-3)' }}>
      <div className="sec-h" style={{ marginBottom: 'var(--s-2)' }}>
        <span>Recent</span>
      </div>
      <div className="swatches">
        {recent.map((hex) => (
          <button
            type="button"
            key={hex}
            onClick={() => onCustom(hex)}
            title={hex}
            aria-label={`Recent colour ${hex}`}
            className={`swatch${active === hex ? ' on' : ''}`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  )
}

function SwatchGroup({
  label,
  items,
  active,
  onSelect,
  onRemoveUser,
  onCustom,
  recent,
  recentFinishIds,
}: SwatchGroupProps) {
  const customActive = typeof active === 'string' && active.startsWith('#')
  const isMobile = useIsMobile()
  // Recent finishes that belong to THIS surface (intersect with the group's
  // items so a recent floor finish doesn't surface in the Walls group).
  const recentMats = (recentFinishIds ?? [])
    .map((id) => items.find((m) => m.id === id))
    .filter((m): m is MaterialDef => m != null)

  // Mobile: the 3-up swatch grid squeezes each thumbnail into a thin strip, so
  // show a compact dropdown of finishes with a live preview of the current
  // choice instead (+ the custom-colour control + recent row).
  if (isMobile) {
    const activeMat = items.find((m) => m.id === active)
    const previewStyle: React.CSSProperties = activeMat
      ? {
          backgroundColor: activeMat.swatch,
          backgroundImage: swatchImage(activeMat),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : customActive
        ? { background: active }
        : { background: 'var(--surface-3)' }
    return (
      <section className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
        <div className="sec-h">
          <span>{label}</span>
        </div>
        <RecentFinishes mats={recentMats} active={active} onSelect={onSelect} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <span
            className="swatch-lg"
            aria-hidden
            style={{ width: 52, height: 36, flex: '0 0 auto', ...previewStyle }}
          />
          <select
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            aria-label={`${label} finish`}
            value={customActive ? '' : active}
            onChange={(e) => onSelect(e.target.value)}
          >
            {customActive ? <option value="">Custom colour</option> : null}
            {items.map((m) => {
              const tag = providerTag(m)
              return (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {tag ? ` · ${tag.label}` : ''}
                </option>
              )
            })}
          </select>
          {onCustom ? (
            <label
              className="swatch-lg"
              title="Custom colour"
              style={{
                width: 36,
                height: 36,
                flex: '0 0 auto',
                position: 'relative',
                cursor: 'pointer',
                background: customActive
                  ? (active as string)
                  : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
            >
              <input
                type="color"
                value={customActive ? (active as string) : '#cccccc'}
                onChange={(e) => onCustom(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label={`Custom ${label.toLowerCase()} colour`}
              />
            </label>
          ) : null}
        </div>
        {onCustom && recent && recent.length > 0 ? (
          <RecentColors recent={recent} active={active} onCustom={onCustom} />
        ) : null}
      </section>
    )
  }

  return (
    <section className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
      <div className="sec-h">
        <span>{label}</span>
      </div>
      <RecentFinishes mats={recentMats} active={active} onSelect={onSelect} />
      <div className="finish-grid">
        {items.map((m) => {
          const isUser = m.kind === 'textured' && m.source === 'user'
          const isActive = m.id === active
          const tag = providerTag(m)
          return (
            // biome-ignore lint/a11y/useSemanticElements: tile holds a nested remove button, so it can't be a <button>
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(m.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(m.id)
              }}
              className={`finish-cell group${isActive ? ' on' : ''}`}
              style={{ position: 'relative', cursor: 'pointer' }}
              title={m.name}
            >
              <span
                className="swatch-lg"
                style={{
                  backgroundColor: m.swatch,
                  backgroundImage: swatchImage(m),
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <span className="name">{m.name}</span>
              {tag ? (
                <span
                  className="badge neutral"
                  style={{ position: 'absolute', right: 4, top: 4, padding: '1px 5px' }}
                >
                  {tag.label}
                </span>
              ) : null}
              {isUser ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveUser(m.id)
                  }}
                  className="coll-x"
                  style={{ bottom: 4, top: 'auto' }}
                  aria-label="Remove uploaded material"
                >
                  <Icon.Close width={12} height={12} />
                </button>
              ) : null}
            </div>
          )
        })}
        {/* Custom colour: a native colour picker styled as a swatch tile. */}
        {onCustom ? (
          <label
            className={`finish-cell${customActive ? ' on' : ''}`}
            style={{ position: 'relative', cursor: 'pointer' }}
            title="Custom colour"
          >
            <span
              className="swatch-lg"
              style={{
                background: customActive
                  ? (active as string)
                  : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
            />
            <span className="name">Custom…</span>
            <input
              type="color"
              value={customActive ? (active as string) : '#cccccc'}
              onChange={(e) => onCustom(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`Custom ${label.toLowerCase()} colour`}
            />
          </label>
        ) : null}
      </div>
      {onCustom && recent && recent.length > 0 ? (
        <RecentColors recent={recent} active={active} onCustom={onCustom} />
      ) : null}
    </section>
  )
}
