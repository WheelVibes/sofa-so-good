import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface CreditEntry {
  id: string
  name: string
  attribution: string
  sourceUrl: string
  license: 'CC0' | 'CC-BY'
}

export interface EmitCreditsArgs {
  projectRoot: string
  furniture: CreditEntry[]
  materials: CreditEntry[]
}

export function emitCredits(args: EmitCreditsArgs): void {
  const json = { furniture: args.furniture, materials: args.materials }
  mkdirSync(join(args.projectRoot, 'public/assets'), { recursive: true })
  writeFileSync(join(args.projectRoot, 'public/assets/CREDITS.json'), JSON.stringify(json, null, 2))

  const lines: string[] = [
    '# Asset credits',
    '',
    'Bundled assets are CC0 except where a per-item licence is noted below.',
    '',
  ]
  if (args.furniture.length) {
    lines.push('## Furniture', '')
    for (const e of args.furniture) {
      lines.push(
        `- **${e.name}** (${e.id}) — ${e.attribution}, [source](${e.sourceUrl}), ${e.license}`,
      )
    }
    lines.push('')
  }
  if (args.materials.length) {
    lines.push('## Materials', '')
    for (const e of args.materials) {
      lines.push(
        `- **${e.name}** (${e.id}) — ${e.attribution}, [source](${e.sourceUrl}), ${e.license}`,
      )
    }
    lines.push('')
  }
  writeFileSync(join(args.projectRoot, 'CREDITS.md'), lines.join('\n'))
}
