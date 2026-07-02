import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bootPhraseInlineScript } from './bootPhraseInlineScript.mjs'

const phrasesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/ui/loading/loadingPhrases.json',
)
const { phrases, cycleMs, fadeMs } = JSON.parse(readFileSync(phrasesPath, 'utf8'))

describe('bootPhraseInlineScript', () => {
  it('embeds all phrases and timing constants', () => {
    const html = bootPhraseInlineScript(phrases, cycleMs, fadeMs)
    for (const phrase of phrases) expect(html).toContain(phrase)
    expect(html).toContain(String(cycleMs))
    expect(html).toContain(String(fadeMs))
    expect(html).toContain('__stopBootPhraseRotator')
  })

  it('lists at least five Singapore/HDB-flavoured lines', () => {
    expect(phrases.length).toBeGreaterThanOrEqual(5)
  })
})
