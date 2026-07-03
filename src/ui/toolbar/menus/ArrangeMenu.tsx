import { useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import { dropBuiltinSet, dropIkeaSet, dropUserSet } from '../../../furniture/arrangeActions'
import { FURNITURE_SETS } from '../../../furniture/furnitureSets'
import { ikeaSetRecipes } from '../../../furniture/ikeaSets'
import { LAYOUT_PRESETS } from '../../../furniture/layoutPresets'
import { tidyHome } from '../../../layout/tidyHome'
import { applyStyle, STYLE_PRESETS } from '../../../materials/stylePresets'
import { useStore } from '../../../state/store'
import { Select } from '../../controls/Select'
import { Icon, type IconName } from '../icons'
import { KbdChip } from '../KbdChip'
import { shortcutLabel } from '../shortcuts'
import { ToolbarMenu } from '../ToolbarMenu'

/** Arrange cluster: quick actions (Smart Start / Tidy) plus three compact
 *  "pick → Apply" pickers — Sets, Presets and finish Styles — that each collapse
 *  a long list into one dropdown, keeping the menu short. */
export function ArrangeMenu() {
  const applyLayoutPreset = useStore((s) => s.applyLayoutPreset)
  const setSmartStartOpen = useStore((s) => s.setSmartStartOpen)
  const setFloorFinish = useStore((s) => s.setFloorFinish)
  const setWallFinish = useStore((s) => s.setWallFinish)
  const userStyles = useStore((s) => s.userStyles)
  const saveCurrentStyle = useStore((s) => s.saveCurrentStyle)
  const applyUserStyle = useStore((s) => s.applyUserStyle)
  const deleteUserStyle = useStore((s) => s.deleteUserStyle)
  const userSets = useStore((s) => s.userSets)
  const saveSelectionAsSet = useStore((s) => s.saveSelectionAsSet)
  const deleteUserSet = useStore((s) => s.deleteUserSet)
  const selectionCount = useStore((s) => s.selectedItemIds.length)
  const recipes = ikeaSetRecipes()
  const fSmartStart = useFeature('smartStart')
  const fUserSets = useFeature('userSets')

  const setOptions = [
    ...FURNITURE_SETS.map((s) => ({ id: `b:${s.id}`, name: s.name })),
    ...recipes.map((r) => ({ id: `i:${r.setKey}`, name: `${r.setName} (IKEA)` })),
  ]
  const applySet = (val: string) => {
    if (val.startsWith('b:')) dropBuiltinSet(val.slice(2))
    else if (val.startsWith('i:')) dropIkeaSet(val.slice(2))
  }

  return (
    <ToolbarMenu icon="Sets" label="Arrange" width={264}>
      <div className="max-h-[70vh] overflow-y-auto">
        {fSmartStart && (
          <Action
            icon="Presets"
            label="Smart Start…"
            sub="Pick a style, furnish every room"
            onClick={() => setSmartStartOpen(true)}
          />
        )}
        <Action
          icon="Tidy"
          label="Tidy home"
          sub="Auto-arrange every room"
          kbd={shortcutLabel('tidyHome')}
          onClick={tidyHome}
        />

        <Header>Drop a set</Header>
        <PickApply
          placeholder="Choose a furniture set…"
          options={setOptions}
          applyLabel="Drop"
          onApply={applySet}
        />

        {fUserSets && (
          <>
            <Header>My sets</Header>
            <Action
              icon="Sets"
              label="Save selection as set…"
              sub={
                selectionCount > 0
                  ? `Capture ${selectionCount} selected ${selectionCount === 1 ? 'item' : 'items'}`
                  : 'Select items first, then save'
              }
              onClick={async () => {
                if (selectionCount === 0) {
                  useStore.getState().notify.start({
                    title: 'Select items to save as a set',
                    kind: 'info',
                  })
                  return
                }
                const name = await useStore.getState().promptText({
                  title: 'Save set',
                  label: 'Name this set (drop it again from this menu)',
                  defaultValue: `My set ${userSets.length + 1}`,
                  submitLabel: 'Save',
                })
                if (name && saveSelectionAsSet(name))
                  useStore.getState().notify.start({ title: `Saved “${name}”`, kind: 'success' })
              }}
            />
            {userSets.length === 0 ? (
              <div className="px-2 py-1 text-[10px] text-[var(--text-3)]">
                No saved sets yet — select a few pieces, then save.
              </div>
            ) : (
              userSets.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-1 rounded-md pr-1 hover:bg-[var(--surface-2)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => dropUserSet(u.id)}
                    title={`Drop “${u.name}” (${u.items.length} items)`}
                    className="flex flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left"
                  >
                    <span className="text-[var(--text-2)]">
                      <Icon.Sets width={16} height={16} />
                    </span>
                    <span className="block flex-1 text-[13px] text-[var(--text)]">{u.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${u.name}`}
                    title="Delete set"
                    onClick={() => deleteUserSet(u.id)}
                    className="rounded px-1.5 py-1 text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--danger)]"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </>
        )}

        <Header>Apply a preset</Header>
        <PickApply
          placeholder="Choose a layout preset…"
          options={LAYOUT_PRESETS.map((p) => ({ id: p.id, name: p.name }))}
          onApply={(id) => applyLayoutPreset(id)}
        />

        <Header>Apply a style</Header>
        <PickApply
          placeholder="Choose a finish style…"
          options={STYLE_PRESETS.map((p) => ({ id: p.id, name: p.name }))}
          onApply={(id) => {
            const preset = STYLE_PRESETS.find((p) => p.id === id)
            if (preset) applyStyle(preset, setFloorFinish, setWallFinish)
          }}
        />

        <Header>My styles</Header>
        <Action
          icon="Style"
          label="Save current style…"
          sub="Capture every room's floor + wall finish"
          onClick={async () => {
            const name = await useStore.getState().promptText({
              title: 'Save style',
              label: "Name this style (captures every room's finishes)",
              defaultValue: `My style ${userStyles.length + 1}`,
              submitLabel: 'Save',
            })
            if (name) saveCurrentStyle(name)
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

/** A compact dropdown + Apply row. Stops click propagation so interacting with
 *  the native select / Apply button doesn't close the surrounding toolbar menu;
 *  the menu stays open so several picks can be applied in a row. */
function PickApply({
  placeholder,
  options,
  applyLabel = 'Apply',
  onApply,
}: {
  placeholder: string
  options: { id: string; name: string }[]
  applyLabel?: string
  onApply: (id: string) => void
}) {
  const [val, setVal] = useState('')
  return (
    <div className="arr-pick" onClick={(e) => e.stopPropagation()}>
      <Select
        className="input arr-select"
        value={val}
        ariaLabel={placeholder}
        placeholder={placeholder}
        onChange={(v) => setVal(v)}
        options={[
          { value: '', label: placeholder, disabled: true },
          ...options.map((o) => ({ value: o.id, label: o.name })),
        ]}
      />
      <button
        type="button"
        className="btn btn-soft sm arr-apply"
        disabled={!val}
        onClick={() => val && onApply(val)}
      >
        {applyLabel}
      </button>
    </div>
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
  kbd,
  onClick,
}: {
  icon: IconName
  label: string
  sub?: string
  active?: boolean
  /** Shortcut combo label (from `shortcuts.ts`), rendered as a right-aligned
   *  `.mi-kbd` chip (P24) — never hardcode the key text inline in `label`. */
  kbd?: string
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
      {kbd ? <KbdChip>{kbd}</KbdChip> : null}
    </button>
  )
}
