import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { projectAllElevations, type WallElevation } from '../elevation/projectElevation'
import { isMultiLevel, itemsOnLevel, levelAsPlan, planLevels } from '../floorplan/levels'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureDef, FurnitureType } from '../furniture/types'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { estimateRoomLux, type LuxStatus } from '../lighting2d/roomLux'
import { useEffectiveHour } from '../scene/lighting/useEffectiveHour'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { type ElevationPalette, elevationCaption, elevationSvg } from './elevation/elevationSvg'
import { LuxLegend } from './lighting2d/LuxLegend'
import { type LightingPalette, lightingPlanSvg } from './lighting2d/lightingPlanSvg'

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

/** Format fractional hour → "10:30 AM" for the time display. */
function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const totalMinutes = Math.round(h * 60) % (24 * 60)
  const hh = Math.floor(totalMinutes / 60)
  const mm = totalMinutes % 60
  const period = hh < 12 ? 'AM' : 'PM'
  const display = hh % 12 === 0 ? 12 : hh % 12
  return `${display}:${String(mm).padStart(2, '0')} ${period}`
}

/** Wall elevations + lighting plan drawings panel (Drawings tab in the toolbar).
 *
 *  LP6 enhancements on the Lighting tab:
 *  - **Time-of-day scrub**: compact range slider that drives the existing
 *    `manualHour` store state (same slider as SceneMenu), so the 3D heatmap
 *    updates live as the user scrubs. A "▶ Play" button auto-advances the
 *    overlay across the day at 1 hr/s. Works on desktop and mobile.
 *  - **Per-fixture exclusion**: checkbox list of placed light fixtures; unchecking
 *    one hides it from the heatmap computation so the user can see each
 *    fixture's contribution in isolation. Cleared when the overlay is toggled off.
 */
export function ElevationPanel() {
  const open = useStore((s) => s.elevationsOpen)
  const setOpen = useStore((s) => s.setElevationsOpen)
  const luxOverlayOn = useStore((s) => s.luxOverlayOn)
  const setLuxOverlayOn = useStore((s) => s.setLuxOverlayOn)
  const luxExcludedIds = useStore(useShallow((s) => s.luxExcludedIds))
  const toggleLuxExcluded = useStore((s) => s.toggleLuxExcluded)
  const luxPlaying = useStore((s) => s.luxPlaying)
  const setLuxPlaying = useStore((s) => s.setLuxPlaying)
  const setManualHour = useStore((s) => s.setManualHour)
  const effectiveHour = useEffectiveHour()

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
  // Lighting diagrams: one per storey on multi-level plans (fixtures filtered
  // to their storey — F13), a single whole-plan diagram otherwise.
  const lightFigures: { key: string; caption: string | null; svg: string }[] =
    lighting.lights.length === 0
      ? []
      : (isMultiLevel(plan) ? planLevels(plan) : [null]).flatMap((level) => {
          const lights = level ? itemsOnLevel(lighting.lights, level.id) : lighting.lights
          if (lights.length === 0) return []
          const figSvg = lightingPlanSvg(level ? levelAsPlan(plan, level) : plan, lights, {
            palette: LIGHTING_PALETTE,
          }).replace('<svg ', '<svg width="100%" ')
          return [{ key: level?.id ?? 'plan', caption: level ? level.name : null, svg: figSvg }]
        })

  return (
    <aside className="panel mini aux" id="elevationPanel" style={{ width: 380 }}>
      <AuxPanelHead
        title="Drawings"
        sub={mode === 'elevations' ? 'Side-on views per wall' : 'Fixtures + coverage'}
        docs="drawings"
        onClose={() => setOpen(false)}
      />
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
              <div className="seg" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-1)' }}>
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
        ) : (
          <>
            {/* ── 3D lux heatmap toggle (LP5 tail / LP6) ──────────────────── */}
            <div style={{ margin: '0 0 var(--s-2)' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-2)',
                  fontSize: 'var(--t-xs)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={luxOverlayOn}
                  onChange={(e) => setLuxOverlayOn(e.target.checked)}
                />
                <span style={{ flex: 1 }}>Show light levels on the floor (3D)</span>
              </label>

              {luxOverlayOn && (
                <>
                  {/* LP6 — time-of-day scrub + play button.
                      Reuses the existing manualHour / setManualHour store state
                      (same source as the Scene → Time-of-day slider), so this
                      control and the Scene slider are in sync. */}
                  <div
                    style={{
                      marginTop: 'var(--s-2)',
                      padding: 'var(--s-2)',
                      background: 'var(--surface-2)',
                      borderRadius: 'var(--r-2)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--s-2)',
                        marginBottom: 'var(--s-1)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 'var(--t-2xs)',
                          color: 'var(--text-3)',
                          flex: 1,
                        }}
                      >
                        Time of day
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 'var(--t-2xs)',
                          color: 'var(--text-2)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatClock(effectiveHour)}
                      </span>
                      {/* Play/stop button — auto-advances manualHour at 1 hr/s. */}
                      <button
                        type="button"
                        className={`icon-btn${luxPlaying ? ' active' : ''}`}
                        aria-label={luxPlaying ? 'Stop playback' : 'Play across the day'}
                        title={luxPlaying ? 'Stop' : 'Play across the day'}
                        onClick={() => setLuxPlaying(!luxPlaying)}
                        style={{ padding: 'var(--s-1) var(--s-2)', fontSize: 'var(--t-2xs)' }}
                      >
                        {luxPlaying ? '⏹' : '▶'}
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={0.25}
                      value={effectiveHour}
                      aria-label="Time of day for lux overlay"
                      onChange={(e) => {
                        if (luxPlaying) setLuxPlaying(false)
                        setManualHour(Number(e.target.value))
                      }}
                      className="slider"
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* LP6 — per-fixture exclusion.
                      Shown only when fixtures are present. Each row toggles the
                      fixture's contribution out of the heatmap so the user can
                      isolate what each light adds. */}
                  {lighting.lights.length > 0 && (
                    <div
                      style={{
                        marginTop: 'var(--s-2)',
                        padding: 'var(--s-2)',
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--r-2)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--t-2xs)',
                          color: 'var(--text-3)',
                          marginBottom: 'var(--s-1)',
                        }}
                      >
                        Fixture contributions — uncheck to isolate
                      </div>
                      {lighting.lights.map((light) => {
                        const excluded = luxExcludedIds.includes(light.id)
                        return (
                          <label
                            key={light.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--s-2)',
                              fontSize: 'var(--t-2xs)',
                              cursor: 'pointer',
                              padding: 'var(--s-1) 0',
                              color: excluded ? 'var(--text-3)' : 'var(--text)',
                              textDecoration: excluded ? 'line-through' : 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={() => toggleLuxExcluded(light.id)}
                            />
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {light.label}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 'var(--s-1)' }}>
                    <LuxLegend />
                  </div>
                </>
              )}
            </div>

            {/* Fixture count summary */}
            {lighting.lights.length === 0 ? (
              <div
                style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', padding: 'var(--s-3) 0' }}
              >
                No light fixtures placed yet.
              </div>
            ) : (
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
            )}
            {lightFigures.map((fig) => (
              <div key={fig.key} style={{ marginBottom: 'var(--s-2)' }}>
                {fig.caption ? (
                  <div
                    style={{
                      fontSize: 'var(--t-xs)',
                      color: 'var(--text-2)',
                      marginBottom: 'var(--s-1)',
                    }}
                  >
                    {fig.caption}
                  </div>
                ) : null}
                <div
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-2)',
                    padding: 'var(--s-2)',
                  }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG is built by lightingPlanSvg from numeric data + fixed palette (no user HTML).
                  dangerouslySetInnerHTML={{ __html: fig.svg }}
                />
              </div>
            ))}
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
                      padding: 'var(--s-1) 0',
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
