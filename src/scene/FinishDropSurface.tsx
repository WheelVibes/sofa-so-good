import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Raycaster, Vector2 } from 'three'
import { useFeature } from '../features/useFeature'
import { resolveFinishDrop } from '../materials/finishDrop'
import {
  applyFinishDropAction,
  isFinishDrag,
  readFinishDragPayload,
} from '../state/finishDropApply'
import { findFinishDropTarget } from './finishDropTarget'

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
 */
export function FinishDropSurface() {
  const enabled = useFeature('finishDnd')
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    if (!enabled) return
    const el = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()

    const onDragOver = (e: DragEvent) => {
      if (!isFinishDrag(e.dataTransfer)) return
      // Allow the drop + show the "copy" cursor while hovering the scene.
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const onDrop = (e: DragEvent) => {
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
      const target = findFinishDropTarget(raycaster.intersectObjects(scene.children, true))
      applyFinishDropAction(resolveFinishDrop(target, payload))
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [enabled, gl, camera, scene])

  return null
}
