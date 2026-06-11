import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { projectAllElevations, type WallElevation } from '../elevation/projectElevation'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureDef, FurnitureType } from '../furniture/types'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { estimateRoomLux, type LuxStatus } from '../lighting2d/roomLux'
import { useStore } from '../state/store'
import { type ElevationPalette, elevationCaption, elevationSvg } from './elevation/elevationSvg'
import { type LightingPalette, lightingPlanSvg } from './lighting2d/lightingPlanSvg'
import { Icon } from './toolbar/icons'

/** Theme-token palette — resolves against the document, so drawings follow the
 *  active light/dark theme like the rest of the UI. */
const PALETTE: ElevationPalette = {
  bg: 'var(--surface-3)',
  stroke: 'var(--text-2)',
  opening: 'var(--accent)',
  item: 'var(--accent-soft)',
  text: 'var(--text)',
}
const LIGHTING_PALETTE: LightingPalette = {
  wall: 'var(--text-3)',
  ink: 'var(--text)',
  coverage: 'var(--accent)',
}

type DrawingMode = 'elevations' | 'lighting'

/** Status → `.badge` variant + label for the per-room lux check. */
const LUX_BADGE: Record<LuxStatus, { cls: string; label: string }> = {
  ok: { cls: 'ok', label: 'OK' },
  low: { cls: 'warn', label: 'Low' },
  high: { cls: 'warn', label: 'High' },
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
  const [mode, setMode] = useState<DrawingMode>('elevations')

  const merged = useMemo(
    () =>
      open ? (buildMergedCatalog(catalogInputs) as Record<FurnitureType, FurnitureDef>) : null,
    [open, catalogInputs],
  )
  const elevations = useMemo<WallElevation[]>(() => {
    if (!merged) return []
    // Only walls with some height — skip degenerate/zero-length segments.
    return projectAllElevations(plan, items, merged).filter((e) => e.length > 0 && e.height > 0)
  }, [merged, plan, items])
  const lighting = useMemo(
    () => (merged ? buildLightingPlan(items, merged) : { lights: [], schedule: [] }),
    [merged, items],
  )
  // Per-room lumen-method estimate vs the recommended residential bands.
  const roomLux = useMemo(() => estimateRoomLux(plan, lighting.lights), [plan, lighting])

  if (!open) return null

  const current = elevations[Math.min(sel, Math.max(0, elevations.length - 1))]
  const svg = current
    ? elevationSvg(current, { palette: PALETTE, units }).replace('<svg ', '<svg width="100%" ')
    : ''
  const lightSvg = lighting.lights.length
    ? lightingPlanSvg(plan, lighting.lights, { palette: LIGHTING_PALETTE }).replace(
        '<svg ',
        '<svg width="100%" ',
      )
    : ''

  return (
    <aside className="panel mini aux" id="elevationPanel" style={{ width: 380 }}>
      <div className="panel-head">
        <div>
          <div className="panel-title">Drawings</div>
          <div className="panel-sub">
            {mode === 'elevations' ? 'Side-on views per wall' : 'Fixtures + coverage'}
          </div>
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
        {/* Mode toggle: wall elevations vs lighting plan. */}
        <div
          className="seg accent"
          style={{ display: 'flex', width: '100%', marginBottom: 'var(--s-2)' }}
        >
          {(['elevations', 'lighting'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'on' : ''}
              onClick={() => setMode(m)}
              style={{ flex: 1, textTransform: 'capitalize' }}
            >
              {m === 'elevations' ? 'Elevations' : 'Lighting'}
            </button>
          ))}
        </div>

        {mode === 'elevations' ? (
          elevations.length === 0 ? (
            <div
              style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', padding: 'var(--s-3) 0' }}
            >
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
          )
        ) : lighting.lights.length === 0 ? (
          <div style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', padding: 'var(--s-3) 0' }}>
            No light fixtures placed yet.
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 'var(--t-xs)',
                color: 'var(--text-2)',
                margin: '0 0 var(--s-2)',
              }}
            >
              {lighting.lights.length} fixture{lighting.lights.length > 1 ? 's' : ''} ·{' '}
              {lighting.schedule.length} type{lighting.schedule.length > 1 ? 's' : ''}
            </div>
            <div
              style={{
                width: '100%',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-2)',
                padding: 'var(--s-2)',
              }}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG is built by lightingPlanSvg from numeric data + fixed palette (no user HTML).
              dangerouslySetInnerHTML={{ __html: lightSvg }}
            />
            {/* Per-room lux estimate vs recommended residential levels (LP5). */}
            {roomLux.length > 0 && (
              <div style={{ marginTop: 'var(--s-3)' }}>
                <div
                  style={{
                    fontSize: 'var(--t-xs)',
                    fontWeight: 600,
                    color: 'var(--text-2)',
                    marginBottom: 'var(--s-1)',
                  }}
                >
                  Estimated light levels
                </div>
                {roomLux.map((r) => (
                  <div
                    key={r.roomId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--s-2)',
                      fontSize: 'var(--t-xs)',
                      padding: '3px 0',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.roomName}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(r.lux)} lx
                    </span>
                    <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                      rec {r.recommended.min}–{r.recommended.max}
                    </span>
                    <span className={`badge ${LUX_BADGE[r.status].cls}`}>
                      {LUX_BADGE[r.status].label}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    fontSize: 'var(--t-2xs)',
                    color: 'var(--text-3)',
                    marginTop: 'var(--s-1)',
                  }}
                >
                  Lumen-method estimate (utilisation 0.45) vs residential guidance.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
