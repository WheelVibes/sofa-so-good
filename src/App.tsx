import { useCallback, useEffect, useRef } from 'react';
import { Scene } from './scene/Scene';
import { MarqueeSelector } from './scene/selection/MarqueeSelector';
import { Crosshair } from './ui/Crosshair';
import { DoorPrompt } from './ui/DoorPrompt';
import { HelpHint } from './ui/HelpHint';
import { Toolbar } from './ui/Toolbar';
import { CatalogDrawer } from './ui/catalog/CatalogDrawer';
import { usePlacementController } from './ui/catalog/usePlacementController';
import { FinishPicker } from './ui/FinishPicker';
import { InspectorPanel } from './ui/inspector/InspectorPanel';
import { WebGLFallback } from './ui/WebGLFallback';
import { NotificationContainer } from './ui/notifications/NotificationContainer';
import { useStore } from './state/store';
import {
  KEYBINDINGS,
  NUDGE_FINE_SPEED,
  NUDGE_SPEED,
  ROTATE_FINE_STEP,
  ROTATE_STEP,
} from './controls/keybindings';
import { useCatalog } from './furniture/catalog';
import { canPlace } from './collision/placement';
import { isEditableTarget, useKeyboard } from './controls/useKeyboard';
import { cameraForwardXZ } from './scene/cameras/cameraForward';

export default function App() {
  const toggleMeasurements = useStore((s) => s.toggleMeasurements);
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const catalog = useCatalog();
  usePlacementController();

  // Seed the default layout on first mount when nothing has been
  // hydrated. Phase 3 autosave will short-circuit this once it lands.
  useEffect(() => {
    if (useStore.getState().items.length === 0) {
      useStore.getState().resetToDefault();
    }
    // Drop the seed/hydrate snapshot so the first user undo doesn't pop
    // the layout back to a blank apartment they never saw.
    useStore.getState().clearHistory();
  }, []);

  const pasteClipboard = useCallback(() => {
    const state = useStore.getState();
    const entry = state.clipboard;
    if (!entry) return;
    const def = catalog[entry.defId];
    if (!def) return;

    // Search a small spiral of XZ offsets starting near the source so the
    // paste lands next to the original; first non-colliding cell wins.
    const STEP = 0.3;
    const MAX_RING = 8;
    const candidatePositions: [number, number][] = [];
    for (let r = 1; r <= MAX_RING; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          candidatePositions.push([
            entry.sourcePosition[0] + dx * STEP,
            entry.sourcePosition[1] + dz * STEP,
          ]);
        }
      }
    }

    for (const pos of candidatePositions) {
      const candidate = {
        id: 'paste-probe',
        defId: entry.defId,
        position: pos,
        rotation: entry.rotation,
        props: entry.props,
      } as const;
      const ok = canPlace(candidate, def, {
        others: state.items,
        defs: catalog,
        doors: state.doors,
      });
      if (ok) {
        state.addItem({
          defId: entry.defId,
          position: pos,
          rotation: entry.rotation,
          props: { ...entry.props },
        });
        return;
      }
    }
  }, [catalog]);

  const onKey = useCallback(
    (code: string, e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Undo/redo: handle before any other mod-key path so they work
      // regardless of camera mode and selection state.
      if (mod && code === KEYBINDINGS.undo) {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
        return;
      }
      if (mod && code === KEYBINDINGS.redo) {
        e.preventDefault();
        useStore.getState().redo();
        return;
      }
      if (!mod && code === KEYBINDINGS.toggleMeasurements) toggleMeasurements();
      if (!mod && code === KEYBINDINGS.toggleCameraMode) {
        setCameraMode(cameraMode === 'orbit' ? 'firstPerson' : 'orbit');
      }
      if (!mod && code === KEYBINDINGS.cyclePresetTime) {
        useStore.getState().cyclePresetTime();
      }
      if (code === KEYBINDINGS.interact) {
        const { nearbyDoorId, toggleDoor } = useStore.getState();
        if (nearbyDoorId) toggleDoor(nearbyDoorId);
      }

      // Editor-only keys: scoped to orbit mode so first-person walking
      // doesn't accidentally delete or rotate the player's selection.
      if (cameraMode !== 'orbit') return;
      const state = useStore.getState();
      if (!mod && code === KEYBINDINGS.toggleCatalog) {
        state.toggleCatalogOpen();
      }
      if (code === KEYBINDINGS.deselect) {
        state.selectItem(null);
      }
      if (code === KEYBINDINGS.deleteSelected && state.selectedItemIds.length > 0) {
        // Snapshot ids before deleting — deleteItem mutates the set as it goes.
        for (const id of [...state.selectedItemIds]) {
          useStore.getState().deleteItem(id);
        }
      }
      if (mod && code === KEYBINDINGS.copySelected && state.selectedItemId) {
        e.preventDefault();
        const item = state.items.find((i) => i.id === state.selectedItemId);
        if (item) {
          state.setClipboard({
            defId: item.defId,
            rotation: item.rotation,
            props: item.props,
            sourcePosition: item.position,
          });
        }
      }
      if (mod && code === KEYBINDINGS.pasteClipboard && state.clipboard) {
        e.preventDefault();
        pasteClipboard();
      }
      if (mod && code === KEYBINDINGS.duplicateSelected && state.selectedItemId) {
        e.preventDefault();
        const item = state.items.find((i) => i.id === state.selectedItemId);
        if (item) {
          state.setClipboard({
            defId: item.defId,
            rotation: item.rotation,
            props: item.props,
            sourcePosition: item.position,
          });
          pasteClipboard();
        }
      }
      if (!mod && code === KEYBINDINGS.rotate && state.selectedItemId) {
        const item = state.items.find((i) => i.id === state.selectedItemId);
        const def = item ? catalog[item.defId] : null;
        if (!item || !def) return;
        const step = e.shiftKey ? ROTATE_FINE_STEP : ROTATE_STEP;
        const nextRotation = item.rotation + step;
        const candidate = { ...item, rotation: nextRotation };
        const ok = canPlace(candidate, def, {
          others: state.items,
          defs: catalog,
          doors: state.doors,
        });
        if (ok) {
          state.pushHistory();
          state.rotateItem(item.id, nextRotation);
        }
      }
      if (code === KEYBINDINGS.toggleEditorTool) {
        state.toggleEditorTool();
      }

    },
    [toggleMeasurements, cameraMode, setCameraMode, catalog, pasteClipboard],
  );
  useKeyboard(onKey);

  // Press-and-hold nudge: arrow keys move the selected item continuously
  // along world-XZ at NUDGE_SPEED m/s (Shift = fine). preventDefault on
  // keydown stops the page from scrolling. Collision-rejected frames
  // simply skip the move so the outline never flashes red.
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  useEffect(() => {
    const dirs: Record<string, [number, number]> = {
      [KEYBINDINGS.nudgeUp]: [0, -1],
      [KEYBINDINGS.nudgeDown]: [0, 1],
      [KEYBINDINGS.nudgeLeft]: [-1, 0],
      [KEYBINDINGS.nudgeRight]: [1, 0],
    };
    const held = new Set<string>();
    let shiftHeld = false;
    let rafId = 0;
    let lastTime = 0;

    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      lastTime = 0;
    };

    const tick = (t: number) => {
      const dt = lastTime ? Math.min((t - lastTime) / 1000, 0.05) : 0;
      lastTime = t;
      rafId = requestAnimationFrame(tick);
      if (held.size === 0) return;
      const state = useStore.getState();
      if (state.cameraMode !== 'orbit' || state.selectedItemIds.length === 0) return;
      const movingIds = state.selectedItemIds;
      const movingItems = state.items.filter((i) => movingIds.includes(i.id));
      if (movingItems.length === 0) return;
      let dx = 0;
      let dz = 0;
      for (const code of held) {
        const d = dirs[code];
        if (d) {
          dx += d[0];
          dz += d[1];
        }
      }
      if (dx === 0 && dz === 0) return;
      // Snap camera-forward to the nearest world-XZ cardinal so movement
      // stays on apartment axes (never diagonal) even when the orbit yaw
      // sits between cardinals. Screen-right is forward rotated +90° on Y
      // in three.js's right-handed/-Z-look convention: R=(-fz,fx).
      const fxRaw = cameraForwardXZ.x;
      const fzRaw = cameraForwardXZ.z;
      const dominantX = Math.abs(fxRaw) >= Math.abs(fzRaw);
      const fx = dominantX ? Math.sign(fxRaw) || 1 : 0;
      const fz = dominantX ? 0 : Math.sign(fzRaw) || 1;
      const worldDx = -fz * dx + fx * -dz;
      const worldDz = fx * dx + fz * -dz;
      const speed = shiftHeld ? NUDGE_FINE_SPEED : NUDGE_SPEED;
      const stepX = worldDx * speed * dt;
      const stepZ = worldDz * speed * dt;
      // Validate the whole group's next pose first; reject if any member
      // would collide. Group members are excluded from each other's
      // collision check since their relative positions don't change.
      const inGroup = new Set(movingIds);
      const others = state.items.filter((it) => !inGroup.has(it.id));
      const candidates = movingItems.map((item) => {
        const def = catalogRef.current[item.defId];
        const next: [number, number] = [item.position[0] + stepX, item.position[1] + stepZ];
        return { item, def, next };
      });
      let ok = true;
      for (const c of candidates) {
        if (!c.def) {
          ok = false;
          break;
        }
        if (
          !canPlace(
            { ...c.item, position: c.next },
            c.def,
            { others, defs: catalogRef.current, doors: state.doors },
          )
        ) {
          ok = false;
          break;
        }
      }
      if (!ok) return;
      for (const c of candidates) state.moveItem(c.item.id, c.next);
    };

    const onDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = true;
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(dirs, e.code)) return;
      if (useStore.getState().cameraMode !== 'orbit') return;
      e.preventDefault();
      // First key in a nudge session: snapshot the pre-nudge transform so
      // the entire press-and-hold collapses into a single undo step.
      if (held.size === 0 && useStore.getState().selectedItemId) {
        useStore.getState().pushHistory();
      }
      held.add(e.code);
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftHeld = false;
        return;
      }
      held.delete(e.code);
      if (held.size === 0) stop();
    };
    const onBlur = () => {
      held.clear();
      shiftHeld = false;
      stop();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      stop();
    };
  }, []);

  return (
    <WebGLFallback>
      <div className="relative h-screen w-screen overflow-hidden">
        <Toolbar />
        <Scene />
        <MarqueeSelector />
        <Crosshair />
        <DoorPrompt />
        <HelpHint />
        <CatalogDrawer />
        <InspectorPanel />
        <FinishPicker />
        <NotificationContainer />
      </div>
    </WebGLFallback>
  );
}
