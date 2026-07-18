import { useState } from 'react'
import { useFeature } from '../../features/useFeature'
import { type BriefMatch, parseBrief } from '../../furniture/briefParser'
import type { LayoutPreset } from '../../furniture/layoutPresets'
import { LAYOUT_PRESETS } from '../../furniture/layoutPresets'
import { BUILTIN_MATERIALS } from '../../materials/builtinCatalog'
import type { ThemeName } from '../../state/slices/appearanceSlice'
import { useStore } from '../../state/store'
import { Modal } from '../Modal'

/**
 * Smart Start — a friendly, onboarding-style front end over the existing layout
 * presets (`applyLayoutPreset`): pick a style and the flat is furnished + the
 * walls/floors finished in one click, with a complementary UI theme applied to
 * match. Heuristic, not AI (honestly labelled). Launchable from onboarding, the
 * command palette, and the toolbar Arrange menu.
 */

/** Complementary UI theme per layout preset, so the chrome matches the room. */
/** Resolve a finish id (a material id, or a raw `#hex` colour) to a CSS colour
 *  for the preview swatch — falls back to a neutral surface token if unknown. */
function swatchColor(id: string | undefined, fallback: string): string {
  if (!id) return fallback
  if (id.startsWith('#')) return id
  return BUILTIN_MATERIALS[id]?.swatch ?? fallback
}

const PRESET_THEME: Record<string, ThemeName> = {
  'move-in': 'clay',
  'scandi-calm': 'porcelain',
  'warm-industrial': 'estate',
  'cozy-tropical': 'kampong',
  japandi: 'clay',
  'modern-luxe': 'estate',
  minimalist: 'porcelain',
  'peranakan-accent': 'kampong',
  coastal: 'porcelain',
  'open-lounge': 'estate',
}

/** The curated 2025-26 SG theme gallery (RM2 `group: 'theme'`) — SmartStart's
 *  primary grid. */
const themePresets = LAYOUT_PRESETS.filter((p) => p.group === 'theme')
/** Re-modelled living/dining layout variants (RM2 `group: 'layout'`) —
 *  demoted to a secondary section (a layout tweak, not a full cosmetic
 *  theme). Presets with no `group` (fading coastal/modernMono) show in
 *  neither section but stay resolvable by id + the text-brief matcher. */
const layoutPresets = LAYOUT_PRESETS.filter((p) => p.group === 'layout')

function PresetCard({
  preset,
  picked,
  onPick,
}: {
  preset: LayoutPreset
  picked: string
  onPick: (id: string) => void
}) {
  const on = picked === preset.id
  return (
    <button
      type="button"
      className={`ss-card${on ? ' on' : ''}`}
      onClick={() => onPick(preset.id)}
      aria-pressed={on}
    >
      <span className="ss-card-name">{preset.name}</span>
      <span className="ss-card-desc">{preset.description}</span>
      <span className="ss-card-swatches">
        <i style={{ background: swatchColor(preset.dryFloor, 'var(--surface-2)') }} />
        <i style={{ background: swatchColor(preset.wall, 'var(--surface)') }} />
      </span>
    </button>
  )
}

export function SmartStartWizard() {
  const open = useStore((s) => s.smartStartOpen)
  const setOpen = useStore((s) => s.setSmartStartOpen)
  const current = useStore((s) => s.theme)
  const fTextBrief = useFeature('textBrief')
  const [picked, setPicked] = useState<string>(LAYOUT_PRESETS[0]?.id ?? 'move-in')
  const [brief, setBrief] = useState('')
  // Last brief-match result: a match (highlight + budget chip), 'none'
  // (honest "couldn't match"), or null (no attempt yet / brief edited).
  const [briefMatch, setBriefMatch] = useState<BriefMatch | 'none' | null>(null)

  const matchBrief = () => {
    const m = parseBrief(brief, LAYOUT_PRESETS)
    setBriefMatch(m ?? 'none')
    if (m) setPicked(m.presetId)
  }

  const apply = () => {
    const s = useStore.getState()
    s.pushHistory()
    s.applyLayoutPreset(picked)
    const theme = PRESET_THEME[picked]
    if (theme) s.setTheme(theme)
    // A budget parsed from the brief seeds the budget target (only when the
    // brief actually drove the applied pick).
    if (
      briefMatch &&
      briefMatch !== 'none' &&
      briefMatch.presetId === picked &&
      briefMatch.budget != null
    ) {
      s.setBudgetTarget(briefMatch.budget)
    }
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Smart Start"
      sub="Furnish your flat"
      width={460}
      panelId="smart-start"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Skip
          </button>
          <button type="button" className="btn btn-accent" onClick={apply}>
            Furnish my flat
          </button>
        </div>
      }
    >
      <p
        className="panel-sub"
        style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 10 }}
      >
        Pick a style — we’ll furnish every room and finish the walls &amp; floors to match. You can
        tweak anything afterwards.
      </p>
      {fTextBrief ? (
        <div style={{ marginBottom: 10 }}>
          <label className="label" htmlFor="ss-brief" style={{ display: 'block', marginBottom: 4 }}>
            Or describe it
          </label>
          <textarea
            id="ss-brief"
            className="input"
            rows={2}
            placeholder="e.g. calm japandi for a young couple, light woods, budget $15k"
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value)
              setBriefMatch(null)
            }}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 6,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="btn btn-sm"
              onClick={matchBrief}
              disabled={!brief.trim()}
            >
              Match my brief
            </button>
            {briefMatch === 'none' ? (
              <span className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Couldn’t match that — pick a style below.
              </span>
            ) : briefMatch ? (
              <span className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Matched: {briefMatch.matchedTerms.slice(0, 4).join(', ')}
                {briefMatch.budget != null
                  ? ` · budget $${briefMatch.budget.toLocaleString()}`
                  : ''}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 4 }}>
        Styles
      </p>
      <div className="ss-grid">
        {themePresets.map((p) => (
          <PresetCard key={p.id} preset={p} picked={picked} onPick={setPicked} />
        ))}
      </div>
      {layoutPresets.length > 0 ? (
        <>
          <p
            className="panel-sub"
            style={{ textTransform: 'none', letterSpacing: 0, marginTop: 12 }}
          >
            Layouts (re-modelled living/dining arrangements)
          </p>
          <div className="ss-grid">
            {layoutPresets.map((p) => (
              <PresetCard key={p.id} preset={p} picked={picked} onPick={setPicked} />
            ))}
          </div>
        </>
      ) : null}
      <p
        className="panel-sub"
        style={{ textTransform: 'none', letterSpacing: 0, marginTop: 10, opacity: 0.7 }}
      >
        Applies to the current apartment shell. Theme: <b>{PRESET_THEME[picked] ?? current}</b>.
      </p>
    </Modal>
  )
}
