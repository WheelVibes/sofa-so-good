import { useState } from 'react'
import {
  AiPlanError,
  classifyVisionEndpoint,
  getVisionKey,
  getVisionUrl,
  recognizeFloorPlan,
  setVisionKey,
} from '../../../ai/floorPlanAi'
import { useStore } from '../../../state/store'
import type { Backdrop } from './planConstants'

/**
 * Experimental AI wall recognition (Wave E) extracted from `FloorPlanEditor`:
 * send the trace `backdrop` to an OpenAI-compatible vision model and seed an
 * editable draft plan from the returned walls (falls back to manual tracing on
 * any failure). Owns the `aiBusy` flag; everything else it needs it reads fresh
 * from the store. Self-contained — the only editor input is the current
 * `backdrop`.
 */
export function usePlanAiWalls(backdrop: Backdrop | null): {
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
      const walls = await recognizeFloorPlan(c.toDataURL('image/png'), { key })
      const st = useStore.getState()
      st.pushHistory()
      st.newFloorPlan('AI draft')
      for (const w of walls) {
        st.addWall({
          start: [w.x1, w.z1],
          end: [w.x2, w.z2],
          thickness: w.external ? 'external' : 'internal',
        })
      }
      st.notify.start({
        title: `AI drafted ${walls.length} walls — adjust as needed`,
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
