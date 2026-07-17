import { PET_TYPE_LABEL, PET_TYPES } from '../analysis/petCompliance'
import { useStore } from '../state/store'

/**
 * "Do you have pets?" multi-select (Pet program P6). A row of toggle chips — one
 * per pet type — driving the per-design `petTypes` profile. Shared by the Scene
 * menu (desktop), the mobile Scene sheet, and the Pet-compliance panel's empty
 * state so all three stay in lock-step. Pure token classes (`.chip`/`.chip.on`),
 * no colour literals, keyboard + touch friendly.
 */
export function PetProfileControl({ className }: { className?: string }) {
  const petTypes = useStore((s) => s.petTypes)
  const togglePetType = useStore((s) => s.togglePetType)
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> forces a legend + default box styling; role="group" + aria-label is the right ARIA grouping for a row of aria-pressed toggle chips inside a menu/panel.
    <div
      className={`pet-chip-row${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Household pets"
    >
      {PET_TYPES.map((t) => {
        const on = petTypes.includes(t)
        return (
          <button
            key={t}
            type="button"
            className={`chip${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation()
              togglePetType(t)
            }}
          >
            {PET_TYPE_LABEL[t]}
          </button>
        )
      })}
    </div>
  )
}
