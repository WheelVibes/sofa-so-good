/**
 * Post-paint boot bootstrap.
 *
 * Historically all of this was awaited in `main.tsx` *before* the first React
 * render, leaving the page blank until IndexedDB + localStorage resolved.
 * Now React paints immediately (showing the loading overlay) and this runs
 * once from `<BootHydrator>`, flipping `bootPhase` to `'ready'` when done.
 *
 * The decoder registration stays in `main.tsx` (synchronous, must precede any
 * GLB load). This function owns the async, IO-bound work + the first-layout
 * seed (so defaults never clobber a layout the autosave is about to restore).
 */

import {
  applySharedDesign,
  DesignShareError,
  decodeDesignShareCode,
  parseDesignRoute,
} from '../../features/designShare'
import { decodeCodeToDesign, PlanShareError, parsePlanRoute } from '../../features/planShare'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { applySerialized } from '../schema'
import { useStore } from '../store'
import { loadAppearancePrefs, watchAppearancePrefs } from './appearancePrefs'
import { startAutosave } from './autosave'
import { loadBudgetPrefs, watchBudgetPrefs } from './budgetPrefs'
import { loadEditorPrefs, watchEditorPrefs } from './editorPrefs'
import { loadFloorPlans, watchFloorPlans } from './floorPlanStore'
import { hydrate } from './hydrate'
import { loadQualityPrefs, watchQualityPrefs } from './qualityPrefs'
import { hydrateWalkBackdrop } from './walkBackdrop'

let started = false

const yieldFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()))

/** Run one boot step, swallowing + logging any failure so it can't abort the
 *  rest of the bootstrap. Supports sync or async steps. Yields one animation
 *  frame after each step so the static boot loader can keep compositing. */
async function runStep(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    console.error(`[bootstrap] step "${name}" failed (continuing):`, e)
  }
  await yieldFrame()
}

/** Run the boot bootstrap exactly once. Safe to call from React StrictMode
 *  double-invocation; the guard makes subsequent calls a no-op. */
export async function runBootstrap(): Promise<void> {
  if (started) return
  started = true
  try {
    // Pull user assets + autosaved layout. Failures are silent; the app falls
    // back to the default layout via the seed below. Each step is independently
    // guarded so a single failing loader (e.g. corrupt IDB, a throwing pref
    // parser) can't abort the rest of boot — most importantly, `startAutosave`
    // below must always run so the user's work is still persisted.
    await runStep('hydrate', async () => {
      await hydrate()
    })
    runStep('appearancePrefs', () => {
      loadAppearancePrefs()
      watchAppearancePrefs()
    })
    runStep('qualityPrefs', () => {
      loadQualityPrefs()
      watchQualityPrefs()
    })
    runStep('editorPrefs', () => {
      loadEditorPrefs()
      watchEditorPrefs()
    })
    await runStep('walkBackdrop', hydrateWalkBackdrop)
    runStep('budgetPrefs', () => {
      loadBudgetPrefs()
      watchBudgetPrefs()
    })
    runStep('floorPlans', () => {
      loadFloorPlans()
      watchFloorPlans()
    })
    // Recompute feature flags now that the persisted auth session is loaded, so
    // a returning admin's dev-only features are unlocked on boot.
    runStep('featureFlags', () => useStore.getState().reresolveFeatureFlags())

    // Seed the default layout only when hydration produced nothing — must run
    // AFTER hydrate() so an autosaved layout is never clobbered. Then drop the
    // seed/hydrate snapshot so the first undo doesn't pop back to a blank flat.
    runStep('seed', () => {
      const s = useStore.getState()
      if (s.items.length === 0) s.resetToDefault()
      useStore.getState().clearHistory()
    })

    // Cloud reconciliation (backend builds only): revalidate the session, merge
    // cloud favourites, and reconcile the autosave slot latest-wins. Runs after
    // the local seed so a returning user's cloud design can supersede it, and
    // BEFORE share links so an explicit shared link still wins below.
    await runStep('cloudBoot', async () => {
      const { cloudBoot } = await import('./cloudBoot')
      await cloudBoot()
    })

    // A `#/plans/<code>` or `#/design/<code>` share link overrides the seeded/
    // restored design with the shared one (runs after the seed so it wins).
    // No-op without a link; the routes are disjoint so at most one fires.
    await runStep('planShareLink', loadSharedPlanFromUrl)
    await runStep('designShareLink', loadSharedDesignFromUrl)

    // Surface autosave failures (the common one is localStorage quota) so the
    // user knows their work isn't being persisted, instead of silently losing
    // it. Dedup to a single notification that auto-clears when saving resumes.
    let saveErrorId: string | null = null
    startAutosave({
      onError: (e) => {
        if (saveErrorId) return
        const message =
          e.kind === 'quota'
            ? "Your browser's storage is full, so changes can't be auto-saved. Free up space, or save to a slot and export your design."
            : `Auto-save failed (${e.kind}). Your latest changes may not be persisted.`
        saveErrorId = useStore.getState().notify.start({
          title: "Couldn't auto-save",
          kind: 'error',
          message,
          autoDismissMs: null,
        })
      },
      onRecover: () => {
        if (saveErrorId) {
          useStore.getState().notify.dismiss(saveErrorId)
          saveErrorId = null
        }
      },
    })

    if (import.meta.env.DEV) await runStep('devHelpers', exposeDevHelpers)
  } finally {
    useStore.getState().setBootReady()
  }
}

/**
 * If the URL hash is a `#/plans/<code>` share link, decode + load that design
 * (overriding the seeded/restored one), then clear the hash so a reload doesn't
 * re-apply the now-edited plan and the URL stays clean. Exported for testing.
 */
export async function loadSharedPlanFromUrl(): Promise<void> {
  const code = parsePlanRoute(globalThis.location?.hash)
  if (!code) return
  const s = useStore.getState()
  try {
    const design = decodeCodeToDesign(code)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...s.userFurniture.map((d) => d.id)])
    useStore.setState(applySerialized(design, known))
    useStore.getState().clearHistory?.()
    useStore.getState().requestHomeView?.()
    useStore.getState().notify.start({ title: 'Loaded a shared plan', kind: 'success' })
  } catch (e) {
    useStore.getState().notify.start({
      title: "Couldn't open that shared plan",
      kind: 'error',
      message: e instanceof PlanShareError ? e.message : undefined,
    })
  } finally {
    try {
      const url = new URL(globalThis.location.href)
      url.hash = ''
      globalThis.history?.replaceState(null, '', url.toString())
    } catch {
      /* no history/URL (non-browser) */
    }
  }
}

/**
 * If the URL hash is a `#/design/<code>` 3D-link, decode + load that design
 * (overriding the seeded/restored one) and toast that it's now the viewer's
 * editable copy. Items referencing defs that can't travel in a URL (the
 * sender's uploads/imports) are dropped with a count. Exported for testing.
 */
export async function loadSharedDesignFromUrl(): Promise<void> {
  const code = parseDesignRoute(globalThis.location?.hash)
  if (!code) return
  const s = useStore.getState()
  try {
    const design = decodeDesignShareCode(code)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...s.userFurniture.map((d) => d.id)])
    const { patch, droppedCount } = applySharedDesign(design, known)
    useStore.setState(patch)
    useStore.getState().clearHistory?.()
    useStore.getState().requestHomeView?.()
    useStore.getState().notify.start({
      title: "Shared design loaded — it's yours to edit",
      kind: 'success',
      message: droppedCount
        ? `${droppedCount} item${droppedCount === 1 ? '' : 's'} skipped — uploaded models can't travel in a link.`
        : undefined,
    })
  } catch (e) {
    useStore.getState().notify.start({
      title: "Couldn't open that design link",
      kind: 'error',
      message: e instanceof DesignShareError ? e.message : undefined,
    })
  } finally {
    try {
      const url = new URL(globalThis.location.href)
      url.hash = ''
      globalThis.history?.replaceState(null, '', url.toString())
    } catch {
      /* no history/URL (non-browser) */
    }
  }
}

/** Dev-only: expose the store + auto-arranger for the screenshot harness. */
async function exposeDevHelpers(): Promise<void> {
  ;(window as unknown as { __store?: typeof useStore }).__store = useStore
  const { arrangeRoom, arrangeAllRooms, arrangeAllRoomsForPlan } = await import(
    '../../layout/autoArrange'
  )
  const { isDefaultPlan } = await import('../../floorplan/planGeometry')
  const { BUILTIN_CATALOG } = await import('../../furniture/builtinCatalog')
  ;(window as unknown as { __arrangeRoom?: unknown }).__arrangeRoom = (roomId: string) => {
    const s = useStore.getState()
    s.setItems(arrangeRoom(roomId as never, s.items, BUILTIN_CATALOG as never, s.doors))
  }
  ;(window as unknown as { __tidyHome?: unknown }).__tidyHome = () => {
    const s = useStore.getState()
    const next = isDefaultPlan(s.floorPlan)
      ? arrangeAllRooms(s.items, BUILTIN_CATALOG as never, s.doors)
      : arrangeAllRoomsForPlan(s.floorPlan, s.items, BUILTIN_CATALOG as never, s.doors)
    s.setItems(next)
  }
  const { PLAN_TEMPLATES } = await import('../../floorplan/templates')
  ;(window as unknown as { __loadTemplate?: unknown }).__loadTemplate = (id: string) => {
    const tpl = PLAN_TEMPLATES.find((t) => t.id === id)
    if (tpl) useStore.getState().setFloorPlan(JSON.parse(JSON.stringify(tpl)))
  }
  // Expose material upload helper for the screenshot / scenario harness.
  const { persistUserMaterial } = await import('../../materials/upload/persist')
  ;(window as unknown as { __persistUserMaterial?: unknown }).__persistUserMaterial =
    persistUserMaterial
  // Expose the standalone texture decode path (KTX2/DDS + the TGA/TIFF/EXR/HDR
  // exotic formats) so the GPU scenario harness can verify a real WebGL readback
  // headlessly (SHOT_GPU=1). `bytesB64` is the base64-encoded raw file; `name`
  // supplies the extension the decoder routes on. Returns (and records on
  // `__decodeMaterialImageResult`) a small summary — never the whole pixel buffer.
  const { decodeImage } = await import('../../materials/convert/decodeImage')
  ;(window as unknown as { __decodeMaterialImage?: unknown }).__decodeMaterialImage = async (
    bytesB64: string,
    name: string,
  ) => {
    const bin = atob(bytesB64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], name, { type: 'application/octet-stream' })
    try {
      const img = await decodeImage(file)
      const result = {
        ok: true as const,
        width: img.width,
        height: img.height,
        length: img.data.length,
        firstPixel: [img.data[0], img.data[1], img.data[2], img.data[3]],
      }
      ;(
        window as unknown as { __decodeMaterialImageResult?: unknown }
      ).__decodeMaterialImageResult = result
      return result
    } catch (e) {
      const result = { ok: false as const, error: e instanceof Error ? e.message : String(e) }
      ;(
        window as unknown as { __decodeMaterialImageResult?: unknown }
      ).__decodeMaterialImageResult = result
      return result
    }
  }
  // Expose the Sweet Home 3D import path so the scenario harness can drive a full
  // `.sh3d` parse → place (PARITY-SH3D); `bytes` are the raw archive (the harness
  // base64-decodes a synthetic fixture into a Uint8Array).
  const { parseSh3d } = await import('../../floorplan/import/sh3d')
  const { applySh3dResult } = await import('../../ui/openSh3dImport')
  ;(window as unknown as { __importSh3dBytes?: unknown }).__importSh3dBytes = (
    bytes: Uint8Array,
    name = 'Imported plan',
  ) => applySh3dResult(parseSh3d(bytes, name), name)
  // Expose the Sweet Home 3D furniture-LIBRARY import (PARITY-SH3F) so the
  // scenario harness can verify a full `.sh3f` parse → OBJ/DAE/3DS→GLB convert →
  // persist headlessly (needs a REAL browser for the three loaders + GLTFExporter,
  // so a unit test can't cover the convert leg — this is the end-to-end seam).
  // `bytes` are the raw archive (base64-decoded to a Uint8Array); resolves to the
  // import summary (imported / duplicate / skipped counts).
  const { parseSh3f } = await import('../../furniture/import/sh3f')
  const { applySh3fResult } = await import('../../ui/openSh3fImport')
  ;(window as unknown as { __importSh3fBytes?: unknown }).__importSh3fBytes = async (
    bytes: Uint8Array,
    name = 'Imported library',
  ) => {
    const result = await applySh3fResult(parseSh3f(bytes, name), name)
    ;(window as unknown as { __importSh3fResult?: unknown }).__importSh3fResult = result
    return result
  }
  // Expose the model-group detection path so the scenario harness can drive a
  // full detect over a synthetic folder headlessly (the upload dialog itself is
  // React.lazy and won't mount headless — see visual-verification-playbook.md).
  // Given a list of `{ path, meta }` (meta = a metadata.json object, or a raw
  // JSON string), it builds File objects with the right `webkitRelativePath`,
  // runs detectGroups + looseModelFiles, and records the outcome on window.
  const { detectGroups, looseModelFiles } = await import('../../furniture/ikea/detectGroups')
  ;(window as unknown as { __detectGroups?: unknown }).__detectGroups = async (
    entries: Array<{ path: string; meta?: unknown; body?: string }>,
  ) => {
    const files = entries.map((e) => {
      const body = e.body ?? JSON.stringify(e.meta ?? {})
      const f = new File([body], e.path.split('/').pop() ?? e.path, { type: 'application/json' })
      Object.defineProperty(f, 'webkitRelativePath', { value: e.path })
      return f
    })
    let lastParsed = 0
    let total = 0
    let groupUpdates = 0
    const groups = await detectGroups(
      files,
      (parsed, t) => {
        lastParsed = parsed
        total = t
      },
      () => {
        groupUpdates++
      },
    )
    const result = {
      groupCount: groups.length,
      looseCount: looseModelFiles(files, groups).length,
      parsed: lastParsed,
      total,
      groupUpdates,
    }
    ;(window as unknown as { __detectGroupsResult?: unknown }).__detectGroupsResult = result
    return result
  }
  // Expose the AI plan-recognition APPLY path so the scenario harness can drive
  // walls + doors/windows placement from a CANNED vision response — no network
  // call (AI-PLAN-OPENINGS). Given the raw model reply text (or an already-shaped
  // JSON string), it parses via the same defensive parser and applies the draft
  // (blank plan → walls → snapped openings) to the store, returning the counts.
  // Scale calibration is NOT applied here (it writes the editor's backdrop React
  // state, unreachable from a window hook) — unit-tested separately.
  const { parseVisionResponse, parseGeneratedPlan } = await import('../../ai/floorPlanAi')
  const { applyAiPlanDraft } = await import('../../ui/floorplan/editor/usePlanAiWalls')
  ;(window as unknown as { __applyAiVisionResponse?: unknown }).__applyAiVisionResponse = (
    text: string,
  ) => applyAiPlanDraft(parseVisionResponse(text))
  // Sibling hook for text→plan GENERATION (AI-PLAN-GENERATE): parse a CANNED LLM
  // reply (walls + openings + named rooms) and apply it as a fresh draft — same
  // apply path as generation, no network call. Returns the landed counts.
  ;(window as unknown as { __applyAiGeneratedPlan?: unknown }).__applyAiGeneratedPlan = (
    text: string,
  ) => applyAiPlanDraft(parseGeneratedPlan(text))
  // Expose the bulk GLB import path (convert → optimize-pool → LOD → persist)
  // so the scenario harness can drive a REAL import with REAL `Worker`
  // construction — unlike the Node/happy-dom unit tests, a real browser can
  // actually spin up the optimize worker POOL (`runOptimize.ts`), so this is
  // the only way to exercise it end-to-end outside a live upload. `filesB64`
  // are base64-encoded GLB bytes with a display name; `opts` is passed through
  // to `importGlbFiles` (category, concurrency, ktx2, lodTiers, …).
  const { importGlbFiles } = await import('../../furniture/upload/bulkImport')
  ;(window as unknown as { __importGlbFiles?: unknown }).__importGlbFiles = async (
    filesB64: Array<{ name: string; b64: string }>,
    opts: Parameters<typeof importGlbFiles>[1],
  ) => {
    const files = filesB64.map((f) => {
      const bin = atob(f.b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new File([bytes], f.name, { type: 'model/gltf-binary' })
    })
    const result = await importGlbFiles(files, opts)
    ;(window as unknown as { __importGlbFilesResult?: unknown }).__importGlbFilesResult = result
    return result
  }
}
