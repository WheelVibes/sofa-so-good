import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { projectAllElevations, type WallElevation } from '../elevation/projectElevation'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureDef, FurnitureType } from '../furniture/types'
import { useStore } from '../state/store'
import { type ElevationPalette, elevationCaption, elevationSvg } from './elevation/elevationSvg'
import { Icon } from './toolbar/icons'

/** Theme-token palette — resolves against the document, so elevations follow the
 *  active light/dark theme like the rest of the UI. */
const PALETTE: ElevationPalette = {
  bg: 'var(--surface-3)',
  stroke: 'var(--text-2)',
  opening: 'var(--accent)',
  item: 'var(--accent-soft)',
  text: 'var(--text)',
}

/** Wall elevations: a flat "side-on" drawing per wall (openings + furniture
 *  silhouettes) — the vertical counterpart to the floor plan, for cabinet/
 *  fixture heights + client/installer hand-off. Built on the pure
 *  `projectAllElevations` + `elevationSvg`. */
export function ElevationPanel() {
  const open = useStore((s) => s.elevationsOpen)
  const setOpen = useStore((s) => s.setElevationsOpen)
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)
  const catalogInputs = useStore(
    useShallow((s) => ({
      userFurniture: s.userFurniture,
      resolvedRemoteFurniture: s.resolvedRemoteFurniture,
      packFurniture: s.packFurniture,
    })),
  )
  const [sel, setSel] = useState(0)

  const elevations = useMemo<WallElevation[]>(() => {
    if (!open) return []
    const merged = buildMergedCatalog(catalogInputs) as Record<FurnitureType, FurnitureDef>
    // Only walls with some height — skip degenerate/zero-length segments.
    return projectAllElevations(plan, items, merged).filter((e) => e.length > 0 && e.height > 0)
  }, [open, plan, items, catalogInputs])

  if (!open) return null

  const current = elevations[Math.min(sel, Math.max(0, elevations.length - 1))]
  const svg = current
    ? elevationSvg(current, { palette: PALETTE, units }).replace('<svg ', '<svg width="100%" ')
    : ''

  return (
    <aside className="panel mini aux" id="elevationPanel" style={{ width: 380 }}>
      <div className="panel-head">
        <div>
          <div className="panel-title">Wall elevations</div>
          <div className="panel-sub">Side-on views per wall</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close"
          onClick={() => setOpen(false)}
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <hr className="hr" />
      <div className="panel-body">
        {elevations.length === 0 ? (
          <div style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', padding: 'var(--s-3) 0' }}>
            No walls to draw yet.
          </div>
        ) : (
          <>
            {/* Wall picker */}
            <div className="seg" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {elevations.map((e, i) => (
                <button
                  key={e.wallId}
                  type="button"
                  className={i === sel ? 'on' : ''}
                  onClick={() => setSel(i)}
                  style={{ flex: '0 0 auto' }}
                >
                  Wall {i + 1}
                </button>
              ))}
            </div>
            {current ? (
              <>
                <div
                  style={{
                    fontSize: 'var(--t-xs)',
                    color: 'var(--text-2)',
                    margin: 'var(--s-3) 0 var(--s-2)',
                  }}
                >
                  {elevationCaption(current, sel, units)}
                </div>
                {/* The SVG scales to the panel width via its viewBox. */}
                <div
                  className="elev-canvas"
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-2)',
                    padding: 'var(--s-2)',
                  }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG is built by elevationSvg with all user text HTML-escaped.
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}
