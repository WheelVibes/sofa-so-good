import { useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { Icon } from './icons';
import { Popover } from './Popover';
import { IconButton } from './IconButton';
import { MenuItem } from './ToolbarMenu';
import { ViewMenu } from './menus/ViewMenu';
import { SceneMenu } from './menus/SceneMenu';
import { ArrangeMenu } from './menus/ArrangeMenu';
import { ToolsMenu } from './menus/ToolsMenu';
import { FileMenu } from './menus/FileMenu';
import { GraphicsSettings } from '../GraphicsSettings';
import { CreditsModal } from '../CreditsModal';
import { shortcutLabel } from './shortcuts';
import { QUALITY_LABEL } from '../../scene/quality';

function Divider() {
  return <div className="mx-1 h-6 w-px shrink-0 bg-neutral-300/70" />;
}

const LIGHTS_LABEL: Record<'auto' | 'on' | 'off', string> = { auto: 'Auto', on: 'On', off: 'Off' };

/** The icon-island toolbar. Frequent actions are direct icon buttons; busy
 *  clusters collapse into labelled portaled dropdown menus. Editing clusters
 *  show only in orbit mode (Walk keeps the camera essentials). */
export function Toolbar() {
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const roomEditorActive = useStore((s) => s.roomEditor.active);
  const editorTool = useStore((s) => s.editorTool);
  const setEditorTool = useStore((s) => s.setEditorTool);
  const catalogOpen = useStore((s) => s.catalogOpen);
  const toggleCatalogOpen = useStore((s) => s.toggleCatalogOpen);
  const showMeasurements = useStore((s) => s.showMeasurements);
  const toggleMeasurements = useStore((s) => s.toggleMeasurements);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const toggleSnap = useStore((s) => s.toggleSnap);
  const gridSize = useStore((s) => s.gridSize);
  const cycleGridSize = useStore((s) => s.cycleGridSize);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const lightsMode = useStore((s) => s.lightsMode);
  const cycleLightsMode = useStore((s) => s.cycleLightsMode);
  const qualityTier = useStore((s) => s.qualityTier);

  const [graphicsOpen, setGraphicsOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  const orbit = cameraMode === 'orbit';
  const gridLabel = gridSize >= 1 ? `${gridSize} m` : `${Math.round(gridSize * 100)} cm`;

  return (
    <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <div className="flex max-w-[96vw] items-center gap-0.5 overflow-x-auto rounded-2xl border border-white/60 bg-white/85 px-2 py-1.5 shadow-xl backdrop-blur">
        {/* Camera */}
        <CameraControl mode={cameraMode} setMode={setCameraMode} />

        {orbit && (
          <>
            <Divider />
            <ViewMenu />
            {!roomEditorActive && <SceneMenu />}

            <Divider />
            {/* Edit */}
            <IconButton
              icon={editorTool === 'select' ? 'Select' : 'Rotate'}
              label={`Tool: ${editorTool === 'select' ? 'Select' : 'Rotate'}`}
              shortcut={shortcutLabel('toggleEditorTool')}
              active={editorTool === 'select'}
              onClick={() => setEditorTool(editorTool === 'select' ? 'orbit' : 'select')}
            />
            <IconButton icon="Undo" label="Undo" shortcut={shortcutLabel('undo')} active={false} onClick={canUndo ? undo : undefined} />
            <IconButton icon="Redo" label="Redo" shortcut={shortcutLabel('redo')} onClick={canRedo ? redo : undefined} />
            <IconButton icon="Snap" label={`Snap to grid · ${gridLabel}`} active={snapEnabled} onClick={toggleSnap} />
            {snapEnabled ? (
              <button
                onClick={cycleGridSize}
                title="Grid cell size"
                className="h-9 rounded-lg px-2 text-xs text-neutral-600 hover:bg-neutral-200/80"
              >
                {gridLabel}
              </button>
            ) : null}
            <IconButton icon="Measure" label="Measurements" shortcut={shortcutLabel('toggleMeasurements')} active={showMeasurements} onClick={toggleMeasurements} />

            <Divider />
            {/* Design */}
            <IconButton icon="Catalog" label="Catalog" shortcut={shortcutLabel('toggleCatalog')} active={catalogOpen} onClick={toggleCatalogOpen} />
            <ArrangeMenu />
            {!roomEditorActive && <ToolsMenu />}

            <Divider />
            {/* Render */}
            <IconButton icon="Quality" label={`Graphics — ${QUALITY_LABEL[qualityTier]}`} onClick={() => setGraphicsOpen(true)} />
            {!roomEditorActive && (
              <IconButton icon="Lights" label={`Lights: ${LIGHTS_LABEL[lightsMode]}`} active={lightsMode !== 'auto'} onClick={cycleLightsMode} />
            )}

            <Divider />
            <FileMenu />
          </>
        )}

        <Divider />
        <IconButton icon="Credits" label="Asset credits" onClick={() => setCreditsOpen(true)} />
      </div>

      <GraphicsSettings open={graphicsOpen} onClose={() => setGraphicsOpen(false)} />
      <CreditsModal open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  );
}

/** Orbit/Walk camera toggle as an icon + chevron opening a tiny popover. */
function CameraControl({ mode, setMode }: { mode: 'orbit' | 'firstPerson'; setMode: (m: 'orbit' | 'firstPerson') => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const isOrbit = mode === 'orbit';
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label="Camera mode"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1 rounded-lg bg-neutral-900 px-2.5 text-white"
      >
        {/* reuse the same icon names via IconButton-free inline render */}
        <span className="inline-flex">{isOrbit ? <OrbitGlyph /> : <WalkGlyph />}</span>
        <ChevronGlyph />
      </button>
      <ToolbarMenuLite open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        <MenuItem icon="Orbit" label="Orbit" sub="Look around the model" active={isOrbit} onClick={() => { setMode('orbit'); setOpen(false); }} />
        <MenuItem icon="Walk" label="Walk" sub="First-person walkthrough" active={!isOrbit} onClick={() => { setMode('firstPerson'); setOpen(false); }} />
      </ToolbarMenuLite>
    </>
  );
}

// Minimal inline glyphs for the camera pill (full set lives in icons.tsx).
function OrbitGlyph() { return <Icon.Orbit />; }
function WalkGlyph() { return <Icon.Walk />; }
function ChevronGlyph() { return <Icon.Chevron width={12} height={12} className="opacity-60" />; }

/** A bare popover panel (no trigger) for the camera control. */
function ToolbarMenuLite({ open, anchorRef, onClose, children }: { open: boolean; anchorRef: React.RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode }) {
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose}>
      <div role="menu" className="w-52 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-2xl">
        {children}
      </div>
    </Popover>
  );
}
