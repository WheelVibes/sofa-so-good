import type { Pack } from './types';
import { parseKenneyFurnitureKit } from './parsers';

export const AVAILABLE_PACKS: Pack[] = [
  {
    id: 'kenney-furniture-kit',
    name: 'Kenney Furniture Kit',
    description:
      'Stylized low-poly furniture — bedrooms, kitchens, bathrooms, lounges, decor (~125 items).',
    attribution: 'Kenney — kenney.nl (CC0)',
    license: 'CC0',
    sourceUrl: 'https://kenney.nl/assets/furniture-kit',
    downloadUrl:
      '/kenney/media/pages/assets/furniture-kit/e56d2a9828-1677580847/kenney_furniture-kit.zip',
    sizeBytes: 5_130_729,
    parseEntries: parseKenneyFurnitureKit,
  },
];
