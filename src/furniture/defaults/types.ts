import type { FurnitureItem } from '../types';

/** Layout entry: same shape as a FurnitureItem but with a deterministic
 *  id so re-running resetToDefault is idempotent. */
export type LayoutEntry = FurnitureItem;
