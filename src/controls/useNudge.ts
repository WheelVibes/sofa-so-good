/**
 * Press-and-hold arrow-key nudge, extracted from `App.tsx` (R3-REFAC-1):
 * arrow keys move the selected item continuously along world-XZ at
 * NUDGE_SPEED m/s (Shift = fine). preventDefault on keydown stops the page
 * from scrolling. Collision-rejected frames simply skip the move so the
 * outline never flashes red.
 *
 * Raw `window` keydown/keyup/blur listeners (NOT `useKeyboard`) because the
 * hold loop needs the matching keyup — and must survive `e.repeat` — so it
 * applies the modal-dialog + editable-target guards itself.
 */
import { useEffect, useRef } from 'react'
import { canPlace } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { useCatalog } from '../furniture/catalog'
import { cameraForwardXZ } from '../scene/cameras/cameraForward'
import { canEditScene } from '../state/editing'
import { useStore } from '../state/store'
import { KEYBINDINGS, NUDGE_FINE_SPEED, NUDGE_SPEED } from './keybindings'
import { isAnyModalOpen } from './modalGuard'
import { isEditableTarget } from './useKeyboard'

/** Mount the press-and-hold arrow-key nudge (call once, from App). */
export function useNudge(): void {
  // The catalog is read through a ref so the listeners register once ([]
  // deps) yet always see the current defs mid-hold.
  const catalog = useCatalog()
  const catalogRef = useRef(catalog)
  catalogRef.current = catalog
  useEffect(() => {
    const dirs: Record<string, [number, number]> = {
      [KEYBINDINGS.nudgeUp]: [0, -1],
      [KEYBINDINGS.nudgeDown]: [0, 1],
      [KEYBINDINGS.nudgeLeft]: [-1, 0],
      [KEYBINDINGS.nudgeRight]: [1, 0],
    }
    const held = new Set<string>()
    let shiftHeld = false
    let rafId = 0
    let lastTime = 0

    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
      lastTime = 0
    }

    const tick = (t: number) => {
      const dt = lastTime ? Math.min((t - lastTime) / 1000, 0.05) : 0
      lastTime = t
      rafId = requestAnimationFrame(tick)
      if (held.size === 0) return
      const state = useStore.getState()
      if (!canEditScene(state) || state.selectedItemIds.length === 0) return
      const movingIds = state.selectedItemIds
      const movingItems = state.items.filter((i) => movingIds.includes(i.id) && !i.locked)
      if (movingItems.length === 0) return
      let dx = 0
      let dz = 0
      for (const code of held) {
        const d = dirs[code]
        if (d) {
          dx += d[0]
          dz += d[1]
        }
      }
      if (dx === 0 && dz === 0) return
      // Snap camera-forward to the nearest world-XZ cardinal so movement
      // stays on apartment axes (never diagonal) even when the orbit yaw
      // sits between cardinals. Screen-right is forward rotated +90° on Y
      // in three.js's right-handed/-Z-look convention: R=(-fz,fx).
      const fxRaw = cameraForwardXZ.x
      const fzRaw = cameraForwardXZ.z
      const dominantX = Math.abs(fxRaw) >= Math.abs(fzRaw)
      const fx = dominantX ? Math.sign(fxRaw) || 1 : 0
      const fz = dominantX ? 0 : Math.sign(fzRaw) || 1
      const worldDx = -fz * dx + fx * -dz
      const worldDz = fx * dx + fz * -dz
      const speed = shiftHeld ? NUDGE_FINE_SPEED : NUDGE_SPEED
      const stepX = worldDx * speed * dt
      const stepZ = worldDz * speed * dt
      // Validate the whole group's next pose first; reject if any member
      // would collide. Group members are excluded from each other's
      // collision check since their relative positions don't change.
      const inGroup = new Set(movingIds)
      const others = state.items.filter((it) => !inGroup.has(it.id))
      const candidates = movingItems.map((item) => {
        const def = catalogRef.current[item.defId]
        const next: [number, number] = [item.position[0] + stepX, item.position[1] + stepZ]
        return { item, def, next }
      })
      let ok = true
      for (const c of candidates) {
        if (!c.def) {
          ok = false
          break
        }
        if (
          !canPlace({ ...c.item, position: c.next }, c.def, {
            others,
            defs: catalogRef.current,
            doors: state.doors,
            walls: placementWalls(state),
          })
        ) {
          ok = false
          break
        }
      }
      if (!ok) return
      for (const c of candidates) state.moveItem(c.item.id, c.next)
      // Keep the 'nudge' coalesce window alive while actively moving so a long
      // press-and-hold followed by a quick re-tap stays in the SAME undo step
      // (moveItem itself never touches the coalesce clock). A genuine pause (no
      // movement for > the window) lets the next keydown open a fresh step.
      state.refreshCoalesce('nudge')
    }

    const onDown = (e: KeyboardEvent) => {
      if (isAnyModalOpen()) return
      if (isEditableTarget(e)) return
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = true
        return
      }
      if (!Object.hasOwn(dirs, e.code)) return
      if (!canEditScene(useStore.getState())) return
      e.preventDefault()
      // First key in a nudge session: snapshot the pre-nudge transform so the
      // whole press-and-hold collapses into a single undo step. Coalesced under a
      // stable 'nudge' key so a *burst* of separate taps (each its own
      // keydown→keyup) within the coalesce window also collapses into one undo
      // step, while a deliberate pause (window elapsed) starts a fresh step. Any
      // other action in between pushes a different key (or resets it), breaking
      // the chain — so a nudge never merges with an array/rotate/drag/etc. Guard
      // on the multi-selection (`selectedItemIds`), not just the single primary
      // id, so a marquee/group nudge is undoable too.
      const st = useStore.getState()
      if (held.size === 0 && st.selectedItemIds.length > 0) {
        st.pushHistoryCoalesced('nudge')
      }
      held.add(e.code)
      if (!rafId) rafId = requestAnimationFrame(tick)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = false
        return
      }
      held.delete(e.code)
      if (held.size === 0) stop()
    }
    const onBlur = () => {
      held.clear()
      shiftHeld = false
      stop()
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      stop()
    }
  }, [])
}
