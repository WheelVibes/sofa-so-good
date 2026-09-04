import { resolveDeliveryRoute, SG_DEFAULT_ROUTE } from '../analysis/deliveryAccess'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'

/** Metres -> whole millimetres, the unit a tape reads and the drawings print. */
const toMm = (m: number) => Math.round(m * 1000)

/**
 * One measured dimension of one delivery-route aperture.
 *
 * Follows the `SiteMeasuredField` PATTERN (v0.31.5.372) rather than reusing the
 * component: that one is bound to `plan.siteMeasurements` keyed by
 * (kind, targetId) in mm against a model dimension, and a route aperture is
 * none of those things — it has no model value to deviate from, only a published
 * typical. Same grammar though: a numeric mm input whose PLACEHOLDER is the
 * figure in force, so an empty field always reads as "using the typical".
 */
function RouteDimField({
  id,
  dim,
  label,
  apertureLabel,
  typicalM,
}: {
  id: string
  dim: 'widthM' | 'heightM'
  label: string
  /** The aperture this dimension belongs to, so the accessible name is unique —
   *  three "Width" fields with the same name are unusable on a screen reader,
   *  which is exactly what the first cut shipped and the test caught. */
  apertureLabel: string
  typicalM: number
}) {
  const measured = useStore((s) => s.floorPlan.deliveryRoute?.[id]?.[dim])
  const setDim = useStore((s) => s.setDeliveryRouteDim)

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)', flex: 1 }}>
      <span style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>{label}</span>
      <input
        className="input tabular-nums"
        type="number"
        inputMode="numeric"
        min={1}
        step={10}
        aria-label={`${apertureLabel} ${label.toLowerCase()} measured on site, millimetres`}
        value={measured === undefined ? '' : toMm(measured)}
        placeholder={`${toMm(typicalM)} typical`}
        onChange={(e) => {
          const raw = e.target.value.trim()
          if (raw === '') {
            setDim(id, dim, undefined)
            return
          }
          const mm = Number(raw)
          // Non-positive input is dropped rather than stored: a 0 would block
          // every piece in the catalogue and read as a catalogue-wide fault.
          if (!Number.isFinite(mm) || mm <= 0) return
          setDim(id, dim, mm / 1000)
        }}
      />
    </label>
  )
}

/**
 * DELIVERY-ROUTE-OVERRIDE (v0.31.9.0) — let the user replace the published
 * Singapore typicals with their block's real figures.
 *
 * `ACCESS_SCOPE_NOTE` has told people to "measure your actual lift, corridor
 * turn and doorways and adjust these before ordering" since v0.31.5.374, and
 * until now the app had nowhere to put the answer — the copy asked for an action
 * it could not accept. The sources are emphatic that this matters: HDB lift and
 * corridor sizes vary by block and "even a difference of 5 to 10 centimetres"
 * decides whether a large piece fits.
 *
 * Lives in the Accessibility panel rather than a 16th aux panel: "can a
 * wheelchair turn in here" and "can the sofa get through the lift door" are the
 * same question about the same home, and the panel is already pro-gated and
 * open-state managed.
 *
 * The CORRIDOR TURN is deliberately absent. A turn is not a rectangular
 * aperture, so it cannot be modelled as an `AccessConstraint`, and inventing a
 * field the check ignores would be worse than the note that names it.
 */
export function DeliveryRouteFields() {
  const enabled = useFeature('deliveryRouteMeasure')
  const overrides = useStore((s) => s.floorPlan.deliveryRoute)
  const clearRoute = useStore((s) => s.clearDeliveryRoute)
  if (!enabled) return null

  const resolved = resolveDeliveryRoute(overrides)
  const isMeasured = resolved !== SG_DEFAULT_ROUTE

  return (
    <div style={{ marginTop: 'var(--s-4)' }}>
      <div className="sec-h">Delivery route</div>
      <div className="ci-detail" style={{ marginBottom: 'var(--s-2)' }}>
        Published Singapore typicals until you measure. A 5–10 cm difference decides whether a large
        piece fits, so measure your own lift and doors before ordering.
      </div>
      {SG_DEFAULT_ROUTE.map((c) => (
        <div key={c.id} style={{ marginBottom: 'var(--s-3)' }}>
          <div className="ci-title">{c.label}</div>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <RouteDimField
              id={c.id}
              dim="widthM"
              label="Width"
              apertureLabel={c.label}
              typicalM={c.widthM}
            />
            {Number.isFinite(c.heightM) && (
              <RouteDimField
                id={c.id}
                dim="heightM"
                label="Height"
                apertureLabel={c.label}
                typicalM={c.heightM}
              />
            )}
          </div>
        </div>
      ))}
      <div className="ci-detail">
        The corridor turn from the lift lobby is not checked — a turn is not a rectangular aperture.
        Measure it yourself before ordering anything over 1.5 m.
      </div>
      {isMeasured && (
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: 'var(--s-2)' }}
          onClick={() => clearRoute()}
        >
          Reset to typicals
        </button>
      )}
    </div>
  )
}
