import { placementWalls } from '../collision/placementWalls'
import { useFeature } from '../features/useFeature'
import { allPlanRooms, itemsInRoom } from '../floorplan/levels'
import { roomCategory, toRoomKind } from '../floorplan/roomCategory'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultItemProps } from '../furniture/placement/defaultItemProps'
import { placeStarterItem } from '../layout/placeStarterItem'
import { getRoomEditorShell } from '../scene/roomEditorShell'
import { useStore } from '../state/store'
import { starterAnchorsForRoomKind } from './catalog/roomStarters'
import { Icon } from './toolbar/icons'

/**
 * A gentle empty-state nudge shown in the per-room editor when the room has no
 * furniture yet (a fresh custom-plan room, or after "Clear room"). It offers a
 * row of tap-to-add "essentials" chips for that room-kind's key anchor pieces
 * (roomStarters — bedroom → bed/wardrobe/nightstand, living → sofa/TV/coffee,
 * …); each chip adds ONE sensibly wall-anchored piece via the shared placement
 * helper, giving a Simple-tier user concrete starting help (the analytical
 * `suggestions` surface is Pro-only). When the room kind has no starter set
 * (service/utility spaces) or the flag is off, it falls back to the plain
 * "open the catalog" prompt.
 *
 * Hidden once the catalog is open, in walk mode, and outside the editor. Pure
 * DOM overlay; only the buttons are interactive so it never blocks orbiting. It
 * mounts in the shared scene overlay (`App.tsx`), so it renders identically on
 * desktop and mobile.
 */
export function EmptyRoomHint() {
  const active = useStore((s) => s.roomEditor.active)
  const roomId = useStore((s) => s.roomEditor.roomId)
  // Select the PLAN, not a derived room array: `allPlanRooms` returns a fresh
  // reference on a multi-storey plan, which as a selector re-renders forever.
  const plan = useStore((s) => s.floorPlan)
  const items = useStore((s) => s.items)
  const cameraMode = useStore((s) => s.cameraMode)
  const catalogOpen = useStore((s) => s.catalogOpen)
  const setCatalogOpen = useStore((s) => s.setCatalogOpen)
  const setLeftMode = useStore((s) => s.setLeftMode)
  const startersEnabled = useFeature('roomStarters')
  // Closeable: once dismissed it stays hidden (per-device), like other hints —
  // so a user who just wants to see the empty room isn't stuck with it.
  const dismissed = useStore((s) => s.dismissedCallouts.includes('empty-room-hint'))
  const dismissCallout = useStore((s) => s.dismissCallout)

  if (!active || !roomId || cameraMode !== 'orbit' || catalogOpen || dismissed) return null
  // EVERY storey (F13) — the hint never fired for an upstairs room, and the
  // emptiness test must only count furniture on the room's OWN floor.
  const room = allPlanRooms(plan).find((r) => r.id === roomId)
  if (!room) return null
  const empty = itemsInRoom(plan, items, room.id).length === 0
  if (!empty) return null

  // Starter anchor chips for this room kind (built-in defs only). Empty when the
  // flag is off, or for a kind with no starter set (service/utility/other).
  const anchorDefs = (
    startersEnabled ? starterAnchorsForRoomKind(toRoomKind(roomCategory(room))) : []
  )
    .map((id) => BUILTIN_CATALOG[id])
    .filter((def): def is NonNullable<typeof def> => Boolean(def))

  const openCatalog = () => {
    setLeftMode('catalog')
    setCatalogOpen(true)
  }

  /** Add one sensibly-placed instance of `defId` to the current room, then let
   *  the empty-state unmount naturally (the room is no longer empty). */
  const addStarter = (defId: string) => {
    const s = useStore.getState()
    const rid = s.roomEditor.roomId
    if (!rid) return
    const shell = getRoomEditorShell(s.floorPlan, rid)
    const def = BUILTIN_CATALOG[defId]
    if (!shell || !def) return
    const props = defaultItemProps(def)
    const existing = itemsInRoom(s.floorPlan, s.items, rid)
    const placement = placeStarterItem({
      rects: shell.shell.rects,
      def,
      props,
      defId,
      existing,
      defs: BUILTIN_CATALOG,
      doors: s.doors,
      walls: placementWalls(s),
    })
    if (!placement) return
    s.addItem({ defId, position: placement.position, rotation: placement.rotation, props })
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      aria-hidden="false"
    >
      <div
        className="panel"
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          textAlign: 'center',
          padding: '20px 24px',
          maxWidth: 340,
          borderRadius: 'var(--r-3, 12px)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => dismissCallout('empty-room-hint')}
          style={{ position: 'absolute', top: 8, right: 8 }}
        >
          <Icon.Close width={16} height={16} />
        </button>
        <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}>
          <Icon.Catalog width={26} height={26} />
        </span>
        <div
          style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--text)', marginTop: 8 }}
        >
          This room is empty
        </div>
        <p
          style={{
            fontSize: 'var(--t-sm)',
            lineHeight: 1.5,
            color: 'var(--text-2)',
            margin: '6px 0 14px',
          }}
        >
          {anchorDefs.length > 0
            ? 'Tap an essential to add it, or open the catalog for more.'
            : 'Add furniture from the catalog to start designing this space.'}
        </p>
        {anchorDefs.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 'var(--s-2)',
              marginBottom: 'var(--s-3)',
            }}
          >
            {anchorDefs.map((def) => (
              <button
                key={def.id}
                type="button"
                className="btn btn-sm"
                onClick={() => addStarter(def.id)}
              >
                <Icon.Plus width={13} height={13} />
                {def.name}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-accent" onClick={openCatalog}>
          <Icon.Catalog width={14} height={14} />
          Open catalog
        </button>
      </div>
    </div>
  )
}
