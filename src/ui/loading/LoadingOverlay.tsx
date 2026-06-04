import { FADE_MS, useOverlayLifecycle } from './useOverlayLifecycle'

/**
 * Full-viewport loading overlay: a soft warm gradient backdrop with a
 * hand-built SVG line-art room that furnishes itself on a loop (walls draw
 * in, then sofa → table → lamp → plant pop in, then repeat). Used for the
 * initial boot and for masking orbit↔walk / per-room-editor transitions.
 *
 * `active` drives a min-time + fade lifecycle (see useOverlayLifecycle) so it
 * never flickers on fast loads. Respects `prefers-reduced-motion`.
 */
export function LoadingOverlay({ active, label }: { active: boolean; label: string }) {
  const { mounted, fading } = useOverlayLifecycle(active)
  if (!mounted) return null

  return (
    <div
      aria-live="polite"
      aria-busy={active}
      role="status"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.75rem',
        // Soft themed gradient — follows the active palette's scene colours.
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
          {label || 'Loading…'}
        </div>
      </div>
    </div>
  )
}

/** Inline SVG line-art room that draws + furnishes itself on a 4s loop. */
function FurnishingRoom() {
  const stroke = 'var(--text-2)'
  return (
    <svg
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 6px 14px rgba(120, 100, 70, 0.18))' }}
    >
      {/* Room shell — walls + floor line draw in via stroke-dashoffset. */}
      <g stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path className="hdb-draw hdb-shell" d="M20 30 H180 V140 H20 Z" />
        {/* Floor / back-wall divider for a touch of depth. */}
        <path className="hdb-draw hdb-floor" d="M20 110 H180" opacity={0.5} />
      </g>

      {/* Furniture pops in one by one, staggered, then resets with the loop. */}
      <g
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="var(--surface-3)"
      >
        {/* Sofa (left) */}
        <g className="hdb-pop hdb-pop-1">
          <rect x="30" y="96" width="46" height="20" rx="4" />
          <rect x="28" y="86" width="50" height="14" rx="4" />
        </g>
        {/* Coffee table (centre) */}
        <g className="hdb-pop hdb-pop-2">
          <rect x="92" y="116" width="34" height="9" rx="2" />
          <path d="M96 125 V132 M122 125 V132" fill="none" />
        </g>
        {/* Floor lamp (right) */}
        <g className="hdb-pop hdb-pop-3" fill="none">
          <path d="M156 132 V70" />
          <path d="M148 70 H164 L160 56 H152 Z" fill="var(--accent-soft)" />
        </g>
        {/* Potted plant (between the coffee table and the floor lamp) */}
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

/* One module-level stylesheet; keyframes Tailwind can't express. The room
 * outline draws in, then each piece scales/fades up on a stagger, and the
 * whole cycle repeats every 4s. prefers-reduced-motion shows it fully drawn,
 * static, with only a gentle pulse. */
const KEYFRAMES = `
@keyframes hdb-draw-in { to { stroke-dashoffset: 0; } }
@keyframes hdb-pop-in {
  0%, 8%   { opacity: 0; transform: translateY(6px) scale(0.92); }
  18%, 86% { opacity: 1; transform: translateY(0) scale(1); }
  100%     { opacity: 0; transform: translateY(6px) scale(0.92); }
}
@keyframes hdb-shell-cycle {
  0%   { stroke-dashoffset: var(--len); }
  14%  { stroke-dashoffset: 0; }
  86%  { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: var(--len); }
}
.hdb-draw { animation: hdb-shell-cycle 4s ease-in-out infinite; }
.hdb-shell { --len: 540; stroke-dasharray: var(--len); stroke-dashoffset: var(--len); }
.hdb-floor { --len: 160; stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation-delay: 0.15s; }
.hdb-pop { transform-box: fill-box; transform-origin: center; animation: hdb-pop-in 4s ease-in-out infinite; }
.hdb-pop-1 { animation-delay: 0.6s; }
.hdb-pop-2 { animation-delay: 0.9s; }
.hdb-pop-3 { animation-delay: 1.2s; }
.hdb-pop-4 { animation-delay: 1.5s; }
@media (prefers-reduced-motion: reduce) {
  .hdb-draw { animation: none; stroke-dashoffset: 0; }
  .hdb-pop { animation: hdb-rm-pulse 2.2s ease-in-out infinite; opacity: 1; }
  @keyframes hdb-rm-pulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
}
`
