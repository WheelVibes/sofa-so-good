/**
 * App-wide keyboard orchestration, extracted from `App.tsx` (R3-REFAC-1) so
 * the hotkey logic is unit-testable in isolation. Two layers, mounted once
 * from App via {@link useAppHotkeys}:
 *
 * - {@link useGlobalHotkeys} — a RAW `window` keydown listener (deliberately
 *   NOT `useKeyboard`): ⌘K must fire even while a text input is focused, so
 *   each branch applies its own `isEditableTarget` / modal guards instead of
 *   the shared pre-filter.
 * - {@link useEditorHotkeys} — the editor-scoped dispatch registered through
 *   `useKeyboard` (which already drops repeats, editable targets, and any
 *   keydown while a modal dialog is open — see `controls/modalGuard.ts`).
 *
 * The press-and-hold arrow-key nudge lives in its own hook (`useNudge.ts`),
 * and `P` ⇄ 2D plan editor in `planEditorHotkey.ts`.
 */
import { useCallback, useEffect } from 'react'
import { canPlace } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { isFeatureEnabled } from '../features/featureFlags'
import { useCatalog } from '../furniture/catalog'
import { planDuplicates } from '../furniture/duplicatePlacement'
import { tidyHome } from '../layout/tidyHome'
import { resolveSelectionExtents, selectionBounds } from '../scene/cameras/frameSelection'
import { getRoomEditorShell } from '../scene/roomEditorShell'
import { canEditScene, dispatchWalkInteract } from '../state/editing'
import { editableRoomIds } from '../state/rooms'
import { useStore } from '../state/store'
import { roomScopedItemIds } from '../ui/app/roomScopedItemIds'
import { KEYBINDINGS, ROTATE_FINE_STEP, ROTATE_STEP } from './keybindings'
import { isAnyModalOpen } from './modalGuard'
import { isEditableTarget, useKeyboard } from './useKeyboard'

/**
 * Global ⌘K / Ctrl-K toggles the command palette from anywhere (including
 * while a text input is focused), so it's added directly rather than through
 * the editor-scoped keyboard handler. Also hosts the other always-active
 * app-level keys: undo/redo, `?` help, `B` budget, ⌘A select-all, `[`/`]`
 * selection cycling, `,`/`.` room cycling, and `/` catalog search.
 */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // No global shortcuts while a modal dialog is open — including ⌘K (don't
      // stack the palette over a dialog; the open palette itself is not a
      // Modal, so its own keyboard handling is unaffected) and Cmd/Ctrl+Z
      // (most apps suppress app-level undo behind a dialog; inputs keep native
      // undo). Each modal owns its Escape-to-close. See controls/modalGuard.ts.
      if (isAnyModalOpen()) return
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        useStore.getState().toggleCmdk()
        return
      }
      // Undo / redo are ALWAYS active — every editing surface tracks edits in the
      // same history (per-room editor, the 2D floor-plan editor, and the
      // overview). Suppressed only while a modal is open (handled above) or while
      // typing in a field (native input undo wins). Cmd/Ctrl+Z = undo,
      // Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y = redo.
      const undoMod = e.metaKey || e.ctrlKey
      if (undoMod && e.code === KEYBINDINGS.undo && !isEditableTarget(e)) {
        e.preventDefault()
        if (e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo()
        return
      }
      if (undoMod && e.code === KEYBINDINGS.redo && !isEditableTarget(e)) {
        e.preventDefault()
        useStore.getState().redo()
        return
      }
      // `?` opens the keyboard-shortcuts overlay (the universal convention) when
      // that feature is on; otherwise it falls back to toggling the Appearance
      // panel (which hosts the user guide + tour), preserving the old behaviour.
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e)) {
        e.preventDefault()
        const s = useStore.getState()
        if (isFeatureEnabled('shortcutsHelp')) s.setShortcutsHelpOpen(true)
        else s.setAppearanceOpen(!s.appearanceOpen)
        return
      }
      // `B` toggles the Budget / shopping panel (an orbit-view .aux panel) when
      // the budget feature is enabled — quick access to spend tracking. Not while
      // typing / for modifier combos / in walk.
      if (
        (e.key === 'b' || e.key === 'B') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e) &&
        useStore.getState().cameraMode === 'orbit' &&
        isFeatureEnabled('budget')
      ) {
        e.preventDefault()
        useStore.getState().toggleBudget()
        return
      }
      // Ctrl/⌘+A selects every item in the room being edited (editing is
      // room-editor-only now; the overview/walk are view-only). Not while typing.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A') && !isEditableTarget(e)) {
        const s = useStore.getState()
        const ids = roomScopedItemIds(s)
        if (canEditScene(s) && ids.length > 0) {
          e.preventDefault()
          s.setSelectedItemIds(ids)
        }
      }
      // `[` / `]` cycle the selection through the room's items (prev / next,
      // wrapping) — keyboard access without a mouse. Room editor only.
      if (
        (e.key === '[' || e.key === ']') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e)
      ) {
        const s = useStore.getState()
        const ids = roomScopedItemIds(s)
        if (canEditScene(s) && ids.length > 0) {
          e.preventDefault()
          const cur = ids.indexOf(s.selectedItemId ?? '')
          const step = e.key === ']' ? 1 : -1
          // From no selection, ']' starts at the first item and '[' at the last.
          const next =
            cur === -1 ? (step === 1 ? 0 : ids.length - 1) : (cur + step + ids.length) % ids.length
          s.selectItem(ids[next])
          return
        }
      }
      // `,` / `.` cycle the room being edited (prev / next) — a quick way to work
      // room-by-room without the dropdown. Room editor only; skipped while typing.
      if (
        (e.key === ',' || e.key === '.') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e)
      ) {
        const s = useStore.getState()
        if (canEditScene(s)) {
          const ids = editableRoomIds(s.floorPlan)
          if (ids.length > 0) {
            e.preventDefault()
            const cur = ids.indexOf(s.roomEditor.roomId ?? '')
            const step = e.key === '.' ? 1 : -1
            const next = ((cur < 0 ? 0 : cur + step) + ids.length) % ids.length
            s.enterRoomEditor(ids[next])
            return
          }
        }
      }
      // `/` jumps to the catalog search (opening the drawer if needed), a
      // quick-find shortcut. The catalog lives in the room editor now, so this
      // is editor-only. Skipped while typing / for modifier combos.
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditableTarget(e) &&
        canEditScene(useStore.getState())
      ) {
        e.preventDefault()
        // Force the Catalog tab (not Layers) so the search box is the catalog's,
        // then ensure the drawer is open.
        useStore.getState().setLeftMode('catalog')
        if (!useStore.getState().catalogOpen) useStore.getState().setCatalogOpen(true)
        // The drawer (and Layers filter) reuse `.cat-search input`; focus it once
        // the panel has mounted/painted.
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>('.panel.catalog .cat-search input')
          input?.focus()
          input?.select()
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * The editor-scoped keyboard dispatch (camera mode, time cycle, walk
 * interact, tool keys, copy/paste/duplicate, flip/rotate, delete, …),
 * registered through `useKeyboard`. View/global keys run in any mode;
 * editing keys only inside the per-room editor (`canEditScene`).
 */
export function useEditorHotkeys(): void {
  const toggleMeasurements = useStore((s) => s.toggleMeasurements)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const catalog = useCatalog()

  const pasteClipboard = useCallback(() => {
    const state = useStore.getState()
    const entries = state.clipboard
    if (!entries || entries.length === 0) return

    // Multi-item paste: rebuild the copied selection as pseudo-sources at their
    // copy-time positions and reuse `planDuplicates` (shared-offset, arrangement-
    // preserving, collision-skipping) — one undo step (PC2-MULTI-DUP-PASTE).
    if (entries.length > 1) {
      const mkId = (n: number) =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `paste-${Date.now()}-${n}`
      const sources = entries
        .filter((e) => catalog[e.defId])
        .map((e, i) => ({
          id: `paste-src-${i}`,
          defId: e.defId,
          position: [e.sourcePosition[0], e.sourcePosition[1]] as [number, number],
          rotation: e.rotation,
          flipX: e.flipX,
          flipZ: e.flipZ,
          label: e.label,
          props: { ...e.props },
        }))
      const copies = planDuplicates(
        sources,
        { others: state.items, defs: catalog, doors: state.doors },
        mkId,
      )
      if (copies.length === 0) return
      state.pushHistory()
      state.setItems([...state.items, ...copies])
      state.setSelectedItemIds(copies.map((c) => c.id))
      return
    }

    const entry = entries[0]
    const def = catalog[entry.defId]
    if (!def) return

    // Anchor the paste near the source — but if we're editing a *different*
    // room than the copy came from, anchor to the current room's centre so
    // "copy here → switch room → paste" lands in the room you're looking at
    // (not back in the source room, where the new item would be off-screen).
    let base = entry.sourcePosition
    if (state.roomEditor.active && state.roomEditor.roomId) {
      const shell = getRoomEditorShell(state.floorPlan, state.roomEditor.roomId)?.shell
      if (shell && !shell.contains(base[0], base[1])) base = shell.center
    }

    // Search a small spiral of XZ offsets starting near the anchor so the
    // paste lands next to it; first non-colliding cell wins.
    const STEP = 0.3
    const MAX_RING = 8
    const candidatePositions: [number, number][] = []
    for (let r = 1; r <= MAX_RING; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          candidatePositions.push([base[0] + dx * STEP, base[1] + dz * STEP])
        }
      }
    }

    for (const pos of candidatePositions) {
      const candidate = {
        id: 'paste-probe',
        defId: entry.defId,
        position: pos,
        rotation: entry.rotation,
        flipX: entry.flipX,
        flipZ: entry.flipZ,
        props: entry.props,
      } as const
      const ok = canPlace(candidate, def, {
        others: state.items,
        defs: catalog,
        doors: state.doors,
        walls: placementWalls(state),
      })
      if (ok) {
        state.addItem({
          defId: entry.defId,
          position: pos,
          rotation: entry.rotation,
          flipX: entry.flipX,
          flipZ: entry.flipZ,
          label: entry.label,
          props: { ...entry.props },
        })
        return
      }
    }
  }, [catalog])

  // Duplicate the current selection. A single item reuses the clipboard/paste
  // spiral; a multi-selection is offset by one shared delta (preserving the
  // arrangement), collision-skipping blocked members, in ONE undo step. Copies
  // inherit a fresh shared group only when every source shared one group.
  const duplicateSelection = useCallback(() => {
    const st = useStore.getState()
    const ids = st.selectedItemIds
    const single = st.items.find((i) => i.id === st.selectedItemId)
    if (ids.length <= 1) {
      if (!single) return
      st.setClipboard([
        {
          defId: single.defId,
          rotation: single.rotation,
          props: single.props,
          flipX: single.flipX,
          flipZ: single.flipZ,
          label: single.label,
          sourcePosition: single.position,
        },
      ])
      pasteClipboard()
      return
    }
    const sources = st.items.filter((i) => ids.includes(i.id))
    const groupIds = new Set(sources.map((s) => s.groupId))
    const sharedGroup = groupIds.size === 1 && !groupIds.has(undefined)
    const gid =
      sharedGroup && typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : undefined
    const copies = planDuplicates(
      sources,
      { others: st.items, defs: catalog, doors: st.doors },
      (n) =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `id-${Date.now()}-${n}`,
      gid,
    )
    if (copies.length === 0) return
    st.pushHistory()
    st.setItems([...st.items, ...copies])
    st.setSelectedItemIds(copies.map((i) => i.id))
  }, [catalog, pasteClipboard])

  const onKey = useCallback(
    (code: string, e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey

      // --- View / global keys (work in any mode) ---
      if (!mod && code === KEYBINDINGS.toggleCameraMode) {
        setCameraMode(cameraMode === 'orbit' ? 'firstPerson' : 'orbit')
      }
      if (!mod && code === KEYBINDINGS.cyclePresetTime) {
        useStore.getState().cyclePresetTime()
      }
      if (code === KEYBINDINGS.interact) {
        // Walk-mode only (VIEW-EDIT-SPLIT/WINDOW-FIXTURE-INTERACT): orbit
        // mode never toggles a door/fixture/screen/light on E. `nearbyDoorId`/
        // `nearbyFixtureId`/`nearbyScreenId`/`nearbyLightId` are only ever set
        // by FirstPersonCamera's aim loop, but `dispatchWalkInteract` is still
        // the single gate every interact entry point (this, `Door.tsx`,
        // `Furniture.tsx`) shares. Fixed priority order — door, then curtain/
        // blind fixture, then whichever of screen/light the aim loop already
        // picked as nearest (WALK-SCREEN-INTERACT/WALK-LIGHT-INTERACT: the two
        // are mutually exclusive by the time they reach here).
        const state = useStore.getState()
        if (state.nearbyDoorId) {
          dispatchWalkInteract(state, state.nearbyDoorId, state.toggleDoor)
        } else if (state.nearbyFixtureId && isFeatureEnabled('walkWindowFixtures')) {
          dispatchWalkInteract(state, state.nearbyFixtureId, state.toggleWindowFixture)
        } else if (state.nearbyScreenId && isFeatureEnabled('walkScreens')) {
          dispatchWalkInteract(state, state.nearbyScreenId, state.cycleScreenContent)
        } else if (state.nearbyLightId && isFeatureEnabled('walkLights')) {
          dispatchWalkInteract(state, state.nearbyLightId, state.toggleLightPower)
        }
      }
      if (!mod && code === KEYBINDINGS.toggleMeasurements) toggleMeasurements()

      // Escape: cancel an armed catalog placement, then the tape/comment tools,
      // then clear any selection. Escape deliberately does NOT leave the per-room
      // editor — exiting is an explicit action (the Done control), so a stray
      // Escape can't dump the user back to the orbit overview mid-design.
      if (code === KEYBINDINGS.deselect) {
        const st = useStore.getState()
        // A catalog placement in progress owns Escape (cancel the armed ghost);
        // `usePlacementController` performs the actual cancel — bail here so we
        // don't also clear the selection on the same keypress.
        if (st.activeDefId) return
        if (st.tapeMode) {
          st.toggleTapeMode()
          return
        }
        if (st.commentMode) {
          st.toggleCommentMode()
          return
        }
        if (
          st.selectedItemId ||
          st.selectedItemIds.length > 0 ||
          st.selectedRoomId ||
          st.selectedWall
        ) {
          st.selectItem(null)
          return
        }
        return
      }

      // Camera framing is available in any orbit view (whole-flat overview or
      // room editor) — it's navigation, not editing.
      if (cameraMode === 'orbit') {
        if (!mod && code === KEYBINDINGS.topView) useStore.getState().requestTopView()
        if (!mod && code === KEYBINDINGS.resetView) useStore.getState().requestHomeView()
        // FEAT-A: dolly/frame the camera to fit the current selection (Z — see
        // keybindings.ts for why not bare F). No-op with nothing selected;
        // selection only ever exists inside the room editor (canEditScene),
        // which is already orbit-mode, so no extra editing-scope check needed.
        if (!mod && code === KEYBINDINGS.frameSelection && isFeatureEnabled('frameSelection')) {
          const st = useStore.getState()
          if (st.selectedItemIds.length > 0) {
            const extents = resolveSelectionExtents(st.items, st.selectedItemIds, catalog)
            const bounds = selectionBounds(extents)
            if (bounds) st.requestFrameSelection(bounds)
          }
        }
      }

      // --- Editing keys: only inside the per-room editor (orbit camera). The
      // whole-flat orbit overview and walk mode are view-only. ---
      if (!canEditScene(useStore.getState())) return
      const state = useStore.getState()
      // Undo / redo live in the always-active global handler (useGlobalHotkeys)
      // so they work in the floor-plan editor + overview too — not just here.
      if (!mod && code === KEYBINDINGS.toggleCatalog) {
        state.toggleCatalogOpen()
      }
      if (!mod && code === KEYBINDINGS.tidyHome) tidyHome()
      if (code === KEYBINDINGS.deleteSelected && state.selectedItemIds.length > 0) {
        // Snapshot ids before deleting — deleteItem mutates the set as it goes.
        // Locked items are skipped (pinned).
        const lockedIds = new Set(state.items.filter((i) => i.locked).map((i) => i.id))
        for (const id of [...state.selectedItemIds]) {
          if (!lockedIds.has(id)) useStore.getState().deleteItem(id)
        }
      }
      if (mod && code === KEYBINDINGS.copySelected && state.selectedItemIds.length > 0) {
        e.preventDefault()
        // Copy the WHOLE selection (each item with its position) so a multi-select
        // pastes back as a group preserving its arrangement (PC2-MULTI-DUP-PASTE).
        const sel = state.items.filter((i) => state.selectedItemIds.includes(i.id))
        if (sel.length > 0) {
          state.setClipboard(
            sel.map((item) => ({
              defId: item.defId,
              rotation: item.rotation,
              props: item.props,
              flipX: item.flipX,
              flipZ: item.flipZ,
              label: item.label,
              sourcePosition: item.position,
            })),
          )
        }
      }
      if (mod && code === KEYBINDINGS.pasteClipboard && state.clipboard?.length) {
        e.preventDefault()
        pasteClipboard()
      }
      if (mod && code === KEYBINDINGS.duplicateSelected && state.selectedItemId) {
        e.preventDefault()
        duplicateSelection()
      }
      if (!mod && code === KEYBINDINGS.flip && state.selectedItemId) {
        // F flips left↔right; Shift+F flips front↔back. Applies to the whole
        // selection. Flipping is a mirror — footprint is unchanged, so no
        // collision check is needed.
        e.preventDefault()
        const axis = e.shiftKey ? 'z' : 'x'
        const ids =
          state.selectedItemIds.length > 0 ? state.selectedItemIds : [state.selectedItemId]
        state.pushHistory()
        for (const id of ids) useStore.getState().flipItem(id, axis)
        return
      }
      // While a catalog placement is armed, R rotates the *ghost*
      // (usePlacementController) — don't also spin the current selection.
      if (!mod && code === KEYBINDINGS.rotate && state.selectedItemId && !state.activeDefId) {
        const step = e.shiftKey ? ROTATE_FINE_STEP : ROTATE_STEP
        const ids =
          state.selectedItemIds.length > 0 ? state.selectedItemIds : [state.selectedItemId]
        const group = state.items.filter((i) => ids.includes(i.id) && !i.locked)
        if (group.length === 0) return

        if (group.length === 1) {
          const item = group[0]
          const def = catalog[item.defId]
          if (!def) return
          const nextRotation = item.rotation + step
          const ok = canPlace({ ...item, rotation: nextRotation }, def, {
            others: state.items,
            defs: catalog,
            doors: state.doors,
            walls: placementWalls(state),
          })
          if (ok) {
            state.pushHistory()
            state.rotateItem(item.id, nextRotation)
          }
          return
        }

        // Group rotate about the centroid (rigid). Pre-check canPlace on the
        // rotated candidates; commit via the store's groupRotate helper if all
        // fit (groupRotate preserves the arrangement + pushes history).
        const cx = group.reduce((a, i) => a + i.position[0], 0) / group.length
        const cz = group.reduce((a, i) => a + i.position[1], 0) / group.length
        const cos = Math.cos(step)
        const sin = Math.sin(step)
        const candidates = group.map((i) => {
          const dx = i.position[0] - cx
          const dz = i.position[1] - cz
          return {
            ...i,
            position: [cx + dx * cos - dz * sin, cz + dx * sin + dz * cos] as [number, number],
            rotation: i.rotation + step,
          }
        })
        const byId = new Map(candidates.map((c) => [c.id, c]))
        const merged = state.items.map((i) => byId.get(i.id) ?? i)
        const allFit = candidates.every((c) => {
          const def = catalog[c.defId]
          return (
            def &&
            canPlace(c, def, {
              others: merged,
              defs: catalog,
              doors: state.doors,
              walls: placementWalls(state),
            })
          )
        })
        if (allFit) {
          // All selected members share one group when this path is reached via
          // a group selection; rotate it about the shared centroid the
          // candidates were computed from. In practice the selection is one
          // group, so rotate it via the helper.
          const gid = group[0].groupId
          if (gid && group.every((i) => i.groupId === gid)) {
            state.groupRotate(gid, step)
          } else {
            // Heterogeneous multi-select (spans groups / ungrouped): keep the
            // historical inline behaviour so a flat marquee still rotates.
            state.pushHistory()
            for (const c of candidates) {
              state.rotateItem(c.id, c.rotation)
              state.moveItem(c.id, c.position)
            }
          }
        }
      }
    },
    [toggleMeasurements, cameraMode, setCameraMode, catalog, pasteClipboard, duplicateSelection],
  )
  useKeyboard(onKey)
}

/**
 * Mount the app's global + editor keyboard layers (call once, from App).
 * Registration order matters and mirrors the pre-extraction App.tsx order:
 * global listener first, then the editor dispatch — followed in App by
 * `usePlanEditorHotkey()` and `useNudge()`.
 */
export function useAppHotkeys(): void {
  useGlobalHotkeys()
  useEditorHotkeys()
}
