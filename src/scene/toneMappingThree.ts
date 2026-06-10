/**
 * Maps the pure {@link ToneMappingMode} look (from `look.ts`) to the concrete
 * three.js `ToneMapping` constant. Kept in its own three-aware module so
 * `look.ts` stays pure/unit-testable while `Scene`/`Lighting` resolve the
 * renderer constant from one place.
 */
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, type ToneMapping } from 'three'
import type { ToneMappingMode } from './look'

export const TONE_MAPPING_THREE: Record<ToneMappingMode, ToneMapping> = {
  filmic: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
}
