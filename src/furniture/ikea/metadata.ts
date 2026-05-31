import { z } from 'zod';

const GlbMaterialZ = z.object({
  // some scraped GLBs have unnamed materials
  name: z.string().optional(),
  hex: z.string().optional(),
  metallic: z.number().optional(),
  roughness: z.number().optional(),
  textured: z.boolean().optional(),
  sampled_hex: z.string().optional(),
}).passthrough();

const VariantZ = z.object({
  article_number: z.string(),
  // single-SKU products (e.g. a knob) have no colour finish
  finish: z.string().optional(),
  url: z.string(),
  product_title: z.string().optional(),
  price_numeral: z.number().optional(),
  currency: z.string().optional(),
  rating: z.object({ value: z.number(), max: z.number(), count: z.number() }).optional(),
  materials: z.array(z.object({ part: z.string(), composition: z.string() })).optional(),
  care_instructions: z.string().optional(),
  documents: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  main_image_url: z.string().optional(),
  contextual_image_url: z.string().optional(),
  main_image: z.string().nullable().optional(),
  context_image: z.string().nullable().optional(),
  glb: z.string().nullable(),
  footprint: z.object({
    w: z.number(), d: z.number(), h: z.number(),
    anchor_offset: z.tuple([z.number(), z.number(), z.number()]),
  }).optional(),
  glb_materials: z.array(GlbMaterialZ).optional(),
  // scraper emits null when segment→material mapping is unresolved
  glb_segments: z.array(z.object({ mesh: z.string().nullable(), material: z.string().nullable() })).optional(),
}).passthrough();

const DesignZ = z.object({
  category: z.string(),
  category_confidence: z.enum(['high', 'low']).optional(),
  placement: z.enum(['floor', 'wall', 'ceiling', 'surface']),
  semantics: z.object({
    back_to_wall: z.boolean().optional(),
    front_clearance_m: z.number().optional(),
    mounted: z.boolean().optional(),
    no_clip: z.boolean().optional(),
  }).optional(),
}).passthrough();

export const IkeaMetadataZ = z.object({
  group_key: z.string(),
  product_name: z.string(),
  type_name: z.string().optional(),
  size: z.string().nullable().optional(),
  series: z.string().optional(),
  style_group: z.string().optional(),
  designer: z.string().optional(),
  description: z.string().optional(),
  good_to_know: z.array(z.string()).optional(),
  category_hierarchy: z.array(z.string()).optional(),
  design: DesignZ,
  product_measurements: z.record(z.string(), z.string()).optional(),
  compatibility: z.object({
    accepts_categories: z.array(z.string()),
    size: z.string().nullable().optional(),
    example_products: z.array(z.unknown()).optional(),
  }).optional(),
  variants: z.array(VariantZ).min(1),
}).passthrough();

export type IkeaMetadata = z.infer<typeof IkeaMetadataZ>;
export type IkeaMetadataVariant = z.infer<typeof VariantZ>;

export type ParseResult =
  | { ok: true; data: IkeaMetadata }
  | { ok: false; reason: string };

/** True when an object looks like an IKEA group metadata.json (has group_key
 *  and variants) — used to auto-detect the import path. */
export function looksLikeIkeaMetadata(json: unknown): boolean {
  return !!json && typeof json === 'object'
    && typeof (json as { group_key?: unknown }).group_key === 'string'
    && Array.isArray((json as { variants?: unknown }).variants);
}

export function parseMetadata(json: unknown): ParseResult {
  const r = IkeaMetadataZ.safeParse(json);
  if (!r.success) return { ok: false, reason: r.error.issues[0]?.message ?? 'invalid metadata' };
  return { ok: true, data: r.data };
}
