import { useMemo, useState } from 'react'
import { PLAN_TEMPLATES, templateCategoryTree } from '../../floorplan/templates'
import type { FloorPlan, HousingType } from '../../floorplan/types'
import { Select } from '../controls/Select'
import { confirmApplyTemplate } from '../planActions'

/**
 * Cascading template picker: Housing type › Project › Apartment type. Choosing
 * an apartment type loads that starter plan (replacing the active shell + its
 * furniture). Replaces the old flat "Template…" dropdown so the (growing) set of
 * built-in apartments stays navigable. The three levels are derived from each
 * template's `category` via `templateCategoryTree`.
 */
export function TemplatePicker() {
  const tree = useMemo(() => templateCategoryTree(PLAN_TEMPLATES), [])
  const housingTypes = useMemo(() => [...tree.keys()], [tree])
  const [housing, setHousing] = useState<HousingType | ''>('')
  const [project, setProject] = useState('')

  const projects = housing ? [...(tree.get(housing)?.keys() ?? [])] : []
  const apartments = housing && project ? (tree.get(housing)?.get(project) ?? []) : []

  // Applying a template replaces the plan AND clears the furniture, so it is
  // confirmed like every other destructive plan swap (`ui/planActions.ts`) —
  // it used to fire straight off the third dropdown's change event.
  const apply = (tpl: FloorPlan) => {
    void confirmApplyTemplate(tpl)
  }

  return (
    <div className="flex items-center gap-1" title="Start from a template apartment">
      <Select
        value={housing}
        onChange={(v) => {
          setHousing(v as HousingType | '')
          setProject('')
        }}
        className="input"
        style={{ width: 'auto' }}
        ariaLabel="Template housing type"
        options={[
          { value: '', label: 'Template…' },
          ...housingTypes.map((h) => ({ value: h, label: h })),
        ]}
      />
      {housing ? (
        <Select
          value={project}
          onChange={(v) => setProject(v)}
          className="input"
          style={{ width: 'auto' }}
          ariaLabel="Template project"
          options={[
            { value: '', label: 'Project…' },
            ...projects.map((p) => ({ value: p, label: p })),
          ]}
        />
      ) : null}
      {housing && project ? (
        <Select
          value=""
          onChange={(v) => {
            const tpl = apartments.find((t) => t.id === v)
            if (tpl) apply(tpl)
          }}
          className="input"
          style={{ width: 'auto' }}
          ariaLabel="Template apartment type"
          options={[
            { value: '', label: 'Type…' },
            ...apartments.map((t) => ({
              value: t.id,
              label: t.category?.apartmentType ?? t.name,
            })),
          ]}
        />
      ) : null}
    </div>
  )
}
