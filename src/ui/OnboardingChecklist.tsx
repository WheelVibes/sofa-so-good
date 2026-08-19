import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../features/useFeature'
import { CHECKLIST_STEPS, type ChecklistStep } from '../state/slices/checklistSlice'
import { useStore } from '../state/store'
import { Button } from './controls/Button'
import { Icon } from './toolbar/icons'

/** Visible label per step — kept to the core design loop, one line each. */
const STEP_LABEL: Record<ChecklistStep, string> = {
  furnish: 'Place a furniture piece',
  finish: 'Change a floor or wall finish',
  light: 'Scrub the time of day',
  walk: 'Walk through your flat',
  share: 'Share or export your design',
}

/**
 * Getting-started checklist (UIUX-28, `onboardChecklist` flag, simple tier —
 * the Watermelon onboarding-checklist pattern with goal-gradient progress):
 * a small dismissible card listing the five core-loop actions, each checked
 * automatically the first time the user performs it. Completion is detected by
 * watching store transitions (no other slice is touched):
 *  - furnish — a def lands in `recentDefIds` (only real user placements do)
 *  - finish  — the `finishes` object changes identity after mount
 *  - light   — `manualHour`/`timeMode` changes after mount
 *  - walk    — camera enters first-person
 *  - share   — the share modal opens
 * Marks persist per-device (checklistSlice); the card hides once dismissed and
 * offers a Done CTA when everything is checked. Shown only over the orbit view
 * (never the walk HUD's or the plan editor's screen space).
 */
export function OnboardingChecklist() {
  const enabled = useFeature('onboardChecklist')
  const dismissed = useStore((s) => s.checklistDismissed)
  const done = useStore(useShallow((s) => s.checklistDone))
  const cameraMode = useStore((s) => s.cameraMode)
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const presenting = useStore((s) => s.presenting)
  const dismiss = useStore((s) => s.dismissChecklist)

  // Watch the store for first-time completions while the feature is live.
  useEffect(() => {
    if (!enabled || dismissed) return
    const mark = (step: ChecklistStep) => useStore.getState().markChecklistStep(step)
    if (useStore.getState().recentDefIds.length > 0) mark('furnish')
    const base = useStore.getState()
    let baseFinishes = base.finishes
    let baseHour = base.manualHour
    let baseTimeMode = base.timeMode
    return useStore.subscribe((s) => {
      if (s.recentDefIds.length > 0) mark('furnish')
      if (s.finishes !== baseFinishes) {
        baseFinishes = s.finishes
        // Identity changes on load/undo too — only user edits happen while an
        // editing surface is up, so gate on one being active.
        if (s.roomEditor?.active || s.floorPlanEditing) mark('finish')
      }
      if (s.manualHour !== baseHour || s.timeMode !== baseTimeMode) {
        baseHour = s.manualHour
        baseTimeMode = s.timeMode
        mark('light')
      }
      if (s.cameraMode === 'firstPerson') mark('walk')
      if (s.shareOpen) mark('share')
    })
  }, [enabled, dismissed])

  if (!enabled || dismissed || cameraMode !== 'orbit' || floorPlanEditing || presenting) return null

  const count = done.length
  const total = CHECKLIST_STEPS.length
  const allDone = count === total

  return (
    <aside className="onb-check" aria-label="Getting started checklist">
      <div className="onb-check-head">
        <b>Get started</b>
        <span className="onb-check-count mono">
          {count}/{total}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Dismiss checklist"
          title="Dismiss — you can keep designing without it"
          onClick={dismiss}
        >
          <Icon.Close width={14} height={14} />
        </button>
      </div>
      <div className="onb-check-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((count / total) * 100)}%` }} />
      </div>
      <ul className="onb-check-list">
        {CHECKLIST_STEPS.map((step) => {
          const isDone = done.includes(step)
          return (
            <li
              key={step}
              className={isDone ? 'on' : ''}
              aria-label={`${STEP_LABEL[step]}${isDone ? ' — done' : ''}`}
            >
              <span className="onb-check-tick" aria-hidden="true">
                {isDone ? <Icon.Check className="done-pop" width={11} height={11} /> : null}
              </span>
              <span className="onb-check-label">{STEP_LABEL[step]}</span>
            </li>
          )
        })}
      </ul>
      {allDone ? (
        <Button variant="accent" size="sm" block onClick={dismiss}>
          Done — happy designing!
        </Button>
      ) : null}
    </aside>
  )
}
