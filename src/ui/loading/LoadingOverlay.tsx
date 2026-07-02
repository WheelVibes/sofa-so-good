import { memo } from 'react'
import { createPortal } from 'react-dom'
import { CyclingPhrase } from './CyclingPhrase'
import { FADE_MS, useOverlayLifecycle } from './useOverlayLifecycle'

/**
 * Full-viewport loading overlay: a soft warm gradient backdrop with a
 * hand-built SVG line-art room that furnishes itself on a loop. Used for
 * orbit↔walk and room/floor-plan transitions (initial boot uses the static
 * `#boot-loader` in index.html instead).
 *
 * Portaled to `document.body` so heavy WebGL work behind it is isolated in the
 * DOM tree. `active` drives a min-time + fade lifecycle (see useOverlayLifecycle).
 */
export const LoadingOverlay = memo(function LoadingOverlay({
  active,
  label,
}: {
  active: boolean
  label: string
}) {
  const { mounted, fading } = useOverlayLifecycle(active)
  if (!mounted) return null

  return createPortal(
    <div
      aria-live="polite"
      aria-busy={active}
      role="status"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.75rem',
        background: 'radial-gradient(120% 90% at 50% 30%, var(--scene-a), var(--scene-b) 75%)',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <style>{KEYFRAMES}</style>
      <FurnishingRoom />
      <div style={{ textAlign: 'center', lineHeight: 1.5 }}>
        <div
          style={{
            fontSize: '1.35rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
          }}
        >
          Sofa So Good
        </div>
        <div style={{ marginTop: '0.35rem', fontSize: '0.95rem', color: 'var(--text-3)' }}>
          {label ? (
            label
          ) : (
            <CyclingPhrase active={active && !fading} style={{ color: 'inherit' }} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
})

/** Inline SVG line-art room that draws + furnishes itself on a 4s loop. */
function FurnishingRoom() {
  const stroke = 'var(--text-2)'
  return (
    <svg
      className="hdb-room"
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      aria-hidden="true"
    >
      <g stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path className="hdb-draw hdb-shell" d="M20 30 H180 V140 H20 Z" />
        <path className="hdb-draw hdb-floor" d="M20 110 H180" opacity={0.5} />
      </g>
      <g
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="var(--surface-3)"
      >
        <g className="hdb-pop hdb-pop-1">
          <rect x="30" y="96" width="46" height="20" rx="4" />
          <rect x="28" y="86" width="50" height="14" rx="4" />
        </g>
        <g className="hdb-pop hdb-pop-2">
          <rect x="92" y="116" width="34" height="9" rx="2" />
          <path d="M96 125 V132 M122 125 V132" fill="none" />
        </g>
        <g className="hdb-pop hdb-pop-3" fill="none">
          <path d="M156 132 V70" />
          <path d="M148 70 H164 L160 56 H152 Z" fill="var(--accent-soft)" />
        </g>
        <g className="hdb-pop hdb-pop-4">
          <path d="M127 96 h16 l-2 14 h-12 z" />
          <path
            d="M135 96 C129 84 127 78 131 70 M135 96 C141 84 143 80 139 72 M135 96 V80"
            fill="none"
          />
        </g>
      </g>
    </svg>
  )
}

const KEYFRAMES = `
@keyframes hdb-pop-in {
  0%, 8%   { opacity: 0; transform: translateY(6px) scale(0.92); }
  18%, 86% { opacity: 1; transform: translateY(0) scale(1); }
  100%     { opacity: 0; transform: translateY(6px) scale(0.92); }
}
@keyframes hdb-fade-cycle {
  0%   { opacity: 0; transform: scale(0.97); }
  14%  { opacity: 1; transform: scale(1); }
  86%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.97); }
}
@keyframes hdb-bob {
  0%, 100% { transform: translateY(-5px); }
  50%      { transform: translateY(5px); }
}
.hdb-room { will-change: transform; animation: hdb-bob 3.6s ease-in-out infinite; }
.hdb-draw, .hdb-pop {
  transform-box: fill-box;
  transform-origin: center;
  will-change: opacity, transform;
}
.hdb-draw { animation: hdb-fade-cycle 4s ease-in-out infinite; }
.hdb-floor { animation-delay: 0.15s; }
.hdb-pop { animation: hdb-pop-in 4s ease-in-out infinite; }
.hdb-pop-1 { animation-delay: 0.6s; }
.hdb-pop-2 { animation-delay: 0.9s; }
.hdb-pop-3 { animation-delay: 1.2s; }
.hdb-pop-4 { animation-delay: 1.5s; }
@media (prefers-reduced-motion: reduce) {
  .hdb-room { animation: none; transform: none; }
  .hdb-draw { animation: none; opacity: 1; transform: none; }
  .hdb-pop { animation: hdb-rm-pulse 2.2s ease-in-out infinite; opacity: 1; }
  @keyframes hdb-rm-pulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
}
`
