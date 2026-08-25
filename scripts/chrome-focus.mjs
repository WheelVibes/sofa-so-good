#!/usr/bin/env node
/**
 * Bring the Chrome window to the foreground, so a visual check actually sees
 * the app rather than the boot cover.
 *
 * Chrome delivers **no** `requestAnimationFrame` callbacks to a page it
 * considers hidden, and on macOS that includes a window merely OCCLUDED behind
 * another one — not just a minimised one. The app now falls back to timers for
 * its own boot gates (`ui/loading/frameGate.ts`), so a hidden tab boots and can
 * be probed; but the COMPOSITOR still does not paint, so a captured screenshot
 * is the last frame from whenever the window was last visible. For pixels, the
 * window has to be up.
 *
 *   npm run chrome:focus         # raise Chrome (macOS)
 *   npm run chrome:focus -- --check   # just report whether it is frontmost
 *
 * Prefer launching Chrome with the throttling switches if you want to avoid
 * raising it at all (they cover occlusion, though not minimisation):
 *
 *   open -na "Google Chrome" --args \
 *     --disable-backgrounding-occluded-windows \
 *     --disable-renderer-backgrounding \
 *     --disable-background-timer-throttling
 *
 * Exits 0 when Chrome is (now) frontmost, 1 when it could not be raised — so a
 * harness can gate a capture on it.
 */

import { execFileSync } from 'node:child_process'

const CHECK = process.argv.includes('--check')

/**
 * Run one AppleScript line, returning trimmed stdout (or null on failure).
 *
 * Always time-boxed: an `osascript` that trips a permission prompt BLOCKS until
 * someone clicks it, which would hang whatever harness called this. 5 s is
 * plenty for a local Apple event.
 */
function osa(script) {
  try {
    return execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 5000 }).trim()
  } catch {
    return null
  }
}

/**
 * Is Chrome the frontmost app? Asked of CHROME, not System Events: querying
 * `System Events` for the frontmost process needs Accessibility permission and
 * blocks on its prompt (it hung this script's first version), whereas talking
 * to Chrome needs only the Automation grant that `activate` already uses.
 */
function chromeIsFront() {
  return osa('tell application "Google Chrome" to return frontmost') === 'true'
}

function main() {
  if (process.platform !== 'darwin') {
    console.log(
      `[chrome-focus] ${process.platform} is not macOS — raise the Chrome window yourself, or ` +
        'relaunch Chrome with --disable-backgrounding-occluded-windows.',
    )
    process.exit(1)
  }

  if (CHECK) {
    const front = chromeIsFront()
    console.log(`[chrome-focus] Chrome frontmost: ${front}`)
    process.exit(front ? 0 : 1)
  }
  const before = chromeIsFront()

  // `activate` also un-minimises, which the tab-level MCP/extension APIs cannot.
  if (osa('tell application "Google Chrome" to activate') === null) {
    console.error(
      '[chrome-focus] osascript failed. If this is the first run, grant the terminal app ' +
        'Automation access for Google Chrome (System Settings → Privacy & Security → Automation).',
    )
    process.exit(1)
  }
  const after = chromeIsFront()
  console.log(`[chrome-focus] Chrome frontmost: ${before} → ${after}`)
  process.exit(after ? 0 : 1)
}

main()
