// Chrome-interactive audit driver — the in-page half of the live-Chrome scenario
// harness (docs/chrome-interactive-audit.md).
//
// Loaded into a REAL Chrome tab (Claude-in-Chrome MCP) instead of the headless
// puppeteer runner in scripts/lib/interact.mjs, so a visual/interactive audit can
// run against a real GPU, real fonts and real device pixel ratio.
//
// It speaks the SAME step vocabulary as the puppeteer scenario runner
// (eval/waitFor/click/drag/rdrag/wheel/key/type/select/wait/screenshot/store/
// viewport), so scripts/scenarios/*.json files run here unchanged. Steps the
// page cannot perform itself (screenshot, viewport) suspend the queue and hand a
// directive back to the host, which performs it and calls resume().
//
// No imports/exports — it is fetched over /@fs and run through `new Function`,
// so it must stay a single self-contained script that only touches `window`.

;(() => {
  const VERSION = 'v1'
  if (window.__audit && window.__audit.version === VERSION) return

  const POLL_MS = 100
  const DEFAULT_TIMEOUT = 15000
  const SETTLE_MS = 80
  // Steps the page cannot do to itself — the host has to act, then resume().
  const HOST_STEPS = new Set(['screenshot', 'viewport'])

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // ──────────────────────────────────────────────────────────────────────────
  // Tab visibility.
  //
  // A hidden tab gets no animation frames: `useFrame` never ticks, so
  // `sceneReady` never flips, the boot loader never lifts, and screenshots come
  // back as the last painted frame. Every symptom reads like an app hang or a
  // regression — it cost one false "boot is broken" investigation. So the
  // harness never runs blind: it waits for the tab to come back, and if it does
  // not, it suspends with a `focus` directive instead of burning step timeouts
  // and reporting stale pixels as findings.
  // ──────────────────────────────────────────────────────────────────────────
  const VISIBLE_WAIT_MS = 20000

  function isVisible_tab() {
    return document.visibilityState === 'visible'
  }

  /** Wait (up to VISIBLE_WAIT_MS) for the tab to be foregrounded again. */
  async function waitForVisible(timeout = VISIBLE_WAIT_MS) {
    if (isVisible_tab()) return true
    // Nudge: harmless when already foreground, and some hosts honour it.
    try {
      window.focus()
    } catch {
      /* not permitted from script — the host directive is the real recovery */
    }
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (isVisible_tab()) return true
      await sleep(POLL_MS)
    }
    return false
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Console / error capture. Installed once, at load, so everything after the
  // driver lands is attributable to a step.
  // ────────────────────────────────────────────────────────────────────────────
  const captured = []
  const record = (level, args) => {
    let text
    try {
      text = args
        .map((a) =>
          typeof a === 'string' ? a : a instanceof Error ? a.stack || a.message : JSON.stringify(a),
        )
        .join(' ')
    } catch {
      text = args.map((a) => String(a)).join(' ')
    }
    captured.push({ level, text: text.slice(0, 2000), step: state.currentStep, t: Date.now() })
    if (captured.length > 2000) captured.shift()
  }

  if (!window.__auditConsoleHooked) {
    window.__auditConsoleHooked = true
    for (const level of ['error', 'warn']) {
      const orig = console[level].bind(console)
      console[level] = (...args) => {
        record(level, args)
        orig(...args)
      }
    }
    window.addEventListener('error', (e) =>
      record('uncaught', [e.message, e.filename + ':' + e.lineno]),
    )
    window.addEventListener('unhandledrejection', (e) => record('rejection', [e.reason]))
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Step normalisation — accepts the same keyed + typed forms as validate.mjs.
  // ────────────────────────────────────────────────────────────────────────────
  const KEYED = [
    'eval',
    'waitFor',
    'click',
    'drag',
    'rdrag',
    'wheel',
    'key',
    'select',
    'wait',
    'screenshot',
    'store',
    'viewport',
    'probe',
    'assert',
  ]

  function normalise(raw, index) {
    const s = { ...raw }
    let type = s.type
    // Keyed form: the discriminator is whichever known key is present. `type` is
    // BOTH a step name and a payload key, so an explicit s.type wins first.
    if (!type || KEYED.includes(type) === false) {
      if (type && !KEYED.includes(type)) {
        // typed form with a non-keyed name (e.g. {type:'type', text:'…'})
      } else {
        type = KEYED.find((k) => k in s)
      }
    }
    if (!type)
      throw new Error(`step ${index + 1}: cannot determine step type from keys ${Object.keys(s)}`)

    const step = {
      type,
      name: s.name || `${type}-${index + 1}`,
      timeout: s.timeout ?? DEFAULT_TIMEOUT,
    }
    const payload = s[type]

    switch (type) {
      case 'eval':
        step.code = typeof payload === 'string' ? payload : (s.code ?? payload?.code)
        if (!step.code)
          throw new Error(`step ${step.name}: eval needs code (file: refs are host-side only)`)
        break
      case 'waitFor': {
        const p = typeof payload === 'object' && payload !== null ? payload : s
        if (p.css) {
          step.until = 'css'
          step.selector = p.css
          step.visible = p.visible !== false
        } else if (p.text) {
          step.until = 'text'
          step.text = p.text
        } else if (p.store) {
          step.until = 'store'
          step.predicate = p.store
        } else if (p.storeExists) {
          step.until = 'storeExists'
        } else if (p.selector) {
          step.until = 'css'
          step.selector = p.selector
          step.visible = p.visible !== false
        } else throw new Error(`step ${step.name}: waitFor needs css/text/store/storeExists`)
        step.timeout = p.timeout ?? step.timeout
        step.failMessage = p.failMessage
        break
      }
      case 'click': {
        if (typeof payload === 'string') step.selector = payload
        else {
          const p = payload ?? s
          step.text = p.text
          step.selector = p.selector ?? p.css
          step.x = p.x
          step.y = p.y
          step.nth = p.nth
        }
        break
      }
      case 'drag':
      case 'rdrag': {
        const p = payload ?? s
        step.from = p.from
        step.to = p.to
        step.steps = p.steps ?? 12
        if (!step.from || !step.to) throw new Error(`step ${step.name}: ${type} needs from + to`)
        break
      }
      case 'wheel': {
        const p = payload ?? s
        step.x = p.x
        step.y = p.y
        step.dy = p.dy ?? p.deltaY ?? 0
        break
      }
      case 'key':
        step.keyName = typeof payload === 'string' ? payload : (s.keyName ?? payload?.key)
        break
      case 'select': {
        const p = payload ?? s
        step.selector = p.selector || 'select'
        step.value = p.value
        break
      }
      case 'wait':
        step.ms = typeof payload === 'number' ? payload : (s.ms ?? 500)
        break
      case 'screenshot':
        step.shotName = typeof payload === 'string' ? payload : (s.screenshotName ?? step.name)
        break
      case 'store': {
        const p = payload ?? s
        step.action = p.action
        step.args = p.args ?? []
        if (!step.action) throw new Error(`step ${step.name}: store needs action`)
        break
      }
      case 'viewport': {
        const p = payload ?? s
        step.width = p.width
        step.height = p.height
        break
      }
      case 'probe': {
        const p = typeof payload === 'object' && payload !== null ? payload : {}
        step.checks = p.checks
        step.scope = p.scope
        break
      }
      case 'assert': {
        const p = typeof payload === 'object' && payload !== null ? payload : { js: payload }
        step.js = p.js
        step.message = p.message
        if (!step.js) throw new Error(`step ${step.name}: assert needs js`)
        break
      }
      default:
        break
    }
    // Typed-form keyboard typing: {type:'type', text:'…', x?, y?}
    if (type === 'type' || (s.type === 'type' && s.text != null)) {
      step.type = 'type'
      step.text = s.text
      step.x = s.x
      step.y = s.y
      if (step.text == null) throw new Error(`step ${step.name}: (type action) must have "text"`)
    }
    return step
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Synthetic input. Real Chrome + full pointer-event sequences, so R3F raycasts
  // and three's OrbitControls react exactly as they do to a human.
  // ────────────────────────────────────────────────────────────────────────────
  function targetAt(x, y) {
    return document.elementFromPoint(x, y) || document.body
  }

  function pointer(el, type, x, y, opts = {}) {
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: opts.button ?? 0,
      buttons: opts.buttons ?? 0,
      ctrlKey: !!opts.ctrlKey,
      shiftKey: !!opts.shiftKey,
      altKey: !!opts.altKey,
      metaKey: !!opts.metaKey,
    }
    const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent
    el.dispatchEvent(new Ctor(type, base))
  }

  async function clickAt(x, y, opts = {}) {
    const el = targetAt(x, y)
    pointer(el, 'pointermove', x, y)
    pointer(el, 'mousemove', x, y)
    pointer(el, 'pointerdown', x, y, { ...opts, buttons: 1 })
    pointer(el, 'mousedown', x, y, { ...opts, buttons: 1 })
    await sleep(16)
    const up = targetAt(x, y)
    pointer(up, 'pointerup', x, y, opts)
    pointer(up, 'mouseup', x, y, opts)
    pointer(up, 'click', x, y, opts)
    // Native activation for real controls (React onClick already fired above, but
    // labels/summary/anchors need their default behaviour).
    const tag = up.tagName?.toLowerCase()
    if (tag === 'summary' || tag === 'label' || tag === 'a') up.click?.()
    // Synthetic pointer events do NOT run the browser's native focus default
    // action. Without this, a "click the search box then type" sequence left
    // focus on <body> and the keystrokes went to the app's global shortcuts —
    // which silently jumped the camera to top view mid-scenario.
    const focusable = up.closest?.(
      'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])',
    )
    if (focusable) focusable.focus?.({ preventScroll: true })
    return {
      tag,
      cls: up.className?.toString?.().slice(0, 120),
      focused: document.activeElement?.tagName?.toLowerCase(),
    }
  }

  async function dragPath(from, to, button, steps) {
    const [x0, y0] = from
    const [x1, y1] = to
    const el = targetAt(x0, y0)
    const buttons = button === 'right' ? 2 : 1
    const btn = button === 'right' ? 2 : 0
    pointer(el, 'pointermove', x0, y0)
    pointer(el, 'pointerdown', x0, y0, { button: btn, buttons })
    pointer(el, 'mousedown', x0, y0, { button: btn, buttons })
    for (let i = 1; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps
      const y = y0 + ((y1 - y0) * i) / steps
      pointer(el, 'pointermove', x, y, { button: btn, buttons })
      pointer(el, 'mousemove', x, y, { button: btn, buttons })
      await sleep(16)
    }
    pointer(el, 'pointerup', x1, y1, { button: btn, buttons: 0 })
    pointer(el, 'mouseup', x1, y1, { button: btn, buttons: 0 })
  }

  const KEY_CODES = {
    Escape: 27,
    Enter: 13,
    Tab: 9,
    Backspace: 8,
    Delete: 46,
    ' ': 32,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
  }

  function pressKey(keyName) {
    // Accepts "Escape", "a", "Meta+k".
    const parts = String(keyName).split('+')
    const key = parts.pop()
    const mods = parts.map((m) => m.toLowerCase())
    const init = {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      keyCode: KEY_CODES[key] ?? key.toUpperCase().charCodeAt(0),
      which: KEY_CODES[key] ?? key.toUpperCase().charCodeAt(0),
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: mods.includes('control') || mods.includes('ctrl'),
      metaKey: mods.includes('meta') || mods.includes('cmd'),
      shiftKey: mods.includes('shift'),
      altKey: mods.includes('alt'),
    }
    const el =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : document
    el.dispatchEvent(new KeyboardEvent('keydown', init))
    el.dispatchEvent(new KeyboardEvent('keyup', init))
  }

  /** Drive a controlled React input: set via the value setter, then fire input. */
  function setInputValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async function typeText(text, x, y) {
    if (x != null && y != null) await clickAt(x, y)
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      // Per-character so React-side filtering/debounce sees a realistic stream.
      let acc = el.value ?? ''
      for (const ch of String(text)) {
        acc += ch
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
        setInputValue(el, acc)
        await sleep(20)
      }
      return {
        typedInto:
          el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
      }
    }
    for (const ch of String(text)) {
      pressKey(ch)
      await sleep(20)
    }
    return { typedInto: 'document (no focused input)' }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Element lookup
  // ────────────────────────────────────────────────────────────────────────────
  /**
   * True for the visually-hidden pattern used by screen-reader live regions and
   * skip links: clipped to nothing, or a 1x1 box parked off-screen.
   *
   * These are correct accessibility markup, not layout bugs — but they look like
   * catastrophic clipping to a naive measurement (`clientWidth: 1` against 98px
   * of text) and like viewport overflow (`left: -9999`). The audit reported the
   * app's polite "Item deleted" announcer as clipped text before this existed.
   */
  function isScreenReaderOnly(el) {
    const st = getComputedStyle(el)
    if (st.clipPath === 'inset(50%)' || /rect\(0px,\s*0px,\s*0px,\s*0px\)/.test(st.clip))
      return true
    if (el.getAttribute('aria-live') || el.getAttribute('role') === 'status') {
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) return true
    }
    const r = el.getBoundingClientRect()
    // Parked far off-screen (the -9999px idiom) rather than merely scrolled out.
    if (r.right < -1000 || r.bottom < -1000) return true
    return false
  }

  function isVisible(el) {
    const st = getComputedStyle(el)
    if (st.display === 'none' || st.visibility === 'hidden' || Number.parseFloat(st.opacity) === 0)
      return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }

  /** Deepest visible interactive element containing `txt` — mirrors clickByText. */
  function findByText(txt) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
    let best = null
    let bestDepth = -1
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent?.trim() || !node.textContent.includes(txt)) continue
      let el = node.parentElement
      while (el && el !== document.body) {
        const tag = el.tagName.toLowerCase()
        if (
          tag === 'button' ||
          tag === 'a' ||
          tag === 'input' ||
          tag === 'label' ||
          tag === 'summary' ||
          el.getAttribute('role') === 'button' ||
          el.getAttribute('tabindex') != null
        )
          break
        el = el.parentElement
      }
      if (!el || el === document.body) continue
      if (!isVisible(el)) continue
      let depth = 0
      for (let p = el; p; p = p.parentElement) depth++
      if (depth > bestDepth) {
        best = el
        bestDepth = depth
      }
    }
    return best
  }

  function centreOf(el) {
    const r = el.getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  }

  /** True when (x,y) actually hits `el` (or a descendant) — catches covered controls. */
  function hitTest(el, x, y) {
    const top = document.elementFromPoint(x, y)
    return !!top && (top === el || el.contains(top) || top.contains(el))
  }

  /**
   * True when `el` is clipped out of view by a scrolling ancestor.
   *
   * Essential before any hit-test: an element scrolled below its scroll
   * container is not painted at its own rect, so `elementFromPoint` at its
   * centre returns whatever sits there instead — which made the `covered` probe
   * report catalog cards as "covered by the pager" when they were merely
   * scrolled out of the list. Verified: card rect 1114..1293 vs grid 175..812,
   * pager 812..850 — no rect overlap at all.
   */
  function clippedByScrollAncestor(el) {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const st = getComputedStyle(p)
      const scrolls = /(auto|scroll|hidden)/.test(st.overflowX + st.overflowY)
      if (!scrolls) continue
      const pr = p.getBoundingClientRect()
      if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) return true
    }
    return false
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Audit probes — the value-add over the puppeteer runner. Each returns an array
  // of findings; a probe step collects them all into the step log.
  // ────────────────────────────────────────────────────────────────────────────
  const INTERACTIVE_SEL =
    'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])'

  function describe(el) {
    const cls = el.className?.toString?.().split(' ').filter(Boolean).slice(0, 3).join('.')
    const label = (el.getAttribute?.('aria-label') || el.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40)
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${label ? ` "${label}"` : ''}`
  }

  const probes = {
    /** Console errors/warnings captured since the driver loaded. */
    console: () => {
      const seen = new Map()
      for (const c of captured) {
        const key = c.level + '|' + c.text.slice(0, 200)
        if (!seen.has(key)) {
          const upstream = UPSTREAM_NOISE.some((re) => re.test(c.text))
          seen.set(key, {
            level: c.level,
            text: c.text.slice(0, 300),
            step: c.step,
            count: 0,
            ...(upstream ? { upstream: true } : {}),
          })
        }
        seen.get(key).count++
      }
      // App-owned first, dependency noise last, so a real warning reads at the top.
      return [...seen.values()].sort(
        (a, b) => Number(a.upstream ?? false) - Number(b.upstream ?? false),
      )
    },

    /** Page-level horizontal overflow + the elements sticking out of the viewport. */
    overflow: (scope) => {
      const out = []
      const de = document.documentElement
      if (de.scrollWidth > de.clientWidth + 1) {
        out.push({
          kind: 'page-h-scroll',
          detail: `documentElement scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}`,
        })
      }
      const vw = window.innerWidth
      for (const el of (scope || document).querySelectorAll('*')) {
        if (!isVisible(el)) continue
        if (isScreenReaderOnly(el)) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0) continue
        if (r.right > vw + 2 || r.left < -2) {
          const pr = el.parentElement?.getBoundingClientRect()
          // Only report the outermost offender in a chain.
          if (pr && (pr.right > vw + 2 || pr.left < -2)) continue
          out.push({
            kind: 'offscreen-x',
            el: describe(el),
            detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} (vw ${vw})`,
          })
        }
      }
      return out.slice(0, 25)
    },

    /** Text clipped by its own box (ellipsis or hard cut). */
    clipped: (scope) => {
      const out = []
      for (const el of (scope || document).querySelectorAll('*')) {
        if (!isVisible(el)) continue
        if (isScreenReaderOnly(el)) continue
        if (el.children.length > 0) continue
        const txt = el.textContent?.trim()
        if (!txt) continue
        const st = getComputedStyle(el)
        if (st.overflow === 'visible' && st.textOverflow !== 'ellipsis') continue
        if (el.scrollWidth > el.clientWidth + 1) {
          out.push({
            kind: 'clipped-text',
            el: describe(el),
            detail: `scrollW ${el.scrollWidth} > clientW ${el.clientWidth}: "${txt.slice(0, 50)}"`,
            ellipsis: st.textOverflow === 'ellipsis',
          })
        }
      }
      return out.slice(0, 25)
    },

    /**
     * Tap targets under 44px. Accounts for the invisible `::after` hit-area
     * padding the mobile controls use (a 32px button with a -6px ::after inset
     * is a 44px target), so it only reports the genuinely small ones.
     */
    tapTargets: (scope) => {
      const out = []
      const MIN = 44
      for (const el of (scope || document).querySelectorAll(INTERACTIVE_SEL)) {
        if (!isVisible(el) || isScreenReaderOnly(el)) continue
        const r = el.getBoundingClientRect()
        let w = r.width
        let h = r.height
        const after = getComputedStyle(el, '::after')
        // `content` is the EMPTY STRING for `content: ''`, which is falsy in JS —
        // so a truthiness check silently skipped every hit-area expander built
        // that way, and the padded 26px icon buttons (26 + 2×9 = 44) were reported
        // as violations. Only `none` means there is no pseudo-element.
        if (after.content !== 'none' && after.position === 'absolute') {
          const grow = (side) => {
            const v = Number.parseFloat(after[side])
            return Number.isFinite(v) && v < 0 ? -v : 0
          }
          w += grow('left') + grow('right')
          h += grow('top') + grow('bottom')
        }
        if (w < MIN - 0.5 || h < MIN - 0.5) {
          out.push({
            kind: 'small-tap-target',
            el: describe(el),
            detail: `${Math.round(w)}x${Math.round(h)} (min ${MIN})`,
          })
        }
      }
      return out.slice(0, 40)
    },

    /**
     * Interactive elements with no accessible name at all.
     *
     * Counts BOTH label associations: an explicit `<label for=id>` and an
     * implicit wrapping `<label><span>Latitude</span><input/></label>`. The
     * wrapping form is what this codebase uses for numeric fields, and missing
     * it made the probe's first run report two false positives.
     */
    naming: (scope) => {
      const out = []
      for (const el of (scope || document).querySelectorAll(INTERACTIVE_SEL)) {
        if (!isVisible(el)) continue
        let labelled = ''
        if (el.id)
          labelled =
            document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() || ''
        if (!labelled) labelled = el.closest('label')?.textContent?.trim() || ''
        const name = (
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.textContent?.trim() ||
          el.getAttribute('placeholder') ||
          labelled ||
          (el.getAttribute('aria-labelledby') ? 'labelledby' : '') ||
          ''
        ).trim()
        if (!name)
          out.push({
            kind: 'no-accessible-name',
            el: describe(el),
            detail: el.outerHTML.slice(0, 120),
          })
      }
      return out.slice(0, 30)
    },

    /**
     * Children of `scope` that are not fully opaque — the TOOLBAR-MENU-VOID
     * check. Run it with NO settle right after a panel mounts.
     */
    transparent: (scope) => {
      const root = scope || document.body
      const out = []
      for (const c of root.children || []) {
        const op = Number.parseFloat(getComputedStyle(c).opacity)
        if (op < 0.99) out.push({ kind: 'not-opaque', el: describe(c), detail: `opacity ${op}` })
      }
      return out
    },

    /** Text/background contrast below WCAG AA (4.5, or 3.0 for large text). */
    contrast: (scope) => {
      const parse = (c) => {
        const m = c.match(/rgba?\(([^)]+)\)/)
        if (!m) return null
        const p = m[1].split(/[,\s/]+/).map(Number)
        return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }
      }
      const lum = ({ r, g, b }) => {
        const f = (v) => {
          v /= 255
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const bgOf = (el) => {
        for (let p = el; p; p = p.parentElement) {
          const c = parse(getComputedStyle(p).backgroundColor)
          if (c && c.a > 0.5) return c
        }
        return { r: 255, g: 255, b: 255, a: 1 }
      }
      const out = []
      for (const el of (scope || document).querySelectorAll('*')) {
        if (el.children.length || !el.textContent?.trim() || !isVisible(el)) continue
        const st = getComputedStyle(el)
        const fg = parse(st.color)
        if (!fg || fg.a < 0.5) continue
        const bg = bgOf(el)
        const l1 = lum(fg)
        const l2 = lum(bg)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        const size = Number.parseFloat(st.fontSize)
        const bold = Number.parseInt(st.fontWeight, 10) >= 700
        const large = size >= 24 || (size >= 18.66 && bold)
        const min = large ? 3 : 4.5
        if (ratio < min) {
          out.push({
            kind: 'low-contrast',
            el: describe(el),
            detail: `${ratio.toFixed(2)}:1 (needs ${min}) ${st.color} on ${st.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'inherited bg' : st.backgroundColor} @ ${size}px`,
          })
        }
      }
      return out.slice(0, 30)
    },

    /** Images/canvases that failed to paint. */
    assets: (scope) => {
      const out = []
      for (const img of (scope || document).querySelectorAll('img')) {
        if (img.complete && img.naturalWidth === 0) {
          out.push({ kind: 'broken-image', el: describe(img), detail: img.currentSrc || img.src })
        }
      }
      return out
    },

    /** Duplicate DOM ids — a real source of label/aria mis-association. */
    ids: () => {
      const seen = new Map()
      for (const el of document.querySelectorAll('[id]')) {
        seen.set(el.id, (seen.get(el.id) ?? 0) + 1)
      }
      return [...seen.entries()]
        .filter(([, n]) => n > 1)
        .map(([id, n]) => ({ kind: 'duplicate-id', detail: `#${id} x${n}` }))
    },

    /**
     * Controls whose centre is covered by something else (unclickable UI).
     *
     * A modal scrim legitimately covers the whole app, which made the first run
     * report all 13 background controls as "covered". When a modal is open, only
     * controls INSIDE it are meaningful to check.
     */
    covered: (scope) => {
      const out = []
      // Any open overlay, not just the app's own class: the login screen is a
      // full-viewport `div.login-screen[role=dialog]`, and scoping only to
      // `.modal-overlay` reported all 13 controls behind it as "covered".
      // Last match wins — the most recently mounted overlay is the top one.
      const overlays = [...document.querySelectorAll('.modal-overlay, [role="dialog"]')].filter(
        (el) => isVisible(el),
      )
      const modal = overlays[overlays.length - 1] ?? null
      const root = scope || modal || document
      for (const el of root.querySelectorAll(INTERACTIVE_SEL)) {
        if (!isVisible(el) || el.disabled) continue
        if (modal && !scope && !modal.contains(el)) continue
        if (clippedByScrollAncestor(el)) continue
        // Inside a collapsed <details>: in the DOM, not on screen. The app's
        // Disclosure is built on <details>/<summary>, and the GLB designer's
        // closed "Templates" section reported its buttons as "covered by
        // summary.compose-summary" — they were simply folded away.
        if (el.closest('details:not([open])')) continue
        const r = el.getBoundingClientRect()
        if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue
        const [x, y] = centreOf(el)
        if (!hitTest(el, x, y)) {
          const top = document.elementFromPoint(x, y)
          out.push({
            kind: 'covered-control',
            el: describe(el),
            detail: `covered by ${top ? describe(top) : 'nothing'}`,
          })
        }
      }
      return out.slice(0, 25)
    },
  }

  /**
   * Console noise owned by DEPENDENCIES, not this app — verified upstream and not
   * fixable here. Classified rather than hidden, so it stays visible but cannot
   * bury a real app warning.
   *
   * `THREE.Clock` — `@react-three/fiber` constructs one for `state.clock`, its
   * documented public API. Checked against 9.7.0 (latest): still present, so an
   * upgrade would not clear it. `three-stdlib` does the same.
   */
  const UPSTREAM_NOISE = [/THREE\.Clock: This module has been deprecated/]

  const DEFAULT_CHECKS = ['console', 'overflow', 'clipped', 'naming', 'assets', 'ids', 'covered']

  function runProbes(checks, scopeSel) {
    const scope = scopeSel ? document.querySelector(scopeSel) : null
    if (scopeSel && !scope) {
      return { probeScope: [{ kind: 'scope-not-found', detail: scopeSel }] }
    }
    const list = checks && checks.length ? checks : DEFAULT_CHECKS
    const findings = {}
    // A missing scope is a scenario bug, not a page finding — surface it as a
    // single well-formed entry so report() (which expects arrays of findings)
    // does not iterate a bare string into one entry per character.
    for (const name of list) {
      if (!probes[name]) {
        findings[name] = [{ kind: 'unknown-probe', detail: name }]
        continue
      }
      try {
        const r = probes[name](scope)
        if (Array.isArray(r) ? r.length : r) findings[name] = r
      } catch (err) {
        findings[name] = [{ kind: 'probe-threw', detail: String(err && err.message) }]
      }
    }
    return findings
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Step execution
  // ────────────────────────────────────────────────────────────────────────────
  async function waitFor(step) {
    const deadline = Date.now() + step.timeout
    while (Date.now() < deadline) {
      let met = false
      try {
        if (step.until === 'storeExists') met = typeof window.__store !== 'undefined'
        else if (step.until === 'css') {
          const el = document.querySelector(step.selector)
          met = step.visible ? el !== null : el === null
        } else if (step.until === 'text')
          met = document.body?.textContent?.includes(step.text) ?? false
        else if (step.until === 'store') {
          const st = window.__store?.getState()
          met = st ? Boolean(new Function('state', `return (${step.predicate})`)(st)) : false
        }
      } catch {
        met = false
      }
      if (met) return { waitedMs: step.timeout - (deadline - Date.now()) }
      await sleep(POLL_MS)
    }
    throw new Error(step.failMessage || `waitFor "${step.name}" timed out after ${step.timeout}ms`)
  }

  async function execute(step) {
    switch (step.type) {
      case 'eval': {
        const v = await new Function(`return (async () => { ${step.code} })()`)()
        return v === undefined ? undefined : { value: v }
      }
      case 'waitFor':
        return waitFor(step)
      case 'click': {
        if (step.x != null && step.y != null) return clickAt(step.x, step.y)
        if (step.selector) {
          const deadline = Date.now() + step.timeout
          let el = null
          while (Date.now() < deadline) {
            const all = [...document.querySelectorAll(step.selector)].filter(isVisible)
            el = step.nth != null ? all[step.nth] : all[0]
            if (el) break
            await sleep(POLL_MS)
          }
          if (!el) throw new Error(`click: no visible element for selector "${step.selector}"`)
          el.scrollIntoView?.({ block: 'center', behavior: 'instant' })
          await sleep(30)
          const [x, y] = centreOf(el)
          if (!hitTest(el, x, y) && !clippedByScrollAncestor(el)) {
            const top = document.elementFromPoint(x, y)
            throw new Error(
              `click: "${step.selector}" centre is covered by ${top ? describe(top) : 'nothing'} — the click would be a silent no-op`,
            )
          }
          return clickAt(x, y)
        }
        if (step.text) {
          const deadline = Date.now() + step.timeout
          let el = null
          while (Date.now() < deadline) {
            el = findByText(step.text)
            if (el) break
            await sleep(POLL_MS)
          }
          if (!el)
            throw new Error(
              `click-by-text: no visible interactive element containing "${step.text}"`,
            )
          el.scrollIntoView?.({ block: 'center', behavior: 'instant' })
          await sleep(30)
          const [x, y] = centreOf(el)
          if (!hitTest(el, x, y)) {
            const top = document.elementFromPoint(x, y)
            throw new Error(
              `click-by-text "${step.text}" resolved to ${describe(el)} but its centre is covered by ${top ? describe(top) : 'nothing'}`,
            )
          }
          return clickAt(x, y)
        }
        throw new Error('click: needs text, selector or x/y')
      }
      case 'drag':
        return dragPath(step.from, step.to, 'left', step.steps)
      case 'rdrag':
        return dragPath(step.from, step.to, 'right', step.steps)
      case 'wheel': {
        const el = targetAt(step.x, step.y)
        el.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: step.x,
            clientY: step.y,
            deltaY: step.dy,
            deltaMode: 0,
          }),
        )
        return undefined
      }
      case 'key':
        pressKey(step.keyName)
        return undefined
      case 'type':
        return typeText(step.text, step.x, step.y)
      case 'select': {
        const el = document.querySelector(step.selector)
        if (!el) throw new Error(`select: "${step.selector}" not found`)
        el.value = String(step.value)
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return { value: el.value }
      }
      case 'wait':
        await sleep(step.ms)
        return undefined
      case 'store': {
        const st = window.__store?.getState()
        if (!st) throw new Error('window.__store not available')
        if (typeof st[step.action] !== 'function')
          throw new Error(`store action "${step.action}" not found`)
        const v = st[step.action](...step.args)
        return v === undefined ? undefined : { value: JSON.parse(JSON.stringify(v ?? null)) }
      }
      case 'probe':
        return { findings: runProbes(step.checks, step.scope) }
      case 'assert': {
        const ok = Boolean(await new Function(`return (async () => (${step.js}))()`)())
        if (!ok) throw new Error(step.message || `assert failed: ${step.js}`)
        return { asserted: true }
      }
      default:
        throw new Error(`unknown step type: ${step.type}`)
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Queue / host handshake
  // ────────────────────────────────────────────────────────────────────────────
  const state = { steps: [], index: 0, log: [], name: '', currentStep: null, running: false }

  function tail(n = 6) {
    return state.log.slice(-n)
  }

  async function pump() {
    if (state.running) return { status: 'busy' }
    state.running = true
    try {
      while (state.index < state.steps.length) {
        // Never step a hidden tab: rAF is throttled, so waitFor/screenshot steps
        // would time out or capture stale frames and be reported as app bugs.
        if (!isVisible_tab() && !(await waitForVisible())) {
          return {
            status: 'paused',
            directive: {
              action: 'focus',
              reason: 'tab is hidden — rAF throttled, captures would be stale',
            },
            at: `${state.index}/${state.steps.length} (before ${state.steps[state.index]?.name})`,
            recent: tail(),
          }
        }
        const step = state.steps[state.index]
        // Hand host-only steps back before consuming them.
        if (HOST_STEPS.has(step.type)) {
          state.index++
          const entry = { n: state.index, name: step.name, type: step.type, ok: true, host: true }
          if (step.type === 'screenshot') entry.shotName = step.shotName
          if (step.type === 'viewport') entry.size = [step.width, step.height]
          state.log.push(entry)
          return {
            status: 'paused',
            directive:
              step.type === 'screenshot'
                ? { action: 'screenshot', name: step.shotName }
                : { action: 'resize', width: step.width, height: step.height },
            at: `${state.index}/${state.steps.length} ${step.name}`,
            recent: tail(),
          }
        }
        state.currentStep = step.name
        const t0 = performance.now()
        try {
          const info = await execute(step)
          const ms = Math.round(performance.now() - t0)
          state.index++
          state.log.push({
            n: state.index,
            name: step.name,
            type: step.type,
            ms,
            ok: true,
            ...(info ? { info } : {}),
          })
        } catch (err) {
          const ms = Math.round(performance.now() - t0)
          state.log.push({
            n: state.index + 1,
            name: step.name,
            type: step.type,
            ms,
            ok: false,
            error: String((err && err.message) || err),
          })
          return {
            status: 'failed',
            at: `${state.index + 1}/${state.steps.length} ${step.name}`,
            error: String((err && err.message) || err),
            recent: tail(8),
            console: probes
              .console()
              .filter((c) => c.level !== 'warn')
              .slice(-6),
          }
        }
        await sleep(SETTLE_MS)
      }
      return {
        status: 'done',
        scenario: state.name,
        steps: state.log.length,
        failed: state.log.filter((l) => !l.ok).length,
        log: state.log,
      }
    } finally {
      state.running = false
      state.currentStep = null
    }
  }

  // Detached execution. The host's JS bridge times out well before a long
  // scenario finishes (a 45s CDP ceiling killed the first attempt), so nothing
  // ever awaits pump() across the wire: start() kicks it off, poll() reports.
  let pending = null
  let lastResult = null

  function startDetached() {
    if (pending) return { status: 'already-running', at: `${state.index}/${state.steps.length}` }
    lastResult = null
    pending = pump()
      .then((r) => {
        lastResult = r
        return r
      })
      .catch((err) => {
        lastResult = { status: 'crashed', error: String((err && err.message) || err) }
        return lastResult
      })
      .finally(() => {
        pending = null
      })
    return { status: 'started', steps: state.steps.length }
  }

  window.__audit = {
    version: VERSION,

    /** Kick the queue off in the background; poll() for the outcome. */
    start: startDetached,

    /** Non-blocking progress report — safe to call as often as you like. */
    poll: () =>
      lastResult
        ? { ...lastResult, settled: true }
        : {
            settled: false,
            running: !!pending,
            at: `${state.index}/${state.steps.length}`,
            step: state.currentStep,
            recent: tail(3),
          },

    /** Load a scenario ({name, steps} or a bare step array) and run to the first host step. */
    async load(scenario) {
      const raw = Array.isArray(scenario) ? { name: 'inline', steps: scenario } : scenario
      state.steps = raw.steps.map(normalise)
      state.index = 0
      state.log = []
      state.name = raw.name || 'inline'
      return {
        loaded: state.name,
        steps: state.steps.length,
        types: state.steps.map((s) => s.type),
      }
    },

    /** Continue from wherever the queue stopped, detached. poll() for the outcome. */
    resume: startDetached,
    /** Blocking variants — only for short queues that finish inside the bridge timeout. */
    runBlocking: pump,

    /** Run steps without touching the loaded queue (ad-hoc probing). */
    async once(steps) {
      const saved = { ...state, steps: state.steps, log: state.log, index: state.index }
      state.steps = (Array.isArray(steps) ? steps : [steps]).map(normalise)
      state.index = 0
      state.log = []
      const r = await pump()
      const out = { ...r, log: state.log }
      Object.assign(state, { steps: saved.steps, log: saved.log, index: saved.index })
      return out
    },

    /** Foreground state — the precondition for every visual check. */
    visible: isVisible_tab,
    /** Block until the tab is foregrounded again (or give up and say so). */
    waitForVisible,

    probe: (checks, scope) => runProbes(checks, scope),

    /**
     * Every finding the run produced, flattened to one string per line.
     *
     * The host's JSON bridge truncates deeply-nested objects ("Max depth
     * exceeded"), which hid the detail of 13 findings on the first pass-2 run —
     * so the reporting path deliberately returns flat strings, not objects.
     */
    report: () => {
      const lines = []
      for (const entry of state.log) {
        const f = entry.info?.findings
        if (!f) continue
        for (const [check, items] of Object.entries(f)) {
          if (!Array.isArray(items)) {
            lines.push(`${entry.name} | ${check} | ${String(items)}`.slice(0, 300))
            continue
          }
          for (const it of items) {
            lines.push(
              `${entry.name} | ${check} | ${it.kind ?? ''} | ${it.el ?? ''} | ${it.detail ?? it.text ?? ''}`.slice(
                0,
                300,
              ),
            )
          }
        }
      }
      return lines
    },
    probeNames: () => Object.keys(probes),
    console: () => probes.console(),
    clearConsole: () => {
      captured.length = 0
    },
    status: () => ({
      scenario: state.name,
      at: state.index,
      of: state.steps.length,
      running: state.running,
      recent: tail(),
    }),
    log: () => state.log,
    find: (txt) => {
      const el = findByText(txt)
      return el ? { el: describe(el), rect: el.getBoundingClientRect().toJSON() } : null
    },
  }

  return { audit: VERSION }
})()
