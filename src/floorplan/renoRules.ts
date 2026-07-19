/**
 * SG renovation-rules reference pack (UX research round 4 R4-6).
 *
 * A compact, cited bundle of the smaller HDB/BCA renovation compliance rules that
 * don't each merit their own feature but are asked about constantly: the wet-area
 * 3-year tile-hacking rule, window & grille compliance, reno working-hours / noise
 * limits, and the permit / DRC-contractor paperwork checklist. Static data only —
 * pure content, no logic — so it renders identically everywhere and stays trivial
 * to keep current.
 *
 * Rules as of 2026. Verify against the live HDB/BCA sources before relying on them
 * for a submission; copy is intentionally advisory, not legal advice.
 *
 * Refs:
 *  - Wet-area tile rule: elementsid.com.sg/can-you-hack-hdb-walls/
 *  - Windows & grilles: degrille.com.sg/article/are-invisible-grilles-approved-by-the-hdb/
 *  - Working hours / noise: renovationcontractorsingapore.com/blogs/news/hdb-renovation-noise-rules-working-hours-2026
 *  - Permits / DRC: propertyguru.com.sg/property-guides/hdb-renovation-permits-in-singapore-16702
 */

/** One reference section: a titled group of concise, cited rule points. */
export interface RenoRuleSection {
  /** Stable id (keying + anchor). */
  id: string
  title: string
  /** Short, factual bullet points. */
  points: string[]
  /** Cited source domain (shown as the section's attribution). */
  source: string
}

/** The reference is dated so users know its currency. */
export const RENO_RULES_AS_OF = '2026'

export const RENO_RULES: readonly RenoRuleSection[] = [
  {
    id: 'wet-area',
    title: 'Wet-area 3-year tile rule',
    points: [
      'Do NOT hack bathroom / wet-area floor tiles in the first 3 years after flat completion — the original waterproofing membrane must stay intact.',
      'Overlay new tiles or vinyl over the existing screed instead of hacking during this period.',
      'After 3 years, hacking + re-waterproofing is allowed but must be re-tested for ponding and leaks.',
      'A leak that affects the unit below is the upper unit owner’s responsibility to rectify.',
    ],
    source: 'elementsid.com.sg',
  },
  {
    id: 'windows-grilles',
    title: 'Windows & grilles',
    points: [
      'Window replacement must use a BCA-approved window contractor (AWC) — DIY / unlicensed installs are not permitted.',
      'Fasteners must be 304-grade stainless-steel rivets (min. 3 per side); aluminium rivets are not allowed.',
      'Only HDB-approved invisible-grille designs and installers are permitted; keep the installation certificate.',
      'Casement windows must open fully for cleaning; do not obstruct the required openable area.',
    ],
    source: 'degrille.com.sg',
  },
  {
    id: 'working-hours',
    title: 'Working hours & noise',
    points: [
      'General renovation: Mon–Sat 9 am–6 pm. No renovation on Sundays or public holidays.',
      'Noisy / demolition work (hacking, drilling, tiling): weekdays 9 am–5 pm only — not on weekends or public holidays.',
      'Renovation must be completed within the HDB-permitted window (typically 3 months from the permit start).',
      'Excessive noise / out-of-hours work can draw complaints and HDB fines; notify neighbours in advance.',
    ],
    source: 'renovationcontractorsingapore.com',
  },
  {
    id: 'permits-drc',
    title: 'Permits & DRC checklist',
    points: [
      'Engage an HDB-registered Directory of Renovation Contractors (DRC) contractor for HDB flats.',
      'Apply for an HDB renovation permit before starting any works that need one (hacking, wet-area, electrical, windows).',
      'Structural / load-bearing wall works need a PE endorsement and BCA/HDB approval — never hack a structural or RC wall.',
      'Display the approved permit at the unit; keep contractor licence, insurance and as-built documents for handover.',
    ],
    source: 'propertyguru.com.sg',
  },
] as const
