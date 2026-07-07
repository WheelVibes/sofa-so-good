import { Suspense, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ROOMS, roomArea } from '../apartment/constants'
import type { RoomId } from '../apartment/types'
import { canPlace } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { useFeature } from '../features/useFeature'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import {
  resolvePlanRoomCeiling,
  resolvePlanRoomFloor,
  resolvePlanRoomWall,
} from '../floorplan/roomFinishes'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import { useCatalog } from '../furniture/catalog'
import { arrangePlanRoom, arrangeRoom } from '../layout/autoArrange'
import { cloneRoomItems } from '../layout/cloneRoom'
import { mirrorRoomItems } from '../layout/mirrorRoom'
import { swapRoomLayouts } from '../layout/swapRooms'
import {
  isComposedMaterialId,
  isTintMaterialId,
  parseTintMaterialId,
  recolorFinishId,
  tintMaterialId,
} from '../materials/composeMaterial'
import { resolveDesignerPicks } from '../materials/designerPicks'
import type { MaterialCategory, MaterialDef } from '../materials/types'
import { useMaterials } from '../materials/useMaterial'
import { editableRooms } from '../state/rooms'
import { useStore } from '../state/store'
import { formatArea } from '../utils/measurement'
import { lazyWithRetry } from './app/lazyWithRetry'
import { RemoteBrowseTab } from './catalog/RemoteBrowseTab'
import { MasterPaletteEditor } from './color/MasterPaletteEditor'
import { Disclosure } from './controls/Disclosure'
import { Select } from './controls/Select'
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
type Surface = 'floor' | 'wall' | 'ceiling'

const LAST_SURFACE_KEY = 'hdb_last_finish_surface'

/**
 * Right-side panel shown when a room is selected — the per-room surface
 * customizer. A segmented Floor | Walls | Ceiling tab row shows one surface
 * block at a time, each a swatch grid of available materials (built-ins, user
 * uploads with an "Uploaded" badge, and any resolved remote materials with a
 * provider tag). Ceiling paints from the wall/paint pool and defaults to plain
 * white (gated by the `ceilingFinish` flag).
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
  const setCeilingFinish = useStore((s) => s.setCeilingFinish)
  const clearCeilingFinish = useStore((s) => s.clearCeilingFinish)
  const clearWallAccent = useStore((s) => s.clearWallAccent)
  const setAllFloorFinish = useStore((s) => s.setAllFloorFinish)
  const setAllWallFinish = useStore((s) => s.setAllWallFinish)
  const setAllCeilingFinish = useStore((s) => s.setAllCeilingFinish)
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
    // silent: true — the whole clear is one history step (pushed once above
    // via pushHistory()), so this single summary toast (with its own Undo)
    // replaces the per-item "Item deleted" toasts rather than stacking
    // alongside them. skipHistoryPush: true — deleteItem's own coalesced
    // push would otherwise add a second, redundant history entry on top of
    // the explicit pushHistory() above.
    for (const id of roomItemIds) st.deleteItem(id, { silent: true, skipHistoryPush: true })
    st.notify.start({
      title: `Cleared ${n} item${n === 1 ? '' : 's'} from this room`,
      kind: 'success',
      actionLabel: 'Undo',
      onAction: () => useStore.getState().undo(),
    })
  }
  // Copy this room's floor + wall (+ ceiling, when set) finish to another
  // specific room (vs the "apply to all rooms" bulk buttons) — match two
  // bedrooms without touching the rest of the home.
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
    // Ceiling only when the source room actually has one (default is white =
    // absent), so copying never paints a ceiling the source didn't have.
    const ceiling = src ? resolvePlanRoomCeiling(st.finishes, src) : st.finishes.ceiling[roomId]
    if (floor) st.setFloorFinish(target.id as RoomId, floor)
    if (wall) st.setWallFinish(target.id as RoomId, wall)
    if (ceiling) st.setCeilingFinish(target.id as RoomId, ceiling)
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
  const fCeiling = useFeature('ceilingFinish')
  const fWallAccent = useFeature('wallAccentPicker')
  const fDesignerPicks = useFeature('designerPicks')
  const fComposer = useFeature('materialComposer')
  const fSaveMaterials = useFeature('saveMaterials')
  const fRecolor = useFeature('finishRecolor')
  const materials = useMaterials()
  const savedMaterials = useStore(useShallow((s) => s.savedMaterials))
  const saveMaterial = useStore((s) => s.saveMaterial)
  const removeSavedMaterial = useStore((s) => s.removeSavedMaterial)
  const renameSavedMaterial = useStore((s) => s.renameSavedMaterial)
  const renameUserMaterial = useStore((s) => s.renameUserMaterial)
  // Set of saved-material finish ids, so the picker grid can badge them as the
  // user's own + route their remove (X) to the saved-materials slice.
  const savedIds = useMemo(() => new Set(savedMaterials.map((m) => m.finishId)), [savedMaterials])
  const savedNameFor = (finishId: string): string | undefined =>
    savedMaterials.find((m) => m.finishId === finishId)?.name
  // A saved custom material (compose:/tint:/#hex id) removes from the saved
  // slice; an uploaded textured material removes from userMaterials + IDB.
  const removeUserOrSaved = (id: string) => {
    if (savedIds.has(id)) removeSavedMaterial(id)
    else removeUserMaterial(id)
  }
  const renameUserOrSaved = (id: string, name: string) => {
    if (savedIds.has(id)) renameSavedMaterial(id, name)
    else renameUserMaterial(id, name)
  }
  const handleSaveMaterial = (category: MaterialCategory) => (finishId: string, name: string) => {
    saveMaterial({ finishId, name, category })
    useStore
      .getState()
      .notify.start({ title: `Saved "${name}" to your materials`, kind: 'success' })
  }
  const [uploadOpen, setUploadOpen] = useState(false)
  const [finishQuery, setFinishQuery] = useState('')
  const [view, setView] = useState<View>('swatch')
  // Remember which surface was last finished, across sessions, so Browse opens
  // pre-filtered to it (and resolving applies to it).
  const [lastSurface, setLastSurfaceState] = useState<Surface>(() => {
    try {
      const stored = localStorage.getItem(LAST_SURFACE_KEY)
      if (stored === 'wall') return 'wall'
      // 'ceiling' is only a valid tab/surface when the ceilingFinish flag is on;
      // otherwise fall back to floor (the ceiling tab won't render).
      if (stored === 'ceiling' && fCeiling) return 'ceiling'
      return 'floor'
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
  // Ceiling defaults to plain white (no key) — `null`/`undefined` means unset.
  const activeCeiling = planRoom
    ? (resolvePlanRoomCeiling(finishes, planRoom) ?? undefined)
    : finishes.ceiling[roomId]

  const applyFinish = (surface: Surface, id: string) => {
    if (surface === 'floor') setFloorFinish(roomId, id)
    else if (surface === 'wall') setWallFinish(roomId, id)
    else setCeilingFinish(roomId, id)
  }

  const activeFor = (surface: Surface): string | undefined =>
    surface === 'floor' ? activeFloor : surface === 'wall' ? activeWall : activeCeiling

  // FINISH-RECOLOR: a custom colour pick repaints the surface's CURRENT finish
  // (keeps its texture/pattern) instead of replacing it with flat plaster paint
  // — resolution lives in the shared pure `recolorFinishId` (also used by the
  // accent-wall picker). Flag off → always the legacy bare hex.
  // NOTE: this runs on EVERY ColorPicker onChange tick (continuous during an
  // SV-pad / hue-bar drag), so it must NOT push to recents — a colour is
  // committed to recents once, when the ColorPicker closes on its final value.
  // The live apply itself is throttled inside ColorPicker so the FINISH-RECOLOR
  // bake can't flood the GPU during a drag.
  const handleCustomColor = (surface: Surface, hex: string) => {
    setLastSurface(surface)
    applyFinish(surface, fRecolor ? recolorFinishId(activeFor(surface), hex, materials) : hex)
  }

  const handleSelect = (surface: Surface, id: string) => {
    setLastSurface(surface)
    if (id.startsWith('#')) {
      pushRecentColor(id)
      applyFinish(surface, id)
      return
    }
    // Recently Used records the PLAIN base id even when the applied finish ends
    // up tinted below, so the row shows the texture itself.
    pushRecentFinish(id)
    // FINISH-RECOLOR: picking a new plain catalog finish while a colour override
    // (tint) is active keeps the colour — re-tint the NEW base with the same
    // colour + gloss (scale resets: it's base-specific) in repaint mode, which
    // is what makes "same colour, new texture" read correctly. Re-selecting the
    // tint's own base is the override chip's × / "back to plain" path, so it
    // applies plain instead of re-tinting.
    if (fRecolor && !isTintMaterialId(id) && !isComposedMaterialId(id)) {
      const cur = parseTintMaterialId(activeFor(surface) ?? '')
      if (cur && cur.baseId !== id) {
        applyFinish(surface, tintMaterialId(id, cur.color, 1, cur.roughness, 'repaint'))
        return
      }
    }
    applyFinish(surface, id)
  }

  const handleResolved = (id: string) => {
    applyFinish(lastSurface, id)
    setView('swatch')
  }

  // Active surface tab. The Ceiling tab only exists when the ceilingFinish
  // flag is on, so a stale 'ceiling' selection falls back to floor rather than
  // showing an empty tab.
  const activeTab: Surface = lastSurface === 'ceiling' && !fCeiling ? 'floor' : lastSurface

  return (
    <aside className="panel inspector dock-panel finish-picker">
      <div className="panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', minWidth: 0 }}>
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
          {/* Apartment master palette + per-room override (CUSTOMIZE-MASTER-PALETTE).
              Drives the "Apartment theme" + "Recommended" rows on every picker. */}
          <Disclosure summary="Apartment colour palette…">
            <div style={{ marginTop: 'var(--s-2)' }}>
              <MasterPaletteEditor roomId={roomId} />
            </div>
          </Disclosure>
          <div className="seg finish-surface-tabs" role="tablist" aria-label="Finish surface">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'floor'}
              className={activeTab === 'floor' ? 'on' : ''}
              onClick={() => setLastSurface('floor')}
            >
              Floor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'wall'}
              className={activeTab === 'wall' ? 'on' : ''}
              onClick={() => setLastSurface('wall')}
            >
              Walls
            </button>
            {fCeiling ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'ceiling'}
                className={activeTab === 'ceiling' ? 'on' : ''}
                onClick={() => setLastSurface('ceiling')}
              >
                Ceiling
              </button>
            ) : null}
          </div>
          {activeTab === 'floor' && (
            <>
              <SwatchGroup
                label="Floor"
                hideLabel
                items={filterFinishes(groups.floor, finishQuery)}
                active={activeFloor}
                onSelect={(id) => handleSelect('floor', id)}
                onRemoveUser={removeUserOrSaved}
                savedIds={savedIds}
                onRename={renameUserOrSaved}
                onCustom={(hex) => handleCustomColor('floor', hex)}
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
                  materials={groups.floor}
                  onApply={(id) => handleSelect('floor', id)}
                  onSave={fSaveMaterials ? handleSaveMaterial('floor') : undefined}
                  savedNameOf={savedNameFor}
                />
              ) : null}
            </>
          )}
          {activeTab === 'wall' && (
            <>
              <SwatchGroup
                label="Walls"
                hideLabel
                items={filterFinishes(groups.wall, finishQuery)}
                active={activeWall}
                onSelect={(id) => handleSelect('wall', id)}
                onRemoveUser={removeUserOrSaved}
                savedIds={savedIds}
                onRename={renameUserOrSaved}
                onCustom={(hex) => handleCustomColor('wall', hex)}
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
                  materials={groups.wall}
                  onApply={(id) => handleSelect('wall', id)}
                  onSave={fSaveMaterials ? handleSaveMaterial('wall') : undefined}
                  savedNameOf={savedNameFor}
                />
              ) : null}
            </>
          )}
          {/* Ceiling paints from the wall (paint/plaster) pool — a ceiling is
              painted like a wall. Default is plain white (no finish), so a
              "Reset to white" clears back to it. Gated by the ceilingFinish flag. */}
          {fCeiling && activeTab === 'ceiling' ? (
            <>
              <SwatchGroup
                label="Ceiling"
                hideLabel
                items={filterFinishes(groups.wall, finishQuery)}
                active={activeCeiling ?? ''}
                onSelect={(id) => handleSelect('ceiling', id)}
                onRemoveUser={removeUserOrSaved}
                savedIds={savedIds}
                onRename={renameUserOrSaved}
                onCustom={(hex) => handleCustomColor('ceiling', hex)}
                recent={recentColors}
                recentFinishIds={recentFinishes}
                curated={fDesignerPicks ? resolveDesignerPicks('wall', materials) : undefined}
              />
              <button
                type="button"
                className="finish-apply-all"
                onClick={() => {
                  if (!activeCeiling) return
                  setAllCeilingFinish(activeCeiling)
                  useStore.getState().notify.start({
                    title: 'Ceiling finish applied to every room',
                    kind: 'success',
                  })
                }}
                title="Use this ceiling finish in every room"
                disabled={!activeCeiling}
              >
                Apply ceiling to all rooms
              </button>
              {activeCeiling ? (
                <button
                  type="button"
                  className="btn ghost btn-block"
                  style={{ marginTop: 'var(--s-2)' }}
                  onClick={() => clearCeilingFinish(roomId)}
                  title="Reset this room's ceiling back to plain white"
                >
                  Reset ceiling to white
                </button>
              ) : null}
              {fComposer ? (
                <MaterialComposer
                  label="Ceiling"
                  active={activeCeiling ?? ''}
                  materials={groups.wall}
                  onApply={(id) => handleSelect('ceiling', id)}
                  onSave={fSaveMaterials ? handleSaveMaterial('wall') : undefined}
                  savedNameOf={savedNameFor}
                />
              ) : null}
            </>
          ) : null}
          {/* Accent walls (per-`wallId:roomId`): surface + manage this room's
              accents in one place. Creating one stays a 3D wall tap (opens the
              WallAccentPicker) — the wall→room mapping differs by plan type, so
              we don't re-enumerate it here; this is the management/discovery view. */}
          {fWallAccent && activeTab === 'wall'
            ? (() => {
                const accents = Object.entries(finishes.wallAccents).filter(
                  ([k]) => k.slice(k.lastIndexOf(':') + 1) === roomId,
                )
                return (
                  <div className="sec">
                    <div className="label">Accent walls</div>
                    {accents.length === 0 ? (
                      <p
                        className="panel-sub"
                        style={{
                          textTransform: 'none',
                          letterSpacing: 0,
                          margin: 'var(--s-1) 0 0',
                        }}
                      >
                        Tap any wall in the 3D view to paint it a different colour from the rest of
                        the room.
                      </p>
                    ) : (
                      <>
                        {accents.map(([key, id]) => {
                          const mat = materials[id]
                          const swatchColor = id.startsWith('#') ? id : (mat?.swatch ?? '#ccc')
                          const name = id.startsWith('#') ? id.toUpperCase() : (mat?.name ?? id)
                          return (
                            <div
                              key={key}
                              className="row"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--s-2)',
                                marginTop: 'var(--s-1)',
                              }}
                            >
                              <span
                                className="swatch"
                                style={{ backgroundColor: swatchColor }}
                                aria-hidden="true"
                              />
                              <span
                                className="flex-1"
                                style={{
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontSize: 'var(--t-xs)',
                                }}
                              >
                                {name}
                              </span>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => clearWallAccent(key)}
                                title="Match room finish (remove accent)"
                                aria-label={`Remove accent wall (${name})`}
                              >
                                <Icon.Reset width={14} height={14} />
                              </button>
                            </div>
                          )
                        })}
                        <p
                          className="panel-sub"
                          style={{
                            textTransform: 'none',
                            letterSpacing: 0,
                            margin: 'var(--s-2) 0 0',
                          }}
                        >
                          Tap another wall in the 3D view to add one.
                        </p>
                      </>
                    )}
                  </div>
                )
              })()
            : null}
          {otherRooms.length > 0 ? (
            <Select
              className="input"
              ariaLabel="Copy this room's floor, wall & ceiling finish to another room"
              value=""
              placeholder="Copy finishes to…"
              onChange={(v) => {
                if (v) copyFinishesTo(v)
              }}
              style={{ marginTop: 'var(--s-2)', width: '100%' }}
              options={[
                { value: '', label: 'Copy finishes to…', disabled: true },
                ...otherRooms.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
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
            <Select
              className="input"
              ariaLabel="Copy this room's layout to another room"
              value=""
              placeholder="Copy layout to…"
              onChange={(v) => {
                if (v) cloneLayoutTo(v)
              }}
              style={{ marginTop: 'var(--s-2)', width: '100%' }}
              options={[
                { value: '', label: 'Copy layout to…', disabled: true },
                ...otherRooms.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
          ) : null}
          {otherRooms.length > 0 ? (
            <Select
              className="input"
              ariaLabel="Swap this room's layout with another room"
              value=""
              placeholder="Swap layout with…"
              onChange={(v) => {
                if (v) swapLayoutWith(v)
              }}
              style={{ marginTop: 'var(--s-2)', width: '100%' }}
              options={[
                { value: '', label: 'Swap layout with…', disabled: true },
                ...otherRooms.map((r) => ({ value: r.id, label: r.name })),
              ]}
            />
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
            defaultCategory={lastSurface === 'floor' ? 'floor' : 'wall'}
          />
        </div>
      )}
    </aside>
  )
}
