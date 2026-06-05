import { planRoomArea } from '../../../floorplan/types'
import { BUILTIN_CATALOG } from '../../../furniture/builtinCatalog'
import { FURNITURE_SETS } from '../../../furniture/furnitureSets'
import { buildSetGroup, ikeaSetRecipes, newSetItemId } from '../../../furniture/ikeaSets'
import { LAYOUT_PRESETS } from '../../../furniture/layoutPresets'
import type { FurnitureDef, FurnitureItem } from '../../../furniture/types'
import { tidyHome } from '../../../layout/tidyHome'
import { applyStyle, STYLE_PRESETS } from '../../../materials/stylePresets'
import { newGroupId } from '../../../state/slices/groupsSlice'
import { useStore } from '../../../state/store'
import { Icon, type IconName } from '../icons'
import { shortcutLabel } from '../shortcuts'
import { ToolbarMenu } from '../ToolbarMenu'

/** Catalog for set expansion: built-ins + the store's imported (IKEA/user) defs. */
function builtinPlusIkea(): Record<string, FurnitureDef> {
  const st = useStore.getState()
  const merged: Record<string, FurnitureDef> = { ...BUILTIN_CATALOG }
  for (const def of st.userFurniture ?? []) merged[def.id] = def
  return merged
}

/** Centre of the largest room in the active plan (the drop target). */
function dropCentre(): [number, number] {
  const st = useStore.getState()
  const rooms = st.floorPlan.rooms
  const big = rooms.reduce((a, b) => (planRoomArea(b) > planRoomArea(a) ? b : a), rooms[0])
  return big
    ? [big.origin[0] + big.width / 2, big.origin[1] + big.depth / 2]
    : [st.floorPlan.extent[0] / 2, st.floorPlan.extent[1] / 2]
}

/** Append items as a selected group in one history entry. */
function dropArranged(items: FurnitureItem[]) {
  const st = useStore.getState()
  st.pushHistory()
  const gid = newGroupId()
  const grouped = items.map((i) => ({ ...i, groupId: gid }))
  st.setItems([...st.items, ...grouped])
  st.setSelectedItemIds(grouped.map((i) => i.id))
}

/** Arrange cluster: furniture sets, full-flat presets, finish styles, the
 *  floor-plan editor, and one-click Tidy. Logic lifted unchanged from the
 *  previous Toolbar (SetsMenu / PresetPicker / StylePicker / FloorPlanButton). */
export function ArrangeMenu() {
  const applyLayoutPreset = useStore((s) => s.applyLayoutPreset)
  const setSmartStartOpen = useStore((s) => s.setSmartStartOpen)
  const setFloorFinish = useStore((s) => s.setFloorFinish)
  const setWallFinish = useStore((s) => s.setWallFinish)
  const userStyles = useStore((s) => s.userStyles)
  const saveCurrentStyle = useStore((s) => s.saveCurrentStyle)
  const applyUserStyle = useStore((s) => s.applyUserStyle)
  const deleteUserStyle = useStore((s) => s.deleteUserStyle)
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const toggleFloorPlanEditing = useStore((s) => s.toggleFloorPlanEditing)
  const recipes = ikeaSetRecipes()

  const dropBuiltin = (setId: string) => {
    const set = FURNITURE_SETS.find((s) => s.id === setId)
    if (!set) return
    const [bx, bz] = dropCentre()
    dropArranged(
      set.items.map((e) => ({
        id: newSetItemId(),
        defId: e.defId,
        position: [bx + e.dx, bz + e.dz] as [number, number],
        rotation: e.rotation,
        props: e.props ?? {},
      })),
    )
  }
  const dropIkea = (setKey: string) => {
    const recipe = recipes.find((r) => r.setKey === setKey)
    if (!recipe) return
    const [bx, bz] = dropCentre()
    dropArranged(buildSetGroup(recipe, { x: bx, z: bz }, builtinPlusIkea()))
  }

  return (
    <ToolbarMenu icon="Sets" label="Arrange" active={floorPlanEditing} width={256}>
      <div className="max-h-[70vh] overflow-y-auto">
        <Action
          icon="Presets"
          label="Smart Start…"
          sub="Pick a style, furnish every room"
          onClick={() => setSmartStartOpen(true)}
        />
        <Action
          icon="Tidy"
          label={`Tidy home${chip(shortcutLabel('tidyHome'))}`}
          sub="Auto-arrange every room"
          onClick={tidyHome}
        />
        <Action
          icon="FloorPlan"
          label="Floor plan"
          sub="Edit walls, rooms, doors"
          active={floorPlanEditing}
          onClick={toggleFloorPlanEditing}
        />

        <Header>Sets</Header>
        {FURNITURE_SETS.map((s) => (
          <Action key={s.id} icon="Sets" label={s.name} onClick={() => dropBuiltin(s.id)} />
        ))}
        {recipes.map((r) => (
          <Action
            key={r.setKey}
            icon="Sets"
            label={r.setName}
            sub="IKEA set"
            onClick={() => dropIkea(r.setKey)}
          />
        ))}

        <Header>Presets</Header>
        {LAYOUT_PRESETS.map((p) => (
          <Action
            key={p.id}
            icon="Presets"
            label={p.name}
            sub={p.description}
            onClick={() => applyLayoutPreset(p.id)}
          />
        ))}

        <Header>Style</Header>
        {STYLE_PRESETS.map((p) => (
          <Action
            key={p.id}
            icon="Style"
            label={p.name}
            onClick={() => applyStyle(p, setFloorFinish, setWallFinish)}
          />
        ))}

        <Header>My styles</Header>
        <Action
          icon="Style"
          label="Save current style…"
          sub="Capture every room's floor + wall finish"
          onClick={() => {
            const name = window.prompt('Name this style:', `My style ${userStyles.length + 1}`)
            if (name !== null) saveCurrentStyle(name)
          }}
        />
        {userStyles.length === 0 ? (
          <div className="px-2 py-1 text-[10px] text-[var(--text-3)]">
            No saved styles yet — finish a room, then save.
          </div>
        ) : (
          userStyles.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1 rounded-md pr-1 hover:bg-[var(--surface-2)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => applyUserStyle(s.id)}
                className="flex flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left"
              >
                <span className="text-[var(--text-2)]">
                  <Icon.Style width={16} height={16} />
                </span>
                <span className="block flex-1 text-[13px] text-[var(--text)]">{s.name}</span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${s.name}`}
                title="Delete style"
                onClick={() => deleteUserStyle(s.id)}
                className="rounded px-1.5 py-1 text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--danger)]"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </ToolbarMenu>
  )
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 border-t border-[var(--border)] px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] first:mt-0 first:border-t-0">
      {children}
    </div>
  )
}

/** Like MenuItem but tuned for this dense panel (smaller rows). */
function Action({
  icon,
  label,
  sub,
  active,
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  active?: boolean
  onClick: () => void
}) {
  const Cmp = Icon[icon]
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--surface-2)] ${active ? 'bg-[var(--surface-2)]' : ''}`}
    >
      <span className="text-[var(--text-2)]">
        <Cmp width={16} height={16} />
      </span>
      <span className="flex-1">
        <span className="block text-[13px] text-[var(--text)]">{label}</span>
        {sub ? <span className="block text-[10px] text-[var(--text-3)]">{sub}</span> : null}
      </span>
    </button>
  )
}

function chip(s: string): string {
  return s ? `  (${s})` : ''
}
