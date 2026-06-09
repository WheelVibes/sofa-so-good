import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the VitePress user/developer guides against the class of bug that
 * silently broke `docs:build`: a literal `<placeholder>` in prose (e.g. an
 * example modal label `"Enter <room>?"`) is parsed by Vue as an unclosed custom
 * element and fails the whole build. Placeholders must be escaped (`&lt;…&gt;`)
 * or wrapped in `code`. We strip code spans/blocks first, then flag any
 * angle-bracket token in prose that isn't a known-safe inline HTML tag.
 */

// Inline HTML the guides legitimately use in prose.
const ALLOWED = new Set([
  'kbd',
  'br',
  'sub',
  'sup',
  'b',
  'i',
  'em',
  'strong',
  'a',
  'img',
  'div',
  'span',
  'hr',
  'p',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'code',
  'pre',
  'details',
  'summary',
  'video',
  'source',
])

function mdFiles(dir: string): string[] {
  let out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out = out.concat(mdFiles(p))
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

function strippedProse(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/`[^`\n]*`/g, '') // inline code
}

/** Tag-like tokens in prose, e.g. `<room>` or `<finish>` → ['room','finish']. */
function suspectTags(prose: string): string[] {
  const found = new Set<string>()
  for (const m of prose.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b/g)) {
    const tag = m[1].toLowerCase()
    if (!ALLOWED.has(tag)) found.add(tag)
  }
  return [...found]
}

describe('docs markdown — no unescaped placeholder tags (breaks VitePress build)', () => {
  for (const root of ['docs/user', 'docs/developer']) {
    const files = mdFiles(join(process.cwd(), root))
    it(`${root}: every .md keeps prose free of unknown <tags>`, () => {
      const offenders: string[] = []
      for (const f of files) {
        const tags = suspectTags(strippedProse(readFileSync(f, 'utf8')))
        if (tags.length)
          offenders.push(`${f.split('/').slice(-2).join('/')}: <${tags.join('>, <')}>`)
      }
      expect(offenders, offenders.join('\n')).toEqual([])
    })
  }
})
