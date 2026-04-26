import { z } from 'zod';

const FURNITURE_CATEGORIES = [
  'beds',
  'seating',
  'tables',
  'storage',
  'kitchen',
  'lighting',
  'decor',
] as const;

export const furnitureManifestSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['kenney', 'polyhaven', 'quaternius', 'ambientcg']),
  sourceUrl: z.string().url(),
  downloadUrl: z.string().url(),
  license: z.literal('CC0'),
  attribution: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(FURNITURE_CATEGORIES),
  footprint: z.object({
    w: z.number().positive(),
    d: z.number().positive(),
    h: z.number().positive(),
  }),
  scale: z.number().positive().default(1.0),
  anchor: z.enum(['floor-center', 'origin']).default('floor-center'),
});

export type FurnitureManifestEntry = z.infer<typeof furnitureManifestSchema>;

export const materialManifestSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['polyhaven', 'ambientcg']),
  sourceUrl: z.string().url(),
  downloads: z.object({
    albedo: z.string().url(),
    normal: z.string().url().optional(),
    rough: z.string().url().optional(),
    ao: z.string().url().optional(),
  }),
  license: z.literal('CC0'),
  attribution: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['floor', 'wall']),
  uvScale: z.tuple([z.number().positive(), z.number().positive()]),
});

export type MaterialManifestEntry = z.infer<typeof materialManifestSchema>;

export const furnitureManifestFile = z.array(furnitureManifestSchema);
export const materialManifestFile = z.array(materialManifestSchema);
