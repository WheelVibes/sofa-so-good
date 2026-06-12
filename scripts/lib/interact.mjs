/**
 * Step engine for scenario-mode. Drives a Puppeteer page through an ordered list
 * of normalised steps produced by validate.mjs#normaliseScenario.
 *
 * Each step logs: STEP <n>/<total> <name> … OK (<elapsed>s)
 * On failure: prints the reason + dumps a failed-<name>.png + exits non-zero.
 *
 * IMPORTANT — timing contract:
 *   Steps are strictly sequential and fully awaited. There is NO blind post-eval
 *   sleep (unlike legacy shot.mjs which fires eval and waits a fixed offset).
 *   Use "waitFor" steps to synchronise with async work instead of "wait" guesses.
 *   This prevents the known timing pitfall where setTimeout work inside an eval
 *   was missed because the screenshot fired before it finished.
 */

import fs from 'node:fs'
import path from 'node:path'

const POLL_INTERVAL_MS = 100

/**
 * Run all steps against `page`. Saves screenshots into `outDir`.
 * `screenshotIndex` is the starting counter for auto-numbered screenshots.
 *
 * @param {import('puppeteer').Page} page
 * @param {object[]} steps normalised steps from validate.mjs
 * @param {string} outDir output directory for screenshots
 * @param {{ logs: string[], screenshotIndex?: number }} ctx shared context
 */
export async function runSteps(page, steps, outDir, ctx) {
  const total = steps.length
  let shotN = ctx.screenshotIndex ?? 1

  for (let i = 0; i < total; i++) {
    const step = steps[i]
    const num = `${i + 1}/${total}`
    const t0 = Date.now()
    process.stdout.write(`STEP ${num} ${step.name} … `)

    try {
      await runStep(page, step, outDir, shotN, ctx)
      if (step.type === 'screenshot') shotN++
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      process.stdout.write(`OK (${elapsed}s)\n`)
    } catch (err) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      process.stdout.write(`FAILED (${elapsed}s)\n`)
      console.error(`  reason: ${err.message}`)

      // Dump a failure screenshot for post-mortem analysis
      try {
        fs.mkdirSync(outDir, { recursive: true })
        const failPath = path.join(outDir, `failed-${step.name}.png`)
        await page.screenshot({ path: failPath })
        console.error(`  failure screenshot: ${failPath}`)
      } catch {
        /* ignore — page may be in a bad state */
      }

      // Print recent console log for context
      const recentLogs = ctx.logs.slice(-20)
      if (recentLogs.length) {
        console.error('  recent page console:')
        for (const l of recentLogs) console.error(`    ${l}`)
      }

      process.exit(1)
    }
  }

  ctx.screenshotIndex = shotN
}

/**
 * Execute a single normalised step.
 *
 * @param {import('puppeteer').Page} page
 * @param {object} step
 * @param {string} outDir
 * @param {number} shotN current screenshot counter
 * @param {{ logs: string[] }} ctx
 */
async function runStep(page, step, outDir, shotN, _ctx) {
  switch (step.type) {
    case 'eval': {
      let code = step.code
      if (!code && step.file) {
        code = fs.readFileSync(step.file, 'utf8')
      }
      if (!code) throw new Error('eval step has neither code nor file')
      // page.evaluate returns when the expression returns — it does NOT wait for
      // any setTimeout/Promise work triggered inside. Use waitFor steps to sync.
      await page.evaluate(code)
      break
    }

    case 'waitFor': {
      await waitForCondition(page, step)
      break
    }

    case 'click': {
      if (step.text) {
        await clickByText(page, step.text, step.timeout ?? 15000)
      } else if (step.selector) {
        await page.waitForSelector(step.selector, { timeout: step.timeout ?? 15000 })
        await page.click(step.selector)
      } else if (step.x != null && step.y != null) {
        await page.mouse.click(step.x, step.y)
      }
      break
    }

    case 'drag': {
      await performDrag(page, step.from, step.to, 'left')
      break
    }

    case 'rdrag': {
      await performDrag(page, step.from, step.to, 'right')
      break
    }

    case 'wheel': {
      await page.mouse.move(step.x, step.y)
      await page.mouse.wheel({ deltaY: step.dy })
      break
    }

    case 'key': {
      const k = step.keyName || step.key
      if (!k) throw new Error('key step has no keyName')
      await page.keyboard.press(k)
      break
    }

    case 'type': {
      if (step.x != null && step.y != null) {
        await page.mouse.click(step.x, step.y)
      }
      await page.keyboard.type(step.text, { delay: 20 })
      break
    }

    case 'select': {
      await page.select(step.selector || 'select', String(step.value))
      break
    }

    case 'wait': {
      await sleep(step.ms)
      break
    }

    case 'screenshot': {
      fs.mkdirSync(outDir, { recursive: true })
      const nn = String(shotN).padStart(2, '0')
      const safeName = (step.screenshotName || step.name).replace(/[^a-zA-Z0-9_-]/g, '-')
      const filePath = path.join(outDir, `${nn}-${safeName}.png`)
      await page.screenshot({ path: filePath })
      console.log(`\n  SHOT_SAVED ${filePath}`)
      break
    }

    case 'store': {
      const { action, args } = step
      if (!action) throw new Error('store step has no action')
      await page.evaluate(
        (a, ar) => {
          const st = window.__store?.getState()
          if (!st) throw new Error('window.__store not available')
          if (typeof st[a] !== 'function') throw new Error(`store action "${a}" not found`)
          st[a](...ar)
        },
        action,
        args ?? [],
      )
      break
    }

    case 'viewport': {
      await page.setViewport({
        width: step.width,
        height: step.height,
        deviceScaleFactor: 1,
      })
      break
    }

    default:
      throw new Error(`Unknown step type: ${step.type}`)
  }

  // Brief inter-step settle — keeps the browser responsive between rapid steps
  // but does NOT substitute for explicit waitFor conditions.
  await sleep(80)
}

/** Wait for a condition with a per-step timeout. */
async function waitForCondition(page, step) {
  const deadline = Date.now() + (step.timeout ?? 15000)
  const fail = step.failMessage || `waitFor "${step.name}" timed out`

  while (Date.now() < deadline) {
    let met = false
    try {
      const until = step.until
      if (until === 'storeExists') {
        met = await page.evaluate(() => typeof window.__store !== 'undefined')
      } else if (until === 'css') {
        // visible: true (default) = element appears; false = element disappears
        const visible = step.visible !== false
        met = await page.evaluate(
          (sel, shouldExist) => {
            const el = document.querySelector(sel)
            return shouldExist ? el !== null : el === null
          },
          step.selector,
          visible,
        )
      } else if (until === 'text') {
        met = await page.evaluate(
          (txt) => document.body?.textContent?.includes(txt) ?? false,
          step.text,
        )
      } else if (until === 'store') {
        met = await page.evaluate((pred) => {
          try {
            const st = window.__store?.getState()
            if (!st) return false
            // eslint-disable-next-line no-new-func
            return Boolean(new Function('state', `return (${pred})`)(st))
          } catch {
            return false
          }
        }, step.predicate)
      } else {
        // Legacy typed format: if selector is present, wait for it
        if (step.selector) {
          met = await page.evaluate((sel) => document.querySelector(sel) !== null, step.selector)
        }
      }
    } catch {
      met = false
    }

    if (met) return
    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error(fail)
}

/**
 * Click the deepest visible element containing the given text.
 * Searches all elements and picks the most specific (deepest) match.
 */
async function clickByText(page, text, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const found = await page.evaluate((txt) => {
      // Walk all elements, find those whose visible text contains the target,
      // prefer deeper elements (more specific).
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
      let candidate = null
      let candidateDepth = -1
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (!node.textContent?.trim()) continue
        if (!node.textContent.includes(txt)) continue
        let el = node.parentElement
        // Climb until we find a clickable or interactive element
        while (el && el !== document.body) {
          const tag = el.tagName.toLowerCase()
          const clickable =
            tag === 'button' ||
            tag === 'a' ||
            tag === 'input' ||
            tag === 'label' ||
            el.getAttribute('role') === 'button' ||
            el.getAttribute('tabindex') != null
          if (clickable) break
          el = el.parentElement
        }
        if (!el) continue
        // Check visibility
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          continue
        }
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        // Prefer deeper (more specific) element
        let depth = 0
        let p = el
        while (p) {
          depth++
          p = p.parentElement
        }
        if (depth > candidateDepth) {
          candidate = el
          candidateDepth = depth
        }
      }
      if (!candidate) return null
      const r = candidate.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, text)

    if (found) {
      await page.mouse.click(found.x, found.y)
      return
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`click-by-text: could not find visible element containing text "${text}"`)
}

/** Perform a smooth mouse drag (left or right button). */
async function performDrag(page, from, to, button) {
  await page.mouse.move(from[0], from[1])
  await page.mouse.down({ button })
  const steps = 20
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from[0] + ((to[0] - from[0]) * i) / steps,
      from[1] + ((to[1] - from[1]) * i) / steps,
    )
    await sleep(8)
  }
  await page.mouse.up({ button })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
