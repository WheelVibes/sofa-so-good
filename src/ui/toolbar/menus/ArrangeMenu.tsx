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
import { EmptyState } from '../../EmptyState'
import { Icon } from '../icons'
import { SAVED_EMPTY } from '../savedEmptyStates'
import { shortcutLabel } from '../shortcuts'
import { MenuItem, MenuLabel, ToolbarMenu } from '../ToolbarMenu'

/** Arrange cluster: quick actions (Smart Start / Tidy) plus three compact
 *  "pick → Apply" pickers — Sets, Presets and finish Styles — that each collapse
 *  a long list into one dropdown, keeping the menu short. Rows are the shared
 *  `MenuItem` + headers the shared `MenuLabel` (TB-9 — no hand-rolled rows). */
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
      {fSmartStart && (
        <MenuItem
          icon="Presets"
          label="Smart Start…"
          sub="Pick a style, furnish every room"
          onClick={() => setSmartStartOpen(true)}
        />
      )}
      <MenuItem
        icon="Tidy"
        label="Tidy home"
        sub="Auto-arrange every room"
        kbd={shortcutLabel('tidyHome')}
        onClick={tidyHome}
      />

      <MenuLabel>Drop a set</MenuLabel>
      <PickApply
        placeholder="Choose a furniture set…"
        options={setOptions}
        applyLabel="Drop"
        onApply={applySet}
      />

      {fUserSets && (
        <>
          <MenuLabel>My sets</MenuLabel>
          <MenuItem
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
            <EmptyState {...SAVED_EMPTY.sets} />
          ) : (
            userSets.map((u) => (
              <SavedRow
                key={u.id}
                icon={Icon.Sets}
                name={u.name}
                applyTitle={`Drop “${u.name}” (${u.items.length} items)`}
                onApply={() => dropUserSet(u.id)}
                deleteLabel={`Delete ${u.name}`}
                deleteTitle="Delete set"
                onDelete={async () => {
                  // Destructive-action policy (TB-9): a saved set is
                  // user-authored data — confirm before deleting.
                  const ok = await useStore.getState().confirmAction({
                    title: 'Delete set?',
                    message: `“${u.name}” (${u.items.length} items) will be removed from My sets.`,
                    confirmLabel: 'Delete',
                    danger: true,
                  })
                  if (ok) deleteUserSet(u.id)
                }}
              />
            ))
          )}
        </>
      )}

      <MenuLabel>Apply a preset</MenuLabel>
      <PickApply
        placeholder="Choose a layout preset…"
        options={LAYOUT_PRESETS.map((p) => ({ id: p.id, name: p.name }))}
        onApply={(id) => applyLayoutPreset(id)}
      />

      <MenuLabel>Apply a style</MenuLabel>
      <PickApply
        placeholder="Choose a finish style…"
        options={STYLE_PRESETS.map((p) => ({ id: p.id, name: p.name }))}
        onApply={(id) => {
          const preset = STYLE_PRESETS.find((p) => p.id === id)
          if (preset) applyStyle(preset, setFloorFinish, setWallFinish)
        }}
      />

      <MenuLabel>My styles</MenuLabel>
      <MenuItem
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
        <EmptyState {...SAVED_EMPTY.styles} />
      ) : (
        userStyles.map((s) => (
          <SavedRow
            key={s.id}
            icon={Icon.Style}
            name={s.name}
            onApply={() => applyUserStyle(s.id)}
            deleteLabel={`Delete ${s.name}`}
            deleteTitle="Delete style"
            onDelete={async () => {
              // Destructive-action policy (TB-9): confirm before deleting a
              // user-authored saved style.
              const ok = await useStore.getState().confirmAction({
                title: 'Delete style?',
                message: `“${s.name}” will be removed from My styles.`,
                confirmLabel: 'Delete',
                danger: true,
              })
              if (ok) deleteUserStyle(s.id)
            }}
          />
        ))
      )}
    </ToolbarMenu>
  )
}

/** A saved user set/style row: a `.menu-item`-styled apply button plus a
 *  trailing delete "×" (two interactive controls, so it can't be a plain
 *  `MenuItem` — same composite pattern as `SavedViewsSection`'s rows). */
function SavedRow({
  icon: Glyph,
  name,
  applyTitle,
  onApply,
  deleteLabel,
  deleteTitle,
  onDelete,
}: {
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode
  name: string
  applyTitle?: string
  onApply: () => void
  deleteLabel: string
  deleteTitle: string
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-md pr-1 hover:bg-[var(--surface-3)]">
      <button
        type="button"
        role="menuitem"
        onClick={onApply}
        title={applyTitle}
        className="flex flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left"
      >
        <span className="text-[var(--text-2)]">
          <Glyph width={16} height={16} />
        </span>
        <span className="block flex-1 text-[13px] text-[var(--text)]">{name}</span>
      </button>
      <button
        type="button"
        aria-label={deleteLabel}
        title={deleteTitle}
        onClick={onDelete}
        className="icon-btn danger"
      >
        ×
      </button>
    </div>
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
        className="btn btn-soft btn-sm arr-apply"
        disabled={!val}
        onClick={() => val && onApply(val)}
      >
        {applyLabel}
      </button>
    </div>
  )
}
