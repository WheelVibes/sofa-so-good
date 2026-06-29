import { useFeature } from '../../../features/useFeature'
import { dropBuiltinSet, dropIkeaSet, dropUserSet } from '../../../furniture/arrangeActions'
import { FURNITURE_SETS } from '../../../furniture/furnitureSets'
import { ikeaSetRecipes } from '../../../furniture/ikeaSets'
import { LAYOUT_PRESETS } from '../../../furniture/layoutPresets'
import { applyStyle, STYLE_PRESETS } from '../../../materials/stylePresets'
import { useStore } from '../../../state/store'
import { Item, Section } from './parts'

/** Arrange — sets / presets / styles, only inside the per-room editor. */
export function ArrangeSection({
  activeId,
  act,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean }) => () => void
}) {
  const s = useStore
  const userStyles = useStore((st) => st.userStyles)
  const userSets = useStore((st) => st.userSets)
  const fUserSets = useFeature('userSets')
  const recipes = ikeaSetRecipes()

  return (
    <Section id="arrange" title="Arrange" icon="Sets" activeId={activeId}>
      <div className="m-sub-h">Sets</div>
      {FURNITURE_SETS.map((set) => (
        <Item
          key={set.id}
          icon="Sets"
          label={set.name}
          onClick={act(() => dropBuiltinSet(set.id))}
        />
      ))}
      {recipes.map((r) => (
        <Item
          key={r.setKey}
          icon="Sets"
          label={r.setName}
          sub="IKEA set"
          onClick={act(() => dropIkeaSet(r.setKey))}
        />
      ))}
      {fUserSets ? (
        <>
          <div className="m-sub-h">My sets</div>
          <Item
            icon="Sets"
            label="Save selection as set…"
            onClick={act(async () => {
              if (s.getState().selectedItemIds.length === 0) {
                s.getState().notify.start({
                  title: 'Select items to save as a set',
                  kind: 'info',
                })
                return
              }
              const name = await s.getState().promptText({
                title: 'Save set',
                label: 'Name this set',
                defaultValue: `My set ${userSets.length + 1}`,
                submitLabel: 'Save',
              })
              if (name) s.getState().saveSelectionAsSet(name)
            })}
          />
          {userSets.map((u) => (
            <Item
              key={u.id}
              icon="Sets"
              label={u.name}
              sub={`${u.items.length} items`}
              onClick={act(() => dropUserSet(u.id))}
            />
          ))}
        </>
      ) : null}
      <div className="m-sub-h">Presets</div>
      {LAYOUT_PRESETS.map((p) => (
        <Item
          key={p.id}
          icon="Presets"
          label={p.name}
          sub={p.description}
          onClick={act(() => s.getState().applyLayoutPreset(p.id))}
        />
      ))}
      <div className="m-sub-h">Style</div>
      {STYLE_PRESETS.map((p) => (
        <Item
          key={p.id}
          icon="Style"
          label={p.name}
          onClick={act(() =>
            applyStyle(p, s.getState().setFloorFinish, s.getState().setWallFinish),
          )}
        />
      ))}
      <div className="m-sub-h">My styles</div>
      <Item
        icon="Style"
        label="Save current style…"
        onClick={act(async () => {
          const name = await s.getState().promptText({
            title: 'Save style',
            label: "Name this style (captures every room's finishes)",
            defaultValue: `My style ${userStyles.length + 1}`,
            submitLabel: 'Save',
          })
          if (name) s.getState().saveCurrentStyle(name)
        })}
      />
      {userStyles.map((st) => (
        <Item
          key={st.id}
          icon="Style"
          label={st.name}
          onClick={act(() => s.getState().applyUserStyle(st.id))}
        />
      ))}
    </Section>
  )
}
