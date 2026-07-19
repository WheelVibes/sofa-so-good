import { useState } from 'react'
import {
  AiPlanError,
  classifyVisionEndpoint,
  getVisionKey,
  getVisionUrl,
  setVisionKey,
} from '../../../ai/floorPlanAi'
import { generateFloorPlan } from '../../../ai/floorPlanGenerate'
import { useStore } from '../../../state/store'
import { applyAiPlanDraft } from './usePlanAiWalls'

/**
 * Shared text→plan GENERATION flow (marquee L): prompt for the brief (unless one
 * is passed), lazily prompt for + persist the BYO LLM key, run the security gate
 * (refuse plaintext / confirm an untrusted host — same as the vision path), call
 * the model, apply the result as a fresh editable draft via `applyAiPlanDraft`,
 * open the floor-plan editor on it, and toast progress/success/error.
 *
 * Reusable by both the editor's "Generate plan with AI…" button
 * (`usePlanAiGenerate`) and the ⌘K command — reads/writes the store directly so
 * it works whether or not the editor is already mounted. NEVER overwrites the
 * user's plan silently: `applyAiPlanDraft` pushes an undoable history step and
 * starts a blank plan, exactly like AI wall drafting.
 */
export async function runAiPlanGeneration(brief?: string): Promise<void> {
  const st = useStore.getState()
  const finalBrief =
    brief ??
    (await st.promptText({
      title: 'Generate plan with AI',
      label: 'Describe the home (rooms, sizes, layout)…',
      placeholder:
        'A 4-room HDB, master with ensuite, open kitchen facing the living room, ~90 sqm',
      submitLabel: 'Generate',
    }))
  if (finalBrief == null || !finalBrief.trim()) return

  // Prompt for + persist the BYO key inline when missing (mirrors AI wall
  // recognition / auto-furnish) rather than dead-ending on a "add a key" error.
  let key = getVisionKey()
  if (!key) {
    key =
      (await st.promptText({
        title: 'Generate plan with AI',
        label: 'LLM API key (OpenAI-compatible, kept in this browser)',
        submitLabel: 'Continue',
      })) || ''
    if (!key) return
    setVisionKey(key)
  }

  // Security gate: refuse a plaintext endpoint outright; require explicit host
  // confirmation before the bearer key travels to an unrecognised server.
  const endpoint = classifyVisionEndpoint(getVisionUrl())
  if (!endpoint.secure) {
    st.notify.start({ title: 'Insecure AI endpoint', message: endpoint.reason, kind: 'error' })
    return
  }
  if (!endpoint.trusted) {
    const ok = await st.promptText({
      title: 'Send your API key to this server?',
      label: `${endpoint.reason} Type the host name (${endpoint.host}) to confirm.`,
      submitLabel: 'Send',
    })
    if ((ok || '').trim().toLowerCase() !== endpoint.host.toLowerCase()) {
      st.notify.start({ title: 'Plan generation cancelled', kind: 'info' })
      return
    }
  }

  const progressId = st.notify.start({
    title: 'Generating floor plan…',
    kind: 'progress',
  })
  try {
    const result = await generateFloorPlan(finalBrief, { key })
    const { walls, openings, rooms } = applyAiPlanDraft(result)
    // Land in the editor on the generated draft (idempotent if already open).
    useStore.getState().setFloorPlanEditing(true)
    const parts = [`${walls} walls`]
    if (rooms) parts.push(`${rooms} rooms`)
    if (openings) parts.push(`${openings} openings`)
    useStore.getState().notify.update(progressId, {
      title: `AI drafted ${parts.join(', ')} — edit as needed`,
    })
    useStore.getState().notify.success(progressId)
  } catch (e) {
    useStore
      .getState()
      .notify.error(progressId, e instanceof AiPlanError ? e.message : 'AI plan generation failed.')
  }
}

/**
 * Editor-facing hook wrapping `runAiPlanGeneration` with a busy flag (disables
 * the button + shows a spinner label while the model works).
 */
export function usePlanAiGenerate(): { genBusy: boolean; runAiGenerate: () => Promise<void> } {
  const [genBusy, setGenBusy] = useState(false)
  const runAiGenerate = async () => {
    if (genBusy) return
    setGenBusy(true)
    try {
      await runAiPlanGeneration()
    } finally {
      setGenBusy(false)
    }
  }
  return { genBusy, runAiGenerate }
}
