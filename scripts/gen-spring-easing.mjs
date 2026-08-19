#!/usr/bin/env node
/**
 * Spring → CSS `linear()` easing generator (UIUX-31, the motion.dev technique):
 * samples a damped harmonic oscillator and emits a `linear(...)` string whose
 * shape carries the spring (including overshoot), so plain CSS transitions and
 * animations get real spring feel with zero runtime dependency. Run when tuning:
 *
 *   node scripts/gen-spring-easing.mjs
 *
 * and paste the output into the `@supports` block in src/styles/tokens.css.
 * The paired duration MUST be used with the easing — the settle is baked into
 * the curve's timeline, so a different duration changes the physics feel.
 */

/** Sample x(t) of an underdamped spring normalised to end at 1. */
function spring({ zeta, omega, durationMs, steps = 36 }) {
  const wd = omega * Math.sqrt(1 - zeta * zeta)
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (durationMs / 1000)
    const x =
      1 -
      Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t))
    pts.push(i === steps ? 1 : Math.round(x * 1000) / 1000)
  }
  return `linear(${pts.join(', ')})`
}

const SPRINGS = {
  // Snappy: minimal overshoot — sliding pills, position/width moves.
  'spring-snappy': { zeta: 0.82, omega: 20, durationMs: 400 },
  // Pop: a visible single bounce — confirmation ticks, icon lands.
  'spring-pop': { zeta: 0.58, omega: 18, durationMs: 500 },
}

for (const [name, cfg] of Object.entries(SPRINGS)) {
  console.log(`  --dur-${name}: ${cfg.durationMs}ms;`)
  console.log(`  --ease-${name}: ${spring(cfg)};`)
}
