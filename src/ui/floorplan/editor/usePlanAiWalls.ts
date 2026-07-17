import { type Dispatch, type SetStateAction, useState } from 'react'
import {
  AiPlanError,
  type AiPlanResult,
  classifyVisionEndpoint,
  getVisionKey,
  getVisionUrl,
  recognizeFloorPlan,
  setVisionKey,
} from '../../../ai/floorPlanAi'
import { placeAiOpenings, shouldApplyAiScale } from '../../../ai/floorPlanAiPlacement'
import { useStore } from '../../../state/store'
import type { Backdrop } from './planConstants'

/**
 * Apply a recognized plan (walls + openings) as a fresh draft in the store:
 * start a blank plan, add every wall, then snap each recognized opening onto its
 * nearest drafted wall and add it as a proper `PlanOpening`. Returns how many of
 * each landed. Defensive — an opening whose host wall couldn't be placed is
 * silently skipped, so a walls-only result behaves exactly as before. Backdrop
 * scale calibration is the caller's job (it owns the backdrop React state).
 *
 * Exported so the dev-only `__applyAiVisionResponse` harness hook can drive the
 * exact same apply path from a canned response — no network call.
 */
export function applyAiPlanDraft(result: AiPlanResult): {
  walls: number
  openings: number
  rooms: number
} {
  const st = useStore.getState()
  let openings = 0
  let rooms = 0
  // One undoable step for the whole draft: snapshot the pre-AI design ONCE, then
  // build inside `runWithoutHistory` so the composed newFloorPlan + N addWall/
  // addOpening/addRoom calls (each of which normally pushes its own history
  // entry) don't spam the undo stack — and, on a large recognized plan, can't
  // push the pre-AI snapshot off the capped stack, making the original design
  // unrecoverable (BUG: AI-draft history spam).
  st.pushHistory()
  st.runWithoutHistory(() => {
    st.newFloorPlan('AI draft')
    const wallIds: string[] = []
    for (const w of result.walls) {
      wallIds.push(
        st.addWall({
          start: [w.x1, w.z1],
          end: [w.x2, w.z2],
          thickness: w.external ? 'external' : 'internal',
        }),
      )
    }
    for (const p of placeAiOpenings(result.walls, result.openings)) {
      const wallId = wallIds[p.wallIndex]
      if (!wallId) continue
      st.addOpening({
        kind: p.kind,
        wallId,
        offset: p.offset,
        width: p.width,
        sill: p.sill,
        head: p.head,
      })
      openings++
    }
    // Named rooms ride along only for text→plan generation (vision leaves
    // `rooms` absent, so this is a no-op there). Each becomes an axis-aligned
    // `PlanRoom` rectangle the user can reshape; boundary walls/openings are
    // auto-named by `addRoom`.
    for (const r of result.rooms ?? []) {
      st.addRoom({ name: r.name, origin: [r.x, r.z], width: r.width, depth: r.depth })
      rooms++
    }
  })
  return { walls: result.walls.length, openings, rooms }
}

/**
 * Experimental AI plan recognition (Wave E) extracted from `FloorPlanEditor`:
 * send the trace `backdrop` to an OpenAI-compatible vision model and seed an
 * editable draft plan from the returned walls — plus any doors/windows it spots
 * and a scale estimate that calibrates the backdrop (falls back to walls-only,
 * then to manual tracing, on any failure). Owns the `aiBusy` flag; everything
 * else it needs it reads fresh from the store. The only editor inputs are the
 * current `backdrop` and its `setBackdrop` (to write the calibrated scale).
 */
export function usePlanAiWalls(
  backdrop: Backdrop | null,
  setBackdrop: Dispatch<SetStateAction<Backdrop | null>>,
): {
  aiBusy: boolean
  runAiWalls: () => Promise<void>
} {
  const [aiBusy, setAiBusy] = useState(false)

  const runAiWalls = async () => {
    if (!backdrop || aiBusy) return
    let key = getVisionKey()
    if (!key) {
      key =
        (await useStore.getState().promptText({
          title: 'AI floor-plan recognition',
          label: 'Vision-model API key (OpenAI-compatible, kept in this browser)',
          submitLabel: 'Continue',
        })) || ''
      if (!key) return
      setVisionKey(key)
    }
    // Security gate: warn (and require explicit confirmation) before the bearer
    // key is sent to anything other than a recognised provider. A plaintext
    // endpoint is refused outright downstream in recognizeFloorPlan.
    const endpoint = classifyVisionEndpoint(getVisionUrl())
    if (!endpoint.secure) {
      useStore
        .getState()
        .notify.start({ title: 'Insecure AI endpoint', message: endpoint.reason, kind: 'error' })
      return
    }
    if (!endpoint.trusted) {
      const ok = await useStore.getState().promptText({
        title: 'Send your API key to this server?',
        label: `${endpoint.reason} Type the host name (${endpoint.host}) to confirm.`,
        submitLabel: 'Send',
      })
      if ((ok || '').trim().toLowerCase() !== endpoint.host.toLowerCase()) {
        useStore.getState().notify.start({ title: 'AI recognition cancelled', kind: 'info' })
        return
      }
    }
    setAiBusy(true)
    try {
      // The backdrop is an object URL; the remote model needs inline data.
      const img = new Image()
      img.src = backdrop.url
      await img.decode().catch(() => {})
      const c = document.createElement('canvas')
      c.width = backdrop.w
      c.height = backdrop.h
      c.getContext('2d')?.drawImage(img, 0, 0)
      const result = await recognizeFloorPlan(c.toDataURL('image/png'), { key })
      const { walls, openings } = applyAiPlanDraft(result)
      // Calibrate the trace backdrop from the AI's scale estimate, but never
      // clobber a manual calibration (the Scale tool sets `scaleCalibrated`).
      const calibrated =
        shouldApplyAiScale(result.mPerPx, Boolean(backdrop?.scaleCalibrated)) && backdrop != null
      if (calibrated) {
        const mPerPx = result.mPerPx as number
        setBackdrop((b) => (b ? { ...b, mPerPx } : b))
      }
      const parts = [`${walls} walls`]
      if (openings) parts.push(`${openings} openings`)
      if (calibrated) parts.push('scale')
      useStore.getState().notify.start({
        title: `AI drafted ${parts.join(', ')} — adjust as needed`,
        kind: 'success',
      })
    } catch (e) {
      useStore.getState().notify.start({
        title: e instanceof AiPlanError ? e.message : 'AI floor-plan recognition failed.',
        kind: 'error',
      })
    } finally {
      setAiBusy(false)
    }
  }

  return { aiBusy, runAiWalls }
}
