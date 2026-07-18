import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const uiRoot = dirname(fileURLToPath(import.meta.url))
const FLAGGED =
  /\b(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginTop|marginBottom|marginLeft|marginRight|fontSize|gap|rowGap|columnGap)\s*:\s*('[^']*\d[^']*'|"[^"]*\d[^"]*"|\d[\d.]*)/g
// Files with pre-existing literals, grandfathered as follow-up (NEW files must be clean).
// The floorplan/editor/* REFAC-2 entries below are verbatim behaviour-preserving code-motion out
// of the already-grandfathered `floorplan/FloorPlanEditor.tsx` — same follow-up as the MOD-FPE-SPLIT
// layer extractions (DimensionsLayer/FurnitureLayer/NotesLayer/TourStopsLayer) already listed here.
const GRANDFATHERED = new Set<string>([
  'BudgetPanel.tsx',
  'ClearancePanel.tsx',
  'CommentsPanel.tsx',
  'DaylightPanel.tsx',
  'DesignScorePanel.tsx',
  'DrawingCalloutsPanel.tsx',
  'EmptyRoomHint.tsx',
  'FlagsPanel.tsx',
  'FuzzyCombo.tsx',
  'GraphicsSettings.tsx',
  'HistoryPanel.tsx',
  'HqRenderModal.tsx',
  'PresentationMode.tsx',
  'RoomEditorCaption.tsx',
  'ShareModal.tsx',
  'StagingRevealModal.tsx',
  'StyleQuizModal.tsx',
  'StyleTransferModal.tsx',
  'VersionsPanel.tsx',
  'ai/AiPhotorealSection.tsx',
  'auth/LoginScreen.tsx',
  'catalog/CatalogCard.tsx',
  'catalog/CatalogDrawer.tsx',
  'catalog/RemoteCard.tsx',
  'color/MasterPaletteEditor.tsx',
  'color/ThemeColorRows.tsx',
  'configurator/ConfiguratorDialog.tsx',
  'controls/ColorPicker.tsx',
  'finish/swatches.tsx',
  'floorplan/FloorPlanEditor.tsx',
  'floorplan/PlanFurnitureInspector.tsx',
  'floorplan/PlanInspector.tsx',
  'floorplan/editor/DrawToolPalette.tsx',
  'floorplan/editor/GridZoomControls.tsx',
  'floorplan/editor/LevelMenu.tsx',
  'floorplan/editor/PlanToolMenu.tsx',
  'floorplan/editor/PlanTotalLabel.tsx',
  'floorplan/editor/WallNumericEntry.tsx',
  'floorplan/editor/inspector/OpeningInspector.tsx',
  'floorplan/editor/inspector/RoomInspector.tsx',
  'floorplan/editor/layers/AnnotationsLayer.tsx',
  'floorplan/editor/layers/DimensionsLayer.tsx',
  'floorplan/editor/layers/FurnitureLayer.tsx',
  // MEP glyph text sizes are SVG user units inside the zooming plan canvas
  // (same class as the sibling layers above), not CSS px.
  'floorplan/editor/layers/MepLayer.tsx',
  'floorplan/editor/layers/NotesLayer.tsx',
  'floorplan/editor/layers/TourStopsLayer.tsx',
  'glbEditor/GlbDesignerDialog.tsx',
  // Asset Studio S0 dialog decomposition: these modules hold inline-px values
  // relocated verbatim from the (already-grandfathered) GlbDesignerDialog during
  // a behaviour-preserving extraction — not newly-introduced literals.
  'glbEditor/CombinePanel.tsx',
  'glbEditor/LayersPanel.tsx',
  'glbEditor/SavePanel.tsx',
  'glbEditor/SourcePanel.tsx',
  'glbEditor/PartInspector.tsx',
  'inspector/InspectorPanel.tsx',
  'inspector/InspectorSection.tsx',
  'inspector/ItemPhysicalControls.tsx',
  'inspector/LinearArraySection.tsx',
  'inspector/PathArraySection.tsx',
  'inspector/RadialArraySection.tsx',
  'inspector/ScatterFillSection.tsx',
  'lighting2d/LuxLegend.tsx',
  'loading/LoadingOverlay.tsx',
  'notifications/NotificationContainer.tsx',
  'panorama/PanoTourModal.tsx',
  'parametric/DimField.tsx',
  'parametric/ParametricControls.tsx',
  'parametric/ParametricDialog.tsx',
  'presentation/PresentationSetup.tsx',
  'toolbar/AppearancePopover.tsx',
  'toolbar/menus/SavedViewsSection.tsx',
  'toolbar/menus/SceneMenu.tsx',
  'toolbar/mobile/ViewSection.tsx',
  'tour/ProductTour.tsx',
  'walk/WalkCameraControls.tsx',
  'wizard/SmartStartWizard.tsx',
])

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return walk(p)
    return n.endsWith('.tsx') && !n.endsWith('.test.tsx') ? [p] : []
  })

const offenders = (src: string): string[] => {
  const hits: string[] = []
  for (const m of src.matchAll(FLAGGED)) {
    const val = m[2]
    if (val.includes('var(--') || val.includes('${') || val === '0') continue
    hits.push(m[0])
  }
  return hits
}

describe('P9 inline-px guard', () => {
  it('no NEW literal px/number padding/margin/fontSize/gap in inline styles', () => {
    const bad: string[] = []
    for (const file of walk(uiRoot)) {
      const rel = relative(uiRoot, file)
      if (GRANDFATHERED.has(rel)) continue
      const hits = offenders(readFileSync(file, 'utf8'))
      if (hits.length) bad.push(`${rel}: ${hits.join(', ')}`)
    }
    expect(
      bad,
      `Use --s-N/--t-N tokens (or add to GRANDFATHERED with a reason):\n${bad.join('\n')}`,
    ).toEqual([])
  })
  it('the four re-audited files are clean (removed from the grandfather set)', () => {
    for (const f of [
      'ElevationPanel.tsx',
      'RenderCompareModal.tsx',
      'LocationPrompt.tsx',
      'FinishPicker.tsx',
    ]) {
      expect(GRANDFATHERED.has(f)).toBe(false)
      expect(offenders(readFileSync(join(uiRoot, f), 'utf8'))).toEqual([])
    }
  })
})
