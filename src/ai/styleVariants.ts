/**
 * "Redesign this render" style vocabulary — the chips offered on the AI
 * photoreal path (Share modal). Each chip re-runs the SAME BYO-key i2i call
 * (`generatePhotoreal`) on the SAME captured snapshot with a style-modified
 * prompt. Pure data + a pure prompt-mutation helper so the contract is
 * unit-testable without a key.
 *
 * The descriptor phrases reuse the brief-parser keyword vocabulary
 * (`furniture/briefParser.ts` PRESET_KEYWORDS) so the app speaks one style
 * language across Smart Start and AI restyling.
 */

export interface StyleVariant {
  id: string
  /** Chip label shown to the user. */
  label: string
  /** Comma-separated style descriptor injected at the head of the prompt. */
  prompt: string
}

export const STYLE_VARIANTS: StyleVariant[] = [
  {
    id: 'scandinavian',
    label: 'Scandinavian',
    prompt: 'bright airy scandinavian interior, light wood, soft white',
  },
  {
    id: 'japandi',
    label: 'Japandi',
    prompt: 'calm japandi interior, zen, wabi sabi, low contrast natural tones',
  },
  {
    id: 'industrial',
    label: 'Industrial',
    prompt: 'moody warm-industrial loft interior, dark timber, charcoal, leather',
  },
  {
    id: 'luxury',
    label: 'Luxury',
    prompt: 'luxurious boutique hotel suite interior, refined materials, elegant lighting',
  },
  {
    id: 'tropical',
    label: 'Tropical',
    prompt: 'cozy tropical resort interior, teak, rattan, greenery, terracotta',
  },
]

/** Theme → default photoreal style hint (the original "Make photoreal" seed). */
export const THEME_HINTS: Record<string, string> = {
  clay: 'warm minimalist Singapore HDB interior',
  kampong: 'cozy tropical kampong-style interior with rattan and greenery',
  porcelain: 'bright airy scandinavian interior',
  estate: 'moody warm-industrial interior with timber and charcoal',
}

/** Default prompt for the first "Make photoreal" run, seeded from the app theme. */
export function defaultPhotorealPrompt(theme: string): string {
  return `${THEME_HINTS[theme] ?? 'modern interior'}, photorealistic, natural light, interior design photo`
}

/** Every comma-segment that belongs to a known style/theme descriptor —
 *  these get stripped before a new style is applied so chips REPLACE each
 *  other (and the theme seed) instead of stacking conflicting styles. */
const STYLE_SEGMENTS = new Set(
  [...STYLE_VARIANTS.map((v) => v.prompt), ...Object.values(THEME_HINTS)].flatMap((p) =>
    p.split(',').map((s) => s.trim().toLowerCase()),
  ),
)

/**
 * Pure: derive a variant prompt from the prompt that produced the original.
 * Drops any segment that is itself a known style/theme descriptor, then leads
 * with the new style (i2i models weight early tokens), keeping the user's
 * other instructions (e.g. "photorealistic, natural light") intact.
 */
export function buildVariantPrompt(basePrompt: string, style: StyleVariant): string {
  const kept = basePrompt
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !STYLE_SEGMENTS.has(s.toLowerCase()))
  return [style.prompt, ...kept].join(', ')
}
