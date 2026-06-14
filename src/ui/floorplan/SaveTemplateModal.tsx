import { useEffect, useMemo, useState } from 'react'
import { PLAN_TEMPLATES, templateCategoryTree } from '../../floorplan/templates'
import type { HousingType } from '../../floorplan/types'
import { useStore } from '../../state/store'
import { FuzzyCombo } from '../FuzzyCombo'
import { Modal } from '../Modal'

const HOUSING_TYPES: HousingType[] = ['HDB', 'Condominium']

/**
 * Collects a name + template category (housing type › project › apartment type)
 * when saving the current plan to the library, so user-authored apartments are
 * categorised like the built-ins. Project names offer the existing projects (for
 * the chosen housing type) as a datalist while still allowing a free-text new
 * one. On save it patches the plan's `name` + `category`, then stores it.
 */
export function SaveTemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plan = useStore((s) => s.floorPlan)
  const tree = useMemo(() => templateCategoryTree(PLAN_TEMPLATES), [])

  const [name, setName] = useState('')
  const [housing, setHousing] = useState<HousingType>('HDB')
  const [project, setProject] = useState('')
  const [apartment, setApartment] = useState('')

  // Seed from the active plan's current name/category each time the modal opens.
  useEffect(() => {
    if (!open) return
    setName(plan.name)
    setHousing(plan.category?.housingType ?? 'HDB')
    setProject(plan.category?.projectName ?? '')
    setApartment(plan.category?.apartmentType ?? '')
  }, [open, plan])

  const projectOptions = useMemo(() => [...(tree.get(housing)?.keys() ?? [])], [tree, housing])
  // Existing apartment types within the chosen housing type — offered as
  // suggestions only; the field stays free text so a custom unit (e.g.
  // "2-Room + Study") or a brand-new project name can be typed.
  const apartmentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const list of tree.get(housing)?.values() ?? []) {
      for (const t of list) if (t.category) set.add(t.category.apartmentType)
    }
    return [...set]
  }, [tree, housing])

  if (!open) return null

  const canSave = name.trim() && project.trim() && apartment.trim()

  const save = () => {
    if (!canSave) return
    const a = useStore.getState()
    a.updateFloorPlanMeta({
      name: name.trim(),
      category: {
        housingType: housing,
        projectName: project.trim(),
        apartmentType: apartment.trim(),
      },
    })
    a.saveCurrentPlan(name.trim())
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Save apartment to library" width={380}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="label">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            aria-label="Apartment name"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="label">Housing type</span>
          <select
            value={housing}
            onChange={(e) => setHousing(e.target.value as HousingType)}
            className="input"
            aria-label="Housing type"
          >
            {HOUSING_TYPES.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs">
          <span className="label">Project name</span>
          <FuzzyCombo
            value={project}
            onChange={setProject}
            options={projectOptions}
            placeholder="e.g. Serangoon North Vista"
            ariaLabel="Project name"
          />
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <span className="label">Apartment type</span>
          <FuzzyCombo
            value={apartment}
            onChange={setApartment}
            options={apartmentOptions}
            placeholder="e.g. 4-Room or 2-Room + Study"
            ariaLabel="Apartment type"
          />
        </div>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          Search existing values or pick “Add …” to use your own.
        </span>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-accent" disabled={!canSave}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
