import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootPhraseInlineScript } from './bootPhraseInlineScript.mjs'

const MARKER = '<!-- @boot-phrase-rotator@ -->'
const phrasesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/ui/loading/loadingPhrases.json',
)

function loadPhrases() {
  return JSON.parse(readFileSync(phrasesPath, 'utf8'))
}

/** Inject the boot splash phrase rotator from loadingPhrases.json (single source of truth). */
export function bootPhraseRotatorPlugin() {
  return {
    name: 'boot-phrase-rotator',
    transformIndexHtml(html) {
      if (!html.includes(MARKER)) return html
      const { phrases, cycleMs, fadeMs } = loadPhrases()
      return html.replace(MARKER, bootPhraseInlineScript(phrases, cycleMs, fadeMs))
    },
  }
}
