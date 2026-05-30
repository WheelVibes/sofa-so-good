import type { IkeaGltfDef, IkeaVariant, IkeaProductInfo, IkeaGlbMaterial } from '../types';
import type { IkeaMetadata, IkeaMetadataVariant } from './metadata';
import { IdbAssetStore } from '../../state/storage/IdbAssetStore';
import { useStore } from '../../state/store';
import { validateGlbFile } from '../upload/validate';
import { seedGltfFootprint } from '../GltfModel';
import { mapCategory, placementFlags, titleCaseFinish } from './translate';

const IKEA_MAX_BYTES = 50 * 1024 * 1024;

export type ImportGroupResult =
  | { ok: true; def: IkeaGltfDef }
  | { ok: false; reason: string };

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `asset-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

/** Map the scraper's per-GLB materials to our finish-target descriptors. The
 *  scraper may emit unnamed materials; keep an empty `name` for those — they
 *  can't be matched to a real GLB material name, so the per-component recolour
 *  UI filters them out (a name-based override would silently do nothing). Real
 *  names (including a real `material_0`) are preserved verbatim. */
function matsFrom(v: IkeaMetadataVariant): IkeaGlbMaterial[] {
  return (v.glb_materials ?? []).map((m) => ({
    name: m.name ?? '',
    hex: m.hex ?? '#ffffff',
    metallic: m.metallic ?? 1,
    roughness: m.roughness ?? 1,
    textured: m.textured ?? false,
    sampledHex: m.sampled_hex,
  }));
}

function fileByBasename(files: File[], basename: string): File | undefined {
  return files.find((f) => {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    return (path.split('/').pop() ?? f.name) === basename;
  });
}

/** Build + register one IkeaGltfDef from parsed metadata + the group's files.
 *  Writes each crawled finish's GLB to IDB; stub finishes (glb:null or a
 *  missing/invalid file) become greyed variants with a null assetId. The
 *  active variant is the first finish whose blob was actually written; the
 *  whole import only fails when no blob was written at all. Pre-seeds the
 *  active variant's footprint cache so collision is correct before render. */
export async function importGroup(meta: IkeaMetadata, files: File[]): Promise<ImportGroupResult> {
  const { category, confidence } = mapCategory(meta.design.category);

  const variants: IkeaVariant[] = [];
  let wroteOne = false;
  let activeMeta: IkeaMetadataVariant | undefined;
  for (const v of meta.variants) {
    // single-SKU products (e.g. a knob) carry no colour finish — synthesise a
    // stable key from the article number so dedupe + active selection work.
    const finishKey = v.finish ?? `variant-${v.article_number}`;
    let assetId: string | null = null;
    let runtimeUrl: string | undefined;
    if (v.glb) {
      const file = fileByBasename(files, v.glb);
      if (file) {
        const valid = await validateGlbFile(file, { maxBytes: IKEA_MAX_BYTES });
        if (valid.ok) {
          assetId = newId();
          const blob = new Blob([await file.arrayBuffer()], { type: valid.mime });
          await IdbAssetStore.put({
            assetId, kind: 'gltf', mime: valid.mime, name: `${meta.product_name} — ${finishKey}`,
            uploadedAt: new Date().toISOString(), blob,
            meta: { source: 'ikea', groupKey: meta.group_key, articleNumber: v.article_number, finish: v.finish },
          });
          runtimeUrl = URL.createObjectURL(blob);
          wroteOne = true;
          if (!activeMeta) activeMeta = v;
        }
      }
    }
    variants.push({
      finish: finishKey,
      label: titleCaseFinish(v.finish ?? v.product_title ?? v.article_number),
      articleNumber: v.article_number,
      url: v.url,
      assetId,
      runtimeUrl,
      price: v.price_numeral,
      currency: v.currency,
      swatchHex: v.glb_materials?.[0]?.sampled_hex,
      footprint: v.footprint
        ? { w: v.footprint.w, d: v.footprint.d, h: v.footprint.h, anchorOffset: v.footprint.anchor_offset }
        : undefined,
      glbMaterials: matsFrom(v),
    });
  }

  if (!wroteOne) return { ok: false, reason: 'No crawled GLB file matched the metadata variants.' };

  const active = variants.find((v) => v.assetId)!;
  if (active.runtimeUrl && active.footprint) seedGltfFootprint(active.runtimeUrl, active.footprint);

  const flags = placementFlags(meta.design, active.footprint ? { h: active.footprint.h } : undefined);
  const fp = active.footprint ?? { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] as [number, number, number] };

  const productInfo: IkeaProductInfo = {
    series: meta.series, styleGroup: meta.style_group, typeName: meta.type_name,
    designer: meta.designer, description: meta.description, goodToKnow: meta.good_to_know,
    categoryHierarchy: meta.category_hierarchy, size: meta.size ?? undefined,
    productMeasurements: meta.product_measurements,
    materials: activeMeta?.materials, careInstructions: activeMeta?.care_instructions,
    documents: activeMeta?.documents, rating: activeMeta?.rating,
    mainImageUrl: activeMeta?.main_image_url, contextualImageUrl: activeMeta?.contextual_image_url,
    categoryConfidence: meta.design.category_confidence ?? confidence,
  };

  const def: IkeaGltfDef = {
    id: `ikea-${meta.group_key}`,
    name: meta.product_name,
    category,
    kind: 'gltf',
    source: 'ikea',
    groupKey: meta.group_key,
    activeVariant: active.finish,
    variants,
    defaultFootprint: { w: fp.w, d: fp.d, h: fp.h },
    ...(flags.mounted ? { mounted: true } : {}),
    ...(flags.noClip ? { noClip: true } : {}),
    ...(flags.verticalSpan ? { verticalSpan: flags.verticalSpan } : {}),
    ...(flags.frontClearance ? { frontClearance: flags.frontClearance } : {}),
    productInfo,
    compatibility: meta.compatibility
      ? { acceptsCategories: meta.compatibility.accepts_categories, size: meta.compatibility.size ?? undefined }
      : undefined,
    uploadedAt: new Date().toISOString(),
    license: 'IKEA',
    attribution: 'IKEA — imported model',
    sourceUrl: active.url,
  };

  // Replace an existing import of the same group (dedupe by id).
  const existing = useStore.getState().userFurniture.find((d) => d.id === def.id);
  if (existing) useStore.getState().removeUserFurniture(def.id);
  useStore.getState().addUserFurniture(def);
  return { ok: true, def };
}
