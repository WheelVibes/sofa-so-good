import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Raycaster, Vector2 } from 'three'
import { useFeature } from '../features/useFeature'
import { resolveFinishDrop } from '../materials/finishDrop'
import { resolveSampledFinish, type SampleSurface } from '../materials/sampleFinish'
import { useMaterials } from '../materials/useMaterial'
import { applyFinishDropAction } from '../state/finishDropApply'
import { useStore } from '../state/store'
import { findFinishDropTarget } from './finishDropTarget'

/**
 * Eyedropper pick surface (UX-7) — the click side of the finish eyedropper.
 * While `eyedropperArmed`, a capture-phase `click` listener on the canvas
 * raycasts the scene, classifies the hit with the SAME `finishDropTarget.ts`
 * table the drag-to-apply surface uses, and either:
 *   - samples the surface's rendered finish (first click / after a clear), or
 *   - applies the held sample to the clicked surface (paint-bucket), reusing
 *     the shared `resolveFinishDrop` + `applyFinishDropAction` commit path.
 * The listener runs in the CAPTURE phase and `stopPropagation()`s so the click
 * never also reaches R3F's bubble-phase `onClick` (which would select the room
 * / open the picker / dive into a room) — arming the tool takes over the click.
 *
 * Real pointer events are required to hit meshes (R3F raycasts the live DOM
 * event), so headless/synthetic clicks won't drive this — verify store-side
 * (arm, drive the pure `resolveSampledFinish` + `applyFinishDropAction`).
 * Mount once inside each Canvas (main scene + room editor); renders nothing.
 * Cleanup (leaving the editor unmounts the room-editor Canvas) disarms.
 */
export function FinishEyedropperSurface() {
  const enabled = useFeature('finishEyedropper')
  const armed = useStore((s) => s.eyedropperArmed)
  const { gl, camera, scene } = useThree()
  // Latest material map for resolving a sampled finish's display name in the
  // toast — held in a ref so the (mount-once) click handler reads current data.
  const materials = useMaterials()
  const materialsRef = useRef(materials)
  materialsRef.current = materials

  // Cursor / stage cue while armed (token styles keyed off the container class)
  // + Escape disarms (captured before global handlers so it doesn't also
  // deselect / exit the room).
  useEffect(() => {
    if (!enabled || !armed) return
    const el = gl.domElement
    const container = el.closest('.stage-area') ?? el.parentElement
    el.style.cursor = 'crosshair'
    container?.classList.add('finish-eyedropper-active')
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      useStore.getState().disarmEyedropper()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      el.style.cursor = ''
      container?.classList.remove('finish-eyedropper-active')
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [enabled, armed, gl])

  useEffect(() => {
    if (!enabled) return
    const el = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()

    const nameFor = (finishId: string): string => {
      if (finishId.startsWith('#')) return finishId.toUpperCase()
      return materialsRef.current[finishId]?.name ?? finishId
    }

    const onClick = (e: MouseEvent) => {
      const st = useStore.getState()
      if (!st.eyedropperArmed) return
      // Arming takes over the click — never let it also select/enter a room.
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      const target = findFinishDropTarget(hits)

      // ── Apply mode: a sample is held → paint it onto the clicked surface. ──
      if (st.sampledFinish) {
        if (!target) return // empty sky — keep the held sample, no-op
        applyFinishDropAction(resolveFinishDrop(target, { finishId: st.sampledFinish.finishId }))
        return
      }

      // ── Sample mode: read the clicked surface's rendered finish. ──
      if (!target) return
      if (target.kind === 'item') {
        st.notify.start({ title: 'Pick a wall or floor to sample its finish', kind: 'info' })
        return
      }
      const surface: SampleSurface = { kind: target.kind, roomId: target.roomId }
      const sampled = resolveSampledFinish(surface, st.finishes, st.floorPlan)
      if (!sampled) return
      st.setSampledFinish(sampled)
      st.notify.start({
        title: `Sampled ${nameFor(sampled.finishId)} — tap a surface to apply`,
        kind: 'info',
      })
    }

    // Capture phase so this runs before R3F's bubble-phase pointer handlers.
    el.addEventListener('click', onClick, true)
    return () => {
      el.removeEventListener('click', onClick, true)
      // Leaving the editor unmounts this Canvas — disarm so the tool never
      // outlives the scene it was picking in.
      useStore.getState().disarmEyedropper()
    }
  }, [enabled, gl, camera, scene])

  return null
}
