import { describe, it, expect } from 'vitest';
import { findMetadataFile } from './detectGroup';

function jsonFile(name: string, obj: unknown): File {
  return new File([JSON.stringify(obj)], name, { type: 'application/json' });
}
describe('findMetadataFile', () => {
  it('finds metadata.json with group_key among picked files', async () => {
    const files = [
      new File([new Uint8Array(4)], 'black-brown.glb'),
      jsonFile('metadata.json', { group_key: 'malm', variants: [] }),
    ];
    const r = await findMetadataFile(files);
    expect(r?.group_key).toBe('malm');
  });
  it('returns null when no ikea metadata present', async () => {
    const files = [new File([new Uint8Array(4)], 'model.glb')];
    expect(await findMetadataFile(files)).toBeNull();
  });
});
