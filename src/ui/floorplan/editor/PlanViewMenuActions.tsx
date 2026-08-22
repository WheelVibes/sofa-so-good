import type { PlanLabelMode } from '../planLabels'
import { PLAN_LABEL_TEXT } from '../planLabels'

/**
 * Contents of the "View ▾" menu (desktop) / the mobile Tools sheet's View
 * section: display toggles (furniture labels, room labels, wall dims,
 * furniture footprints, skeleton view, other-storeys underlay) + PNG export.
 * Extracted from `FloorPlanEditor` (REFAC-2); purely presentational — each
 * toggle's boolean state + its flip callback are passed in, so the caller
 * keeps owning the `useState`s and the feature-flag gating.
 */
export function PlanViewMenuActions({
  fPlanLabels,
  labelsOn,
  planLabels,
  onCycleLabels,
  showRoomLabels,
  onToggleRoomLabels,
  showWallDims,
  onToggleWallDims,
  showFurniture,
  onToggleFurniture,
  fMep,
  showMep,
  onToggleMep,
  fHackability,
  showHackability,
  onToggleHackability,
  skeleton,
  onToggleSkeleton,
  isMultiLevel,
  showOtherLevels,
  onToggleOtherLevels,
  onExportPng,
}: {
  fPlanLabels: boolean
  labelsOn: boolean
  planLabels: PlanLabelMode
  onCycleLabels: () => void
  showRoomLabels: boolean
  onToggleRoomLabels: () => void
  showWallDims: boolean
  onToggleWallDims: () => void
  showFurniture: boolean
  onToggleFurniture: () => void
  fMep: boolean
  showMep: boolean
  onToggleMep: () => void
  fHackability: boolean
  showHackability: boolean
  onToggleHackability: () => void
  skeleton: boolean
  onToggleSkeleton: () => void
  isMultiLevel: boolean
  showOtherLevels: boolean
  onToggleOtherLevels: () => void
  onExportPng: () => void
}) {
  return (
    <>
      {fPlanLabels && (
        <button
          type="button"
          onClick={onCycleLabels}
          className={`btn btn-sm${labelsOn ? ' on' : ''}`}
          title="Cycle furniture labels on the plan: off → name → name + price"
          aria-pressed={labelsOn}
        >
          {PLAN_LABEL_TEXT[planLabels]}
        </button>
      )}
      <button
        type="button"
        onClick={onToggleRoomLabels}
        className={`btn btn-sm${showRoomLabels ? ' on' : ''}`}
        title="Toggle room name + dimension labels"
        aria-pressed={showRoomLabels}
      >
        Labels
      </button>
      <button
        type="button"
        onClick={onToggleWallDims}
        className={`btn btn-sm${showWallDims ? ' on' : ''}`}
        title="Toggle wall-length labels"
        aria-pressed={showWallDims}
      >
        Dims
      </button>
      <button
        type="button"
        onClick={onToggleFurniture}
        className={`btn btn-sm${showFurniture ? ' on' : ''}`}
        title="Show furniture footprints (hidden by default so they don't get in the way of editing; hidden furniture can't be selected or moved)"
        aria-pressed={showFurniture}
      >
        Furniture
      </button>
      {fMep && (
        <button
          type="button"
          onClick={onToggleMep}
          className={`btn btn-sm${showMep ? ' on' : ''}`}
          title="Toggle the electrical/plumbing points layer"
          aria-pressed={showMep}
        >
          MEP
        </button>
      )}
      {fHackability && (
        <button
          type="button"
          onClick={onToggleHackability}
          className={`btn btn-sm${showHackability ? ' on' : ''}`}
          title="Toggle the wall hackability overlay — tints walls by demolition-permit status (red = not permitted, amber = permit required, muted = unclassified)"
          aria-pressed={showHackability}
        >
          Hackability
        </button>
      )}
      <button
        type="button"
        onClick={onToggleSkeleton}
        className={`btn btn-sm${skeleton ? ' on' : ''}`}
        title="Skeleton view — draw all walls uniformly thin to check whether they meet to enclose rooms"
        aria-pressed={skeleton}
      >
        Skeleton
      </button>
      {isMultiLevel && (
        <button
          type="button"
          onClick={onToggleOtherLevels}
          className={`btn btn-sm${showOtherLevels ? ' on' : ''}`}
          title="Show the other storeys' walls as a dimmed underlay (to line up floors)"
          aria-pressed={showOtherLevels}
        >
          All levels
        </button>
      )}
      <button
        type="button"
        className="btn btn-sm"
        title="Download the floor plan as a PNG image"
        onClick={onExportPng}
      >
        Export PNG
      </button>
    </>
  )
}
