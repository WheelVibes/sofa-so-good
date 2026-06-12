import { LUX_STOPS } from '../../lighting2d/luxColor'

/**
 * Colour→lux legend for the 3D floor heatmap (LP5 tail) — shown under the
 * overlay toggle in the Drawings panel's Lighting tab. The gradient swatch is
 * data visualisation (the literal heatmap colours from `LUX_STOPS`); all
 * chrome (text, borders) uses theme tokens.
 */
export function LuxLegend() {
  const gradient = `linear-gradient(to right, ${LUX_STOPS.map(
    (s, i) => `rgb(${s.color.join(',')}) ${(i / (LUX_STOPS.length - 1)) * 100}%`,
  ).join(', ')})`
  return (
    <div role="img" aria-label="Lux heatmap legend">
      <div
        style={{
          height: 10,
          borderRadius: 'var(--r-1)',
          border: '1px solid var(--border)',
          background: gradient,
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
        }}
      >
        {LUX_STOPS.map((s, i) => (
          <span key={s.lux} title={s.label}>
            {i === LUX_STOPS.length - 1 ? `${s.lux}+` : s.lux}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
        lux on the floor — dim → living → task → bright
      </div>
    </div>
  )
}
