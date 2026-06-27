import { Suspense, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ROOMS, roomArea } from '../apartment/constants'
import type { RoomId } from '../apartment/types'
import { canPlace } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { useFeature } from '../features/useFeature'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import { resolvePlanRoomFloor, resolvePlanRoomWall } from '../floorplan/roomFinishes'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import { useCatalog } from '../furniture/catalog'
import { arrangePlanRoom, arrangeRoom } from '../layout/autoArrange'
import { cloneRoomItems } from '../layout/cloneRoom'
import { mirrorRoomItems } from '../layout/mirrorRoom'
import { swapRoomLayouts } from '../layout/swapRooms'
import { resolveDesignerPicks } from '../materials/designerPicks'
import type { MaterialCategory, MaterialDef } from '../materials/types'
import { useMaterials } from '../materials/useMaterial'
import { editableRooms } from '../state/rooms'
import { useStore } from '../state/store'
import { formatArea } from '../utils/measurement'
import { lazyWithRetry } from './app/lazyWithRetry'
import { RemoteBrowseTab } from './catalog/RemoteBrowseTab'
import { MaterialComposer } from './finish/MaterialComposer'
import { SwatchGroup } from './finish/swatches'
import { Icon } from './toolbar/icons'

// Lazy-loaded: the texture upload dialog (and its TGA/TIFF/EXR/HDR decode
// pipeline) only loads once the user opens it (P-CHUNK). It resets its state
// on close anyway, so mount-gating on `uploadOpen` is behaviour-identical.
const UploadMaterialDialog = lazyWithRetry(() =>
  import('./upload/UploadMaterialDialog').then((m) => ({ default: m.UploadMaterialDialog })),
)

/** Filter finishes by a free-text query against the material name (empty query
 *  passes everything). Keeps the picker scannable as the catalog grows. */
function filterFinishes(mats: MaterialDef[], query: string): MaterialDef[] {
  const q = query.trim().toLowerCase()
  if (!q) return mats
  return mats.filter((m) => m.name.toLowerCase().includes(q))
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
    const n = roomItemIds.length
    for (const id of roomItemIds) st.deleteItem(id)
    st.notify.start({
      title: `Cleared ${n} item${n === 1 ? '' : 's'} from this room`,
      kind: 'success',
    })
  }
  // Copy this room's floor + wall finish to another specific room (vs the
  // "apply to all rooms" bulk buttons) — match two bedrooms without touching the
  // rest of the home.
  const copyFinishesTo = (targetId: string) => {
    if (!roomId) return
    const st = useStore.getState()
    const target = st.floorPlan.rooms.find((r) => r.id === targetId)
    if (!target) return
    st.pushHistory()
    const src = st.floorPlan.rooms.find((r) => r.id === roomId)
    const floor = src ? resolvePlanRoomFloor(st.finishes, src) : st.finishes.floor[roomId]
    const wall = src
      ? (resolvePlanRoomWall(st.finishes, src) ?? st.finishes.walls[roomId])
      : st.finishes.walls[roomId]
    if (floor) st.setFloorFinish(target.id as RoomId, floor)
    if (wall) st.setWallFinish(target.id as RoomId, wall)
    st.notify.start({ title: `Finishes copied to ${target.name}`, kind: 'success' })
  }
  const mirrorRoom = () => {
    if (!planRoom || roomItemIds.length === 0) return
    const st = useStore.getState()
    const cx = planRoom.origin[0] + planRoom.width / 2
    const idsInRoom = new Set(roomItemIds)
    // Reflection preserves intra-room spacing, so only collisions with walls /
    // out-of-room items can newly fail — check the mirror against those.
    const others = st.items.filter((o) => !idsInRoom.has(o.id))
    const walls = placementWalls(st)
    const isValid = (m: (typeof st.items)[number]) => {
      const def = furnitureCatalog[m.defId]
      return def
        ? canPlace(m, def, { others, defs: furnitureCatalog, doors: st.doors, walls })
        : false
    }
    const { items: next, mirrored } = mirrorRoomItems(st.items, idsInRoom, cx, isValid)
    if (mirrored === 0) {
      st.notify.start({ title: 'Nothing to mirror here', kind: 'info' })
      return
    }
    st.pushHistory()
    st.setItems(next)
    st.notify.start({
      title: `Mirrored ${mirrored} item${mirrored === 1 ? '' : 's'}`,
      kind: 'success',
    })
  }
  // Copy this room's unlocked furniture into another room (translated by the
  // room-centre delta), collision-checked against the whole flat — for repeated
  // bedrooms etc. Skips any clone that wouldn't fit.
  const cloneLayoutTo = (targetId: string) => {
    if (!planRoom) return
    const st = useStore.getState()
    const target = st.floorPlan.rooms.find((r) => r.id === targetId)
    if (!target) return
    const dx = target.origin[0] + target.width / 2 - (planRoom.origin[0] + planRoom.width / 2)
    const dz = target.origin[1] + target.depth / 2 - (planRoom.origin[1] + planRoom.depth / 2)
    const srcItems = st.items.filter((it) => roomItemIds.includes(it.id))
    if (srcItems.length === 0) return
    const makeId = () =>
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const walls = isDefaultPlan(st.floorPlan)
      ? buildCollisionWalls(st.doors)
      : planCollisionWalls(st.floorPlan, st.doors)
    let others = st.items
    const placed: typeof srcItems = []
    for (const c of cloneRoomItems(srcItems, dx, dz, makeId)) {
      const def = furnitureCatalog[c.defId]
      if (!def) continue
      if (canPlace(c, def, { others, defs: furnitureCatalog, doors: st.doors, walls })) {
        placed.push(c)
        others = [...others, c]
      }
    }
    if (placed.length === 0) {
      st.notify.start({ title: `Couldn't fit any items in ${target.name}`, kind: 'info' })
      return
    }
    st.pushHistory()
    st.setItems([...st.items, ...placed])
    st.notify.start({
      title: `Copied ${placed.length} item${placed.length === 1 ? '' : 's'} to ${target.name}`,
      kind: 'success',
    })
  }
  // Swap this room's furniture with another room's (translate each set into the
  // other, by the room-centre delta). All-or-nothing: if any piece wouldn't fit
  // (rooms too different), nothing moves and we say so.
  const swapLayoutWith = (targetId: string) => {
    if (!planRoom) return
    const st = useStore.getState()
    const target = st.floorPlan.rooms.find((r) => r.id === targetId)
    if (!target) return
    const dx = target.origin[0] + target.width / 2 - (planRoom.origin[0] + planRoom.width / 2)
    const dz = target.origin[1] + target.depth / 2 - (planRoom.origin[1] + planRoom.depth / 2)
    const aIds = new Set(roomItemIds)
    const bIds = new Set(
      st.items
        .filter((it) => !it.locked && pointInRoom(target, it.position[0], it.position[1]))
        .map((it) => it.id),
    )
    if (aIds.size === 0 && bIds.size === 0) {
      st.notify.start({ title: 'Nothing to swap between these rooms', kind: 'info' })
      return
    }
    const swapped = swapRoomLayouts(st.items, aIds, bIds, dx, dz)
    const walls = isDefaultPlan(st.floorPlan)
      ? buildCollisionWalls(st.doors)
      : planCollisionWalls(st.floorPlan, st.doors)
    const moved = new Set([...aIds, ...bIds])
    const others = swapped.filter((it) => !moved.has(it.id))
    const allFit = swapped
      .filter((it) => moved.has(it.id))
      .every((it) => {
        const def = furnitureCatalog[it.defId]
        return def
          ? canPlace(it, def, { others, defs: furnitureCatalog, doors: st.doors, walls })
          : true
      })
    if (!allFit) {
      st.notify.start({
        title: `Swap doesn't fit — ${planRoom.name} & ${target.name} differ too much`,
        kind: 'info',
      })
      return
    }
    st.pushHistory()
    st.setItems(swapped)
    st.notify.start({ title: `Swapped ${planRoom.name} ↔ ${target.name}`, kind: 'success' })
  }
  const bootstrapRemote = useStore((s) => s.bootstrapRemoteCatalog)
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status)
  const fRemoteMaterials = useFeature('remoteMaterials')
  const fDesignerPicks = useFeature('designerPicks')
  const fComposer = useFeature('materialComposer')
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

  // Other editable rooms — targets for "Copy layout to…".
  const otherRooms = editableRooms(plan).filter((r) => r.id !== roomId)

  const groups: Record<MaterialCategory, MaterialDef[]> = {
    floor: [],
    wall: [],
  }
  for (const m of Object.values(materials)) groups[m.category].push(m)

  // Active picks resolve through the plan-room fallback so a template/2D-
  // inspector-authored finish highlights even before the slice has an entry.
  const activeFloor = planRoom ? resolvePlanRoomFloor(finishes, planRoom) : finishes.floor[roomId]
  const activeWall = planRoom
    ? (resolvePlanRoomWall(finishes, planRoom) ?? finishes.walls[roomId])
    : finishes.walls[roomId]

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
            active={activeFloor}
            onSelect={(id) => handleSelect('floor', id)}
            onRemoveUser={removeUserMaterial}
            onCustom={(hex) => handleSelect('floor', hex)}
            recent={recentColors}
            recentFinishIds={recentFinishes}
            curated={fDesignerPicks ? resolveDesignerPicks('floor', materials) : undefined}
          />
          <button
            type="button"
            className="finish-apply-all"
            onClick={() => {
              setAllFloorFinish(activeFloor)
              useStore
                .getState()
                .notify.start({ title: 'Floor finish applied to every room', kind: 'success' })
            }}
            title="Use this floor finish in every room"
          >
            Apply floor to all rooms
          </button>
          {fComposer ? (
            <MaterialComposer
              label="Floor"
              active={activeFloor ?? ''}
              onApply={(id) => handleSelect('floor', id)}
            />
          ) : null}
          <SwatchGroup
            label="Walls"
            items={filterFinishes(groups.wall, finishQuery)}
            active={activeWall}
            onSelect={(id) => handleSelect('wall', id)}
            onRemoveUser={removeUserMaterial}
            onCustom={(hex) => handleSelect('wall', hex)}
            recent={recentColors}
            recentFinishIds={recentFinishes}
            curated={fDesignerPicks ? resolveDesignerPicks('wall', materials) : undefined}
          />
          <button
            type="button"
            className="finish-apply-all"
            onClick={() => {
              setAllWallFinish(activeWall)
              useStore
                .getState()
                .notify.start({ title: 'Wall finish applied to every room', kind: 'success' })
            }}
            title="Use this wall finish in every room"
          >
            Apply walls to all rooms
          </button>
          {fComposer ? (
            <MaterialComposer
              label="Walls"
              active={activeWall ?? ''}
              onApply={(id) => handleSelect('wall', id)}
            />
          ) : null}
          {otherRooms.length > 0 ? (
            <select
              className="input"
              aria-label="Copy this room's floor + wall finish to another room"
              value=""
              onChange={(e) => {
                if (e.target.value) copyFinishesTo(e.target.value)
                e.target.value = ''
              }}
              style={{ marginTop: 'var(--s-2)', width: '100%' }}
            >
              <option value="" disabled>
                Copy finishes to…
              </option>
              {otherRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : null}
          <div
            className="label"
            style={{
              fontSize: 'var(--t-2xs)',
              color: 'var(--text-3)',
              margin: 'var(--s-4) 0 var(--s-1)',
            }}
          >
            Room layout
          </div>
          <button
            type="button"
            onClick={tidyRoom}
            title="Auto-arrange this room's furniture: storage flush to walls, seating facing the TV, walkways + door clearances kept"
            className="btn btn-accent btn-block"
          >
            <Icon.Tidy width={14} height={14} />
            Tidy up room
          </button>
          {roomItemIds.length > 0 ? (
            <button
              type="button"
              onClick={mirrorRoom}
              title="Flip this room's furniture left↔right across its centre (mirror the layout). Undoable."
              className="btn btn-soft btn-block"
              style={{ marginTop: 'var(--s-2)' }}
            >
              <Icon.FlipH width={14} height={14} />
              Mirror room
            </button>
          ) : null}
          {roomItemIds.length > 0 && otherRooms.length > 0 ? (
            <select
              className="input"
              aria-label="Copy this room's layout to another room"
              value=""
              onChange={(e) => {
                if (e.target.value) cloneLayoutTo(e.target.value)
                e.target.value = ''
              }}
              style={{ marginTop: 'var(--s-2)', width: '100%' }}
            >
              <option value="" disabled>
                Copy layout to…
              </option>
              {otherRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : null}
          {otherRooms.length > 0 ? (
            <select
              className="input"
              aria-label="Swap this room's layout with another room"
              value=""
              onChange={(e) => {
                if (e.target.value) swapLayoutWith(e.target.value)
                e.target.value = ''
              }}
              style={{ marginTop: 'var(--s-2)', width: '100%' }}
            >
              <option value="" disabled>
                Swap layout with…
              </option>
              {otherRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : null}
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
            {fRemoteMaterials ? (
              <button type="button" onClick={() => setView('browse')} className="btn btn-soft">
                <Icon.Search width={14} height={14} />
                Browse
              </button>
            ) : null}
            <button type="button" onClick={() => setUploadOpen(true)} className="btn btn-soft">
              <Icon.Upload width={14} height={14} />
              Upload
            </button>
          </div>
          {uploadOpen && (
            <Suspense fallback={null}>
              <UploadMaterialDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
            </Suspense>
          )}
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
