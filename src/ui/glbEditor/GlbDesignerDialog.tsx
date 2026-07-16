import { createPortal } from 'react-dom'
import { Icon } from '../toolbar/icons'
import { ArrangePanel } from './ArrangePanel'
import { CombinePanel } from './CombinePanel'
import { ComponentsPanel } from './ComponentsPanel'
import { DesignerToolbar } from './DesignerToolbar'
import { DesignerViewport } from './DesignerViewport'
import { DesignerProvider, useDesigner } from './designerContext'
import { GroupInspector } from './GroupInspector'
import { LayersPanel } from './LayersPanel'
import { MakeConfigurablePanel } from './MakeConfigurablePanel'
import { PartInspector } from './PartInspector'
import { SavePanel } from './SavePanel'
import { SourcePanel } from './SourcePanel'
import { TemplatesPanel } from './TemplatesPanel'

/**
 * GLB Asset Designer — compose a new asset from primitive shapes and/or start
 * from an uploaded GLB (uniformly scaled) to make a custom variant, preview it
 * live, then export → save into the catalog (reusing the upload pipeline).
 *
 * Stage 4a made this file pure **composition**: all editing state + handlers live
 * in `designerContext.tsx` (`useDesigner()`), which the focused sibling panels
 * (`DesignerViewport` / `DesignerToolbar` / `LayersPanel` / `SourcePanel` /
 * `CombinePanel` / `SavePanel` / `PartInspector` / …) consume directly instead of
 * the ~99 props they were hand-threaded before. All pure spec/geometry logic
 * still lives in `src/furniture/glbEdit/`.
 */
export function GlbDesignerDialog() {
  return (
    <DesignerProvider>
      <DesignerDialogFrame />
    </DesignerProvider>
  )
}

/** The dialog chrome + panel layout. Gates its own render on the designer being
 *  open + flag-enabled; the provider above stays mounted so its hooks are stable. */
function DesignerDialogFrame() {
  const { open, enabled, isMobile, close } = useDesigner()
  if (!open || !enabled) return null

  return createPortal(
    <div className="modal-overlay" onClick={close}>
      <div
        className="panel glb-designer"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100dvh',
          maxWidth: 'none',
          maxHeight: 'none',
          borderRadius: 0,
        }}
      >
        <div className="panel-head">
          <div className="panel-title">3D asset designer</div>
          <button type="button" className="icon-btn" aria-label="Close designer" onClick={close}>
            <Icon.Close width={16} height={16} />
          </button>
        </div>
        <hr className="hr" />
        {/* On mobile the side-by-side layout collapses the preview to a sliver and
            overflows the controls — stack vertically (preview on top) instead. */}
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 'var(--s-3)',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Live preview */}
          <div
            style={{
              flex: isMobile ? '0 0 38vh' : '1 1 60%',
              minWidth: 0,
              minHeight: 0,
              borderRadius: 'var(--r-2)',
              overflow: 'hidden',
              background: 'var(--scene-b)',
              position: 'relative',
            }}
          >
            <DesignerViewport />
          </div>

          {/* Controls */}
          <div
            className="panel-body"
            style={{
              flex: isMobile ? '1 1 auto' : '1 1 40%',
              minWidth: 0,
              width: isMobile ? '100%' : undefined,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            <SourcePanel />
            <DesignerToolbar />
            <TemplatesPanel />
            <ComponentsPanel />
            <LayersPanel />
            <ArrangePanel />
            <PartInspector />
            <GroupInspector />
            <CombinePanel />
            <MakeConfigurablePanel />
            <SavePanel />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
