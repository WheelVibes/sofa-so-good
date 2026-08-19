/**
 * Consolidated CSS regression guards.
 *
 * These were previously ~16 separate one-file-per-feature test files
 * (ambientFx, confirmAnim, density, focusRing, hoverReveal, liftable,
 * lineHeight, motionTokens, panelSlide, panelWidth, rowPadding,
 * screenTransition, skeleton, stagger, stickyHeaders, tabularNums), each
 * paying its own file/environment overhead just to read a CSS file and
 * assert a regex. Merged into one file — every `describe` block and every
 * assertion below is preserved verbatim (same describe names, same regexes)
 * so a failure is still immediately identifiable by feature.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')

const flows = read('./flows.css')
const parts = read('./parts.css')

describe('ambient-fx CSS (P7)', () => {
  it('defines a beamTravel keyframe animating offset-distance', () => {
    expect(flows).toMatch(/@keyframes\s+beamTravel/)
    const kf = flows.slice(flows.indexOf('@keyframes beamTravel'))
    expect(kf).toContain('offset-distance')
  })

  it('drives the beam along an offset-path with a color-mix(in oklch, var(--accent) …) dash', () => {
    const beam = flows.slice(flows.indexOf('.beam'))
    expect(beam).toContain('offset-path')
    expect(beam).toMatch(/color-mix\(in oklch, var\(--accent\)/)
  })

  it('fills the beam animation backwards, never both', () => {
    const beam = flows.slice(flows.indexOf('.beam'), flows.indexOf('.beam') + 600)
    expect(beam).toMatch(/backwards/)
    expect(beam).not.toMatch(/\bboth\b/)
  })

  it('has a .paused rule that pauses the animation (IntersectionObserver hook)', () => {
    expect(flows).toMatch(/\.beam\.paused[^}]*animation-play-state:\s*paused/)
  })

  it('gives .cat-card (parts) a var(--mx radial-gradient in oklch accent', () => {
    const card = parts.slice(parts.indexOf('.cat-card'))
    expect(card).toMatch(/radial-gradient\([^)]*var\(--mx/)
    expect(card).toMatch(/color-mix\(in oklch, var\(--accent\)/)
  })

  it('paints the card glow ONLY when armed — accent share defaults to 0% (dormant-invisible)', () => {
    // The gradient must be invisible whenever the ambient-fx gate is off: the
    // accent share reads var(--glow-a, 0%), raised on hover only under the
    // grid's .fx class (set by CatalogDrawer when useAmbientFx() is true).
    // A hardcoded share painted a permanent brown bloom on every card in the
    // default Performance tier (user report, 2026-07-03).
    const card = parts.slice(parts.indexOf('.cat-card'))
    expect(card).toMatch(/color-mix\(in oklch, var\(--accent\) var\(--glow-a, 0%\)/)
    expect(parts).toMatch(/\.fx [^{]*:hover[^}]*--glow-a:\s*12%/)
  })

  it('uses no raw hex/rgb colour literals in the beam rule', () => {
    const beam = flows.slice(flows.indexOf('.beam'), flows.indexOf('.beam') + 600)
    expect(beam).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(beam).not.toMatch(/\brgba?\(/)
  })
})

describe('P5 success/confirm micro-animations', () => {
  it('pops the success toast checkmark via a scale keyframe', () => {
    const f = read('./features.css')
    expect(f).toMatch(/@keyframes checkPop/)
    expect(f).toMatch(/\.toast .icn\.pop\s*\{[^}]*animation:\s*checkPop/s)
  })
  it('gives EditConfirmBar a slide-down leave and a shake reject (translateX preserved)', () => {
    const p = read('./parts.css')
    expect(p).toMatch(/@keyframes editConfirmLeave/)
    expect(p).toMatch(/@keyframes editConfirmShake/)
    expect(p).toMatch(/editConfirmLeave\s*\{[^}]*translateX\(-50%\)/s)
  })
})

describe('density tokens (P38)', () => {
  const tokens = read('./tokens.css')
  const components = read('./components.css')

  it('the token root defines --row-pad-y and --row-pad-x', () => {
    expect(tokens).toMatch(/:root\s*{[^}]*--row-pad-y:\s*[^;]+;/s)
    expect(tokens).toMatch(/:root\s*{[^}]*--row-pad-x:\s*[^;]+;/s)
  })

  it('.menu-item consumes var(--row-pad-y) (and --row-pad-x)', () => {
    const rule = components.match(/\.menu-item\s*{[^}]*}/s)?.[0] ?? ''
    expect(rule).toMatch(/padding:\s*var\(--row-pad-y\)\s+var\(--row-pad-x\)/)
  })

  it('a [data-density="compact"] block overrides --row-pad-y', () => {
    const compactBlock = tokens.match(/\[data-density=['"]compact['"]\]\s*{[^}]*}/s)?.[0] ?? ''
    expect(compactBlock).toMatch(/--row-pad-y:\s*[^;]+;/)
  })

  it('has no colour literal (hex/rgb/oklch/named) in the compact override block', () => {
    const compactBlock = tokens.match(/\[data-density=['"]compact['"]\]\s*{[^}]*}/s)?.[0] ?? ''
    expect(compactBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(compactBlock).not.toMatch(/\brgb\(|\brgba\(|\boklch\(/)
  })
})

describe('P14 unified focus ring', () => {
  it('defines --focus-ring in tokens.css as a 3px accent color-mix', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--focus-ring-w:\s*3px/)
    expect(tokens).toMatch(/--focus-ring:[^;]*color-mix\([^;]*var\(--accent\)/)
  })
  it('applies --focus-ring via a shared :focus-visible rule over every control class', () => {
    const parts = read('./parts.css')
    const components = read('./components.css')
    const css = components + parts
    for (const sel of [
      '.btn',
      '.icon-btn',
      '.tool-btn',
      '.input',
      '.select-trigger',
      '.chip',
      '.tab',
    ]) {
      expect(css).toContain(`${sel}:focus-visible`)
    }
    expect(components).toMatch(/box-shadow:\s*var\(--focus-ring\)/)
  })
  it('hardcodes no colour literals in the new focus block', () => {
    const components = read('./components.css')
    const start = components.indexOf('--- Unified focus ring')
    const end = components.indexOf('--- end unified focus ring', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const block = components.slice(start, end)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('P13 hover-reveal row actions', () => {
  it('reveals .lyr-acts on hover, selection, and keyboard focus-within', () => {
    const f = read('./features.css')
    expect(f).toMatch(/\.lyr-row:focus-within\s+\.lyr-acts/)
    expect(f).toMatch(/\.lyr-row:hover\s+\.lyr-acts/)
  })
  it('keeps .lyr-acts always visible on touch (body.mobile)', () => {
    const r = read('./responsive.css')
    expect(r).toMatch(/\.lyr-acts\s*\{[^}]*opacity:\s*1/s)
  })
})

describe('P4 unified hover-lift', () => {
  it('defines one .liftable:hover lift using translateY(-2px) + --shadow-pop', () => {
    const c = read('./components.css')
    expect(c).toMatch(/\.liftable:hover\s*[^{]*\{[^}]*transform:\s*translateY\(-2px\)/s)
    expect(c).toMatch(/\.liftable:hover\s*[^{]*\{[^}]*box-shadow:\s*var\(--shadow-pop\)/s)
  })
  it('applies the lift to preset-card via the shared selector group', () => {
    expect(read('./components.css')).toMatch(/\.preset-card/)
  })
  it('no longer stacks a duplicate transform on the per-card hover rules', () => {
    expect(read('./parts.css')).not.toMatch(/\.cat-card:hover\s*\{[^}]*translateY/s)
    expect(read('./features.css')).not.toMatch(/\.swap-card:hover\s*\{[^}]*translateY/s)
    expect(read('./flows.css')).not.toMatch(/\.preset-card:hover\s*\{[^}]*translateY/s)
  })
})

describe('P20 line-height tokens', () => {
  it('defines --lh-tight 1.25 and --lh-body 1.5 in tokens.css', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--lh-tight:\s*1\.25/)
    expect(tokens).toMatch(/--lh-body:\s*1\.5/)
  })
  it('applies --lh-body to multiline descriptions and empty states', () => {
    const features = read('./features.css')
    const flows = read('./flows.css')
    expect(features).toMatch(/\.empty-mini span\b[^}]*line-height:\s*var\(--lh-body\)/s)
    expect(features).toMatch(/\.ci-detail\b[^}]*line-height:\s*var\(--lh-body\)/s)
    expect(flows).toMatch(/\.empty-sub\b[^}]*line-height:\s*var\(--lh-body\)/s)
    expect(flows).toMatch(/\.onb-lede\b[^}]*line-height:\s*var\(--lh-body\)/s)
  })
  it('uses --lh-body (not a hand-tuned near-value) on other multiline reading copy', () => {
    // `.preset-desc` and `.help-list li` were guarded here too until both were
    // pruned as dead CSS (see CHANGELOG v0.11.2.1) — only live selectors stay.
    const features = read('./features.css')
    const flows = read('./flows.css')
    expect(flows).toMatch(/\.ss-card-desc\b[^}]*line-height:\s*var\(--lh-body\)/s)
    expect(features).toMatch(/\.stamp-banner-text\b[^}]*line-height:\s*var\(--lh-body\)/s)
  })
})

describe('P1 motion scale tokens', () => {
  it('defines the --dur-1/-2/-3 scale (~150/300/600ms) in tokens.css', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--dur-1:\s*150ms/)
    expect(tokens).toMatch(/--dur-2:\s*300ms/)
    expect(tokens).toMatch(/--dur-3:\s*600ms/)
  })
  it('defines the easeOutExpo entrance easing token', () => {
    expect(read('./tokens.css')).toMatch(/--ease-out:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/)
  })
  it('keeps the existing --dur/--ease tokens intact', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--dur:\s*0\.16s/)
    expect(tokens).toMatch(/--ease:\s*cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\)/)
  })
})

describe('P3 desktop panel slide', () => {
  it('defines a dock-panel mount entrance using --dur-2 + --ease-out with backwards fill', () => {
    const c = read('./components.css')
    expect(c).toMatch(/@keyframes dockPanelIn\b/)
    expect(c).toMatch(
      /\.dock-panel[^{]*\{[^}]*animation:\s*dockPanelIn var\(--dur-2\) var\(--ease-out\) backwards/s,
    )
    expect(c).not.toMatch(/dockPanelIn var\(--dur-2\) var\(--ease-out\) both/)
  })
  it('eases the canvas reflow via a transition on the rail widths', () => {
    expect(read('./components.css')).toMatch(
      /\.stage-area\s*\{[^}]*transition:[^}]*(left|right)[^}]*var\(--dur-2\)/s,
    )
  })
  it('scopes the entrance to desktop (≥641px)', () => {
    expect(read('./components.css')).toMatch(/min-width:\s*641px/)
  })
})

describe('P10 panel width tokens', () => {
  it('defines --panel-w 320px, --panel-w-compact 288px and --panel-w-wide 360px', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/--panel-w:\s*320px/)
    expect(tokens).toMatch(/--panel-w-compact:\s*288px/)
    expect(tokens).toMatch(/--panel-w-wide:\s*360px/)
  })
  it('drives the floating catalog/inspector/finish widths off the panel-width tokens', () => {
    expect(read('./parts.css')).toMatch(/\.catalog\s*\{[^}]*width:\s*var\(--panel-w\)/s)
    // The inspector uses the wider token (its header + multi-field sections
    // were cramped at 320px); the right dock rail follows it in components.css.
    expect(read('./parts.css')).toMatch(/\.inspector\s*\{[^}]*width:\s*var\(--panel-w-wide\)/s)
    expect(read('./components.css')).toMatch(/--right-rail:\s*var\(--panel-w-wide\)/)
    expect(read('./flows.css')).toMatch(/\.er-finish\s*\{[^}]*width:\s*var\(--panel-w\)/s)
  })
  it('drives the tablet variants off --panel-w-compact and leaves no bare 326/312px', () => {
    const r = read('./responsive.css')
    expect(r).toMatch(/\.catalog\s*\{\s*width:\s*var\(--panel-w-compact\)/)
    expect(read('./parts.css')).not.toMatch(/\.catalog\s*\{[^}]*width:\s*326px/s)
    expect(read('./flows.css')).not.toMatch(/\.er-finish\s*\{[^}]*width:\s*312px/s)
  })
})

// P12 normalized row paddings onto the --s scale; P38's density indirection then
// rebased the row rules onto --row-pad-y/-x (seeded from that scale). These
// tests pin the CURRENT contract: rows consume the density tokens, and no bare
// px paddings remain on the row selectors. The token values + compact override
// themselves are pinned by the "density tokens (P38)" describe above.
describe('P12/P38 row padding contract', () => {
  it('.lyr-row consumes the density tokens via the tighter calc composition', () => {
    expect(read('./features.css')).toMatch(
      /\.lyr-row\s*\{[^}]*padding:\s*calc\(var\(--row-pad-y\) - 2px\)\s+calc\(var\(--row-pad-x\) - 2px\)/s,
    )
  })
  it('.menu-item consumes the density tokens; .row keeps the s-scale composition', () => {
    const c = read('./components.css')
    expect(c).toMatch(/\.menu-item\s*\{[^}]*padding:\s*var\(--row-pad-y\)\s+var\(--row-pad-x\)/s)
    expect(c).toMatch(/\.row\s*\{[^}]*padding:\s*var\(--s-3\)\s+0/s)
  })
  it('.chip keeps the pill composition var(--s-3) var(--s-4)', () => {
    expect(read('./parts.css')).toMatch(/\.chip\s*\{[^}]*padding:\s*var\(--s-3\)\s+var\(--s-4\)/s)
  })
  it('leaves no bare px paddings on the row selectors', () => {
    expect(read('./features.css')).not.toMatch(/\.lyr-row\s*\{[^}]*padding:\s*6px\s+7px/s)
    expect(read('./components.css')).not.toMatch(/\.menu-item\s*\{[^}]*padding:\s*8px\s+9px/s)
    expect(read('./components.css')).not.toMatch(/\.menu-item\s*\{[^}]*padding:\s*var\(--s-3\);/s)
  })
})

describe('P6 screen-transition crossfade', () => {
  it('fades the floor-plan editor in on mount using --dur-2 + --ease-out with backwards fill', () => {
    const c = read('./screens.css')
    expect(c).toMatch(/@keyframes screenFadeIn\b/)
    expect(c).toMatch(
      /\.plan-screen\s*\{[^}]*animation:\s*screenFadeIn var\(--dur-2\) var\(--ease-out\) backwards/s,
    )
    expect(c).not.toMatch(/screenFadeIn var\(--dur-2\) var\(--ease-out\) both/)
  })
  it('uses no colour literal in the keyframe', () => {
    const kf = read('./screens.css').match(/@keyframes screenFadeIn\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(kf).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|oklch/i)
  })
})

describe('P17 skeleton loader', () => {
  it('defines a token-only shimmer with a background-position keyframe', () => {
    const p = read('./parts.css')
    expect(p).toMatch(/\.skeleton\s*\{[^}]*animation:\s*skeletonShimmer/s)
    expect(p).toMatch(/@keyframes skeletonShimmer/)
    expect(p).toMatch(/\.skeleton\s*\{[^}]*var\(--surface-3\)/s)
  })
  it('uses no colour literal in the skeleton rule', () => {
    const block = read('./parts.css').match(/\.skeleton\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(block).not.toMatch(/#[0-9a-f]{3,8}|rgb|hsl|oklch/i)
  })
})

describe('P2 entrance stagger', () => {
  it('defines .stagger-in children with a --i-driven 50ms animation-delay', () => {
    const c = read('./components.css')
    expect(c).toMatch(
      /\.stagger-in > \*\s*\{[^}]*animation:\s*staggerIn var\(--dur-2\) var\(--ease-out\)/s,
    )
    expect(c).toMatch(/animation-delay:\s*calc\(var\(--i,\s*0\)\s*\*\s*50ms\)/)
    expect(c).toMatch(/@keyframes staggerIn/)
  })
  it('provides an nth-child --i fallback for hand-authored menus', () => {
    expect(read('./components.css')).toMatch(/\.stagger-in > \*:nth-child\(1\)\s*\{\s*--i:\s*0/)
  })
  it('uses fill-mode backwards (not both) so hover transforms and dimmed state are not locked', () => {
    const c = read('./components.css')
    expect(c).toMatch(
      /\.stagger-in > \*\s*\{[^}]*animation:\s*staggerIn var\(--dur-2\) var\(--ease-out\) backwards/s,
    )
    const rule = c.match(/\.stagger-in > \*\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(rule).not.toMatch(/animation:\s*staggerIn var\(--dur-2\) var\(--ease-out\) both/)
  })
  it('reduced-motion zeroes animation-delay so items do not appear one-by-one', () => {
    const app = read('./app.css')
    const block = app.slice(app.indexOf('prefers-reduced-motion'))
    expect(block).toMatch(/animation-delay:\s*0(ms|s)?\s*!important/)
    expect(block).toMatch(/transition-delay:\s*0(ms|s)?\s*!important/)
  })
})

describe('P36 sticky section headers', () => {
  it('pins the layers group header row (.lyr-ghead-row) to the top of the scroll body', () => {
    const f = read('./features.css')
    expect(f).toMatch(/\.lyr-ghead-row\s*\{[^}]*position:\s*sticky/s)
    expect(f).toMatch(/\.lyr-ghead-row\s*\{[^}]*top:\s*0/s)
  })
  it('pins .sec-h and gives both a background + subtle bottom hairline', () => {
    const p = read('./parts.css')
    expect(p).toMatch(/\.sec-h\s*\{[^}]*position:\s*sticky/s)
    expect(p).toMatch(/\.sec-h\s*\{[^}]*box-shadow:\s*0 1px 0 var\(--border\)/s)
  })
  it('.sec-h background is overridable per-container via --sec-h-bg (falls back to --surface)', () => {
    // The default (anchored glass panels — catalog/inspector/budget) keeps the
    // translucent --surface it always had. Containers that go opaque (modal
    // dialogs) override --sec-h-bg to the same opaque tone so the sticky
    // header composites to an identical colour as the card behind it instead
    // of double-compositing a second translucent layer (the "white bar" bug).
    const p = read('./parts.css')
    expect(p).toMatch(/\.sec-h\s*\{[^}]*background:\s*var\(--sec-h-bg,\s*var\(--surface\)\)/s)
  })
  it('modal dialogs go opaque and pin --sec-h-bg to match, so their sticky headers seam-lessly match the card', () => {
    const c = read('./components.css')
    expect(c).toMatch(/\.modal-overlay > \.panel\s*\{[^}]*background:\s*var\(--surface-solid\)/s)
    expect(c).toMatch(/\.modal-overlay > \.panel\s*\{[^}]*--sec-h-bg:\s*var\(--surface-solid\)/s)
  })
  it('flattens .sec-h inside the finish picker (scoped override) — static, transparent, no hairline', () => {
    // The per-room FinishPicker aside carries a `.finish-picker` class so its
    // stacked section headers don't read as full-width lighter strips (user
    // report). The scoped rule must NOT touch the base .sec-h contract asserted
    // above (still sticky + backgrounded + hairlined for other panels).
    const p = read('./parts.css')
    const scoped = p.match(/\.finish-picker \.sec-h\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(scoped).toMatch(/position:\s*static/)
    expect(scoped).toMatch(/background:\s*transparent/)
    expect(scoped).toMatch(/box-shadow:\s*none/)
  })
})

describe('P21 tabular numerals', () => {
  it('sets tabular-nums on .fld .val, .num input and budget HUD readouts', () => {
    const app = read('./app.css')
    const components = read('./components.css')
    const parts2 = read('./parts.css')
    expect(app).toMatch(/\.fld \.val\b[^}]*font-variant-numeric:\s*tabular-nums/s)
    expect(components).toMatch(/\.num input\b[^}]*font-variant-numeric:\s*tabular-nums/s)
    expect(parts2).toMatch(/\.budget-hud-spent[^}]*font-variant-numeric:\s*tabular-nums/s)
  })
  it('keeps dimension readouts tabular via .mono tnum', () => {
    expect(read('./components.css')).toMatch(/\.mono\b[^}]*font-feature-settings:\s*'tnum'\s*1/s)
  })
})

describe('UIUX-8 motion/hover token strays', () => {
  it('walk-HUD fade uses the motion scale, not a raw 600ms', () => {
    const app = read('./app.css')
    expect(app).toMatch(/\.walk-hud[^}]*transition:\s*opacity var\(--dur-3\) var\(--ease-out\)/s)
    expect(app).not.toMatch(/transition:\s*opacity 600ms/)
  })
  it('boot loader fade + bar use --dur-2', () => {
    const screens = read('./screens.css')
    expect(screens).toMatch(/animation:\s*fade var\(--dur-2\)/)
    expect(screens).toMatch(/transition:\s*width var\(--dur-2\)/)
  })
  it('.share-opt hover steps up to --surface-3 (rest --surface-2 → hover --surface-3)', () => {
    const features = read('./features.css')
    expect(features).toMatch(/\.share-opt:hover[^}]*background:\s*var\(--surface-3\)/)
    expect(features).not.toMatch(/\.share-opt:hover[^}]*var\(--surface-solid\)/)
  })
  it('.ss-card transitions on the motion tokens and fills --surface-3 on hover', () => {
    const flows = read('./flows.css')
    expect(flows).toMatch(/\.ss-card[^}]*transition:[^}]*var\(--dur\) var\(--ease\)/s)
    expect(flows).toMatch(/\.ss-card:hover[^}]*background:\s*var\(--surface-3\)/)
    expect(flows).toMatch(/\.ss-card-swatches i[^}]*border-radius:\s*var\(--r-1\)/)
  })
  it('.panel-foot and .form-err exist with token-only styling (UIUX-5/6)', () => {
    const components = read('./components.css')
    expect(components).toMatch(/\.panel-foot\s*\{[^}]*padding:\s*0 var\(--s-4\) var\(--s-4\)/s)
    expect(components).toMatch(/\.form-err\s*\{[^}]*color:\s*var\(--danger\)/)
    expect(components).toMatch(/\.panel-sub\.plain\s*\{[^}]*text-transform:\s*none/)
  })
})

describe('UIUX-23 toast stack collapse', () => {
  it('collapses only with 3+ toasts, never the newest, and expands on hover/focus', () => {
    const features = read('./features.css')
    expect(features).toMatch(
      /\.toast-host:has\(> :nth-child\(3\)\):not\(:hover\):not\(:focus-within\) > \.toast\.in:not\(:last-child\)/,
    )
    const rule = features.slice(features.indexOf('.toast-host:has(> :nth-child(3))'))
    expect(rule.slice(0, 400)).toMatch(/max-height:\s*12px/)
  })
})

describe('UIUX-30 edge spacing + scroll-edge shadows', () => {
  it('menu panels keep the --s-3 inset so rows never sit near-flush', () => {
    const app = read('./app.css')
    expect(app).toMatch(/\.pop-panel \{[^}]*padding:\s*var\(--s-3\)/s)
    expect(app).toMatch(/\.pop-panel > :first-child \{[^}]*margin-top:\s*var\(--s-3\)/s)
  })
  it('modal bodies carry scroll-driven edge shadows behind @supports', () => {
    const components = read('./components.css')
    expect(components).toMatch(/@supports \(animation-timeline: scroll\(\)\)/)
    expect(components).toMatch(/@keyframes scrollEdgeTop/)
    expect(components).toMatch(/@keyframes scrollEdgeBot/)
    expect(components).toMatch(/color-mix\(in oklch, var\(--text\) 14%, transparent\)/)
  })
})

describe('UIUX-31 spring linear() tokens', () => {
  it('defines sampled-spring easings behind @supports with cubic-bezier fallbacks', () => {
    const tokens = read('./tokens.css')
    expect(tokens).toMatch(/@supports \(transition-timing-function: linear\(0, 1\)\)/)
    expect(tokens).toMatch(/--ease-spring-snappy:\s*linear\(0, 0\.022/)
    expect(tokens).toMatch(/--ease-spring-pop:\s*linear\(0, 0\.028/)
    // Fallback pairs must exist un-gated so older browsers resolve the tokens.
    const beforeSupports = tokens.slice(0, tokens.indexOf('@supports'))
    expect(beforeSupports).toMatch(/--ease-spring-snappy:\s*cubic-bezier/)
    expect(beforeSupports).toMatch(/--ease-spring-pop:\s*cubic-bezier/)
  })
  it('the seg pill and done-pop ride the paired spring tokens', () => {
    const components = read('./components.css')
    expect(components).toMatch(
      /\.seg-pill[^}]*var\(--dur-spring-snappy\) var\(--ease-spring-snappy\)/s,
    )
    expect(components).toMatch(/\.done-pop[^}]*var\(--dur-spring-pop\) var\(--ease-spring-pop\)/)
  })
})
