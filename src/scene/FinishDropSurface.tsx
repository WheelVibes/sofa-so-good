import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Raycaster, Vector2 } from 'three'
import { useFeature } from '../features/useFeature'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { resolveFinishDrop } from '../materials/finishDrop'
import {
  applyFinishDropAction,
  isFinishDrag,
  readFinishDragPayload,
} from '../state/finishDropApply'
import { useStore } from '../state/store'
import { setFinishDragActive } from './finishDragSignal'
import { findFinishDropTarget, hasUntaggedHits } from './finishDropTarget'

/**
 * Makes the 3D canvas a drop surface for finish swatches (Q31 part 2). Native
 * HTML5 drag events never reach R3F's pointer raycaster, so this attaches DOM
 * `dragover`/`drop` listeners to the canvas element and, on drop, raycasts the
 * scene manually from the drop coordinates with the live camera. The hit is
 * classified (floor / wall / item — `finishDropTarget.ts`) and committed
 * through the same `resolveFinishDrop` + `applyFinishDropAction` path the
 * Layers-panel rows use. Foreign drags (files, text) and empty-sky drops are
 * ignored, and the listeners only claim events carrying our MIME, so the
 * catalog-card placement drop and any upload drop zones keep working.
 * Mount once inside each Canvas (main scene + room editor); renders nothing.
 *
 * Q31 tail additions:
 *  - Drives `finishDragSignal` so the sibling `FinishDragOverlay` DOM ring
 *    shows while the drag is over the canvas and clears with zero residue.
 *    Signal is set on `dragenter`, cleared on `dragleave`/`drop`/`dragend`.
 *    Listening to `dragend` on the window catches the "dropped outside the
 *    browser" case (the canvas never fires `dragleave` for that).
 *  - Custom-plan overview wall drops: the fade-walls in `PlanShell` carry no
 *    `finishTarget` tag (they're unassociated boxes — roomId is unknown at the
 *    overview level). Dropping there silently no-ops, which is confusing. We
 *    detect "hit geometry but no classifiable target in overview mode" and show
 *    a brief info toast guiding the user to open a room to finish its walls.
 */
export function FinishDropSurface() {
  const enabled = useFeature('finishDnd')
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    if (!enabled) return
    const el = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()

    // --- Drag highlight signal management ---

    const activateHighlight = () => setFinishDragActive(true)

    const deactivateHighlight = () => setFinishDragActive(false)

    const onDragEnter = (e: DragEvent) => {
      if (!isFinishDrag(e.dataTransfer)) return
      activateHighlight()
    }

    const onDragOver = (e: DragEvent) => {
      if (!isFinishDrag(e.dataTransfer)) return
      // Allow the drop + show the "copy" cursor while hovering the scene.
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const onDragLeave = (e: DragEvent) => {
      // Only deactivate when leaving the canvas itself — not when the cursor
      // crosses onto a browser-chrome region inside the canvas (there are none,
      // but guard anyway: relatedTarget null = leaving to outside the document).
      if (e.relatedTarget !== null && el.contains(e.relatedTarget as Node)) return
      deactivateHighlight()
    }

    const onDrop = (e: DragEvent) => {
      // Always clear the highlight on drop, regardless of payload.
      deactivateHighlight()

      if (!isFinishDrag(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      const payload = readFinishDragPayload(e.dataTransfer)
      if (!payload) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      const target = findFinishDropTarget(hits)

      if (applyFinishDropAction(resolveFinishDrop(target, payload))) return

      // Nothing was applied. Check whether the user dropped on an overview-plan
      // wall — untagged geometry that exists in PlanShell but has no roomId for
      // finish routing. Distinguish from a sky/backdrop miss (empty hits): if
      // the raycast found *something* but it wasn't finishable, show a cue.
      const st = useStore.getState()
      const isCustomPlanOverview = !isDefaultPlan(st.floorPlan) && !st.roomEditor.active
      if (isCustomPlanOverview && hasUntaggedHits(hits)) {
        st.notify.start({
          title: 'Open a room to finish its walls',
          kind: 'info',
          autoDismissMs: 3000,
        })
      }
    }

    // Fallback: when the user drags a finish swatch out of the browser window
    // (drag is dropped on the desktop / cancelled by OS), the canvas never fires
    // `dragleave` — only `dragend` fires on the drag source, and it fires on the
    // window. Clear the highlight here so it never gets stuck.
    const onWindowDragEnd = () => deactivateHighlight()
    const onWindowDrop = () => deactivateHighlight()

    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onWindowDragEnd)
    window.addEventListener('drop', onWindowDrop)

    return () => {
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onWindowDragEnd)
      window.removeEventListener('drop', onWindowDrop)
      // Clear highlight when unmounting (e.g. feature flag toggled off mid-drag).
      deactivateHighlight()
    }
  }, [enabled, gl, camera, scene])

  return null
}
