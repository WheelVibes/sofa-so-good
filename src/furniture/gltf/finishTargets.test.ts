import { describe, it, expect } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { listFinishTargets } from './finishTargets';

function meshNamed(name: string, matName: string): Mesh {
  const mat = new MeshStandardMaterial();
  mat.name = matName;
  const m = new Mesh(new BoxGeometry(), mat);
  m.name = name;
  return m;
}

describe('listFinishTargets', () => {
  it('lists unique material-group names from a GLTF scene', () => {
    const root = new Group();
    root.add(meshNamed('frame', 'Wood'));
    root.add(meshNamed('legs', 'Wood'));
    root.add(meshNamed('cushion', 'Fabric'));
    const targets = listFinishTargets(root);
    expect(targets.map((t) => t.key).sort()).toEqual(['Fabric', 'Wood']);
  });

  it('falls back to mesh names when materials are unnamed', () => {
    const root = new Group();
    root.add(meshNamed('seat', ''));
    const targets = listFinishTargets(root);
    expect(targets[0].key).toBe('seat');
  });
});
