import { useMemo, useState } from 'react'
import { PLAN_TEMPLATES, templateCategoryTree } from '../../floorplan/templates'
import type { FloorPlan, HousingType } from '../../floorplan/types'
import { useStore } from '../../state/store'

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

  const apply = (tpl: FloorPlan) => {
    const a = useStore.getState()
    a.pushHistory()
    a.setItems([])
    a.setFloorPlan(JSON.parse(JSON.stringify(tpl)))
    a.setPlanSelection(null)
  }

  return (
    <div className="flex items-center gap-1" title="Start from a template apartment">
      <select
        value={housing}
        onChange={(e) => {
          setHousing(e.target.value as HousingType | '')
          setProject('')
        }}
        className="input"
        style={{ width: 'auto' }}
        aria-label="Template housing type"
      >
        <option value="">Template…</option>
        {housingTypes.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      {housing ? (
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="input"
          style={{ width: 'auto' }}
          aria-label="Template project"
        >
          <option value="">Project…</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      ) : null}
      {housing && project ? (
        <select
          value=""
          onChange={(e) => {
            const tpl = apartments.find((t) => t.id === e.target.value)
            if (tpl) apply(tpl)
          }}
          className="input"
          style={{ width: 'auto' }}
          aria-label="Template apartment type"
        >
          <option value="">Type…</option>
          {apartments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.category?.apartmentType ?? t.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
