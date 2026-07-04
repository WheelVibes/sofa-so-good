import * as THREE from 'three'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js'
import { BLOCKED_RESOURCE_FALLBACK, isEmbeddedOrBlobUrl } from '../gltf/loaderSecurity'
import type { ModelFormat } from './formats'

/**
 * A pool of sibling files from the dropped folder, exposed as blob URLs so
 * loaders that reference external files (OBJ→MTL→tex, DAE→tex, glTF→bin/tex)
 * resolve them locally instead of hitting the network.
 */
export interface SiblingPool {
  /** basename(lowercased) → object URL */
  urls: Map<string, string>
  /** the entry file's own object URL */
  entryUrl: string
}

/** A LoadingManager that rewrites requested URLs to sibling blob URLs by
 *  basename; unknown refs fall back to a blank texture (SEC-1 — this is a
 *  closed allowlist: a dropped model can only ever resolve to a file also
 *  dropped alongside it, never an arbitrary network URL, foreign or not —
 *  `isEmbeddedOrBlobUrl`/`BLOCKED_RESOURCE_FALLBACK` are the same primitives
 *  the runtime render-loader policy in `gltf/loaderSecurity.ts` shares). */
function managerFor(pool: SiblingPool): THREE.LoadingManager {
  const mgr = new THREE.LoadingManager()
  mgr.setURLModifier((url) => {
    if (isEmbeddedOrBlobUrl(url)) return url
    const base = (url.split('/').pop() ?? url).toLowerCase()
    return pool.urls.get(base) ?? BLOCKED_RESOURCE_FALLBACK
  })
  return mgr
}

function meshFromGeometry(geom: THREE.BufferGeometry, vertexColors = false): THREE.Mesh {
  return new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xcccccc, vertexColors }))
}

/**
 * Collect every `.mtl` referenced by an OBJ's `mtllib` directives, lowercased
 * to their basename (IO-010). A valid OBJ may list several files on one line
 * (`mtllib a.mtl b.mtl`) and/or repeat `mtllib` across lines; the old parser
 * took only the first token of the first line, silently dropping the rest of
 * the materials. Order-preserving + de-duplicated. (Filenames containing spaces
 * — rare — are not disambiguated from multi-file lines; whitespace splits them.)
 */
export function parseMtllibNames(objText: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of objText.matchAll(/^\s*mtllib\s+(.+)$/gm)) {
    for (const tok of m[1].trim().split(/\s+/)) {
      const base = (tok.split('/').pop() ?? '').toLowerCase()
      if (base && !seen.has(base)) {
        seen.add(base)
        out.push(base)
      }
    }
  }
  return out
}

/** Load `pool.entryUrl` for the given format into an Object3D, resolving any
 *  referenced sibling files (materials/textures/buffers) through the pool. */
export async function loadToObject(
  format: ModelFormat,
  pool: SiblingPool,
): Promise<THREE.Object3D> {
  const mgr = managerFor(pool)
  switch (format) {
    case 'glb':
    case 'gltf': {
      const g = await new GLTFLoader(mgr).loadAsync(pool.entryUrl)
      return g.scene
    }
    case 'obj': {
      // Resolve EVERY referenced .mtl present in the pool, merging their
      // material definitions so an OBJ that splits materials across multiple
      // .mtl files (or lists several per `mtllib` line) keeps them all (IO-010).
      const objText = await (await fetch(pool.entryUrl)).text()
      const loader = new OBJLoader(mgr)
      const mtlLoader = new MTLLoader(mgr)
      let merged: MTLLoader.MaterialCreator | null = null
      for (const name of parseMtllibNames(objText)) {
        const mtlUrl = pool.urls.get(name)
        if (!mtlUrl) continue
        const creator = await mtlLoader.loadAsync(mtlUrl)
        if (!merged) merged = creator
        else
          Object.assign(
            (merged as unknown as { materialsInfo: Record<string, unknown> }).materialsInfo,
            (creator as unknown as { materialsInfo: Record<string, unknown> }).materialsInfo,
          )
      }
      if (merged) {
        merged.preload()
        loader.setMaterials(merged)
      }
      return await loader.loadAsync(pool.entryUrl)
    }
    case 'fbx':
      return await new FBXLoader(mgr).loadAsync(pool.entryUrl)
    case 'stl':
      return meshFromGeometry(await new STLLoader(mgr).loadAsync(pool.entryUrl))
    case 'ply': {
      const geom = await new PLYLoader(mgr).loadAsync(pool.entryUrl)
      geom.computeVertexNormals()
      return meshFromGeometry(geom, !!geom.getAttribute('color'))
    }
    case 'dae': {
      const collada = await new ColladaLoader(mgr).loadAsync(pool.entryUrl)
      if (!collada?.scene) throw new Error('Collada file has no scene')
      return collada.scene
    }
    case '3ds':
      // Legacy 3D Studio (SweetHome3DJS Max3DSLoader parity). Sibling textures
      // resolve through the manager like OBJ/DAE.
      return await new TDSLoader(mgr).loadAsync(pool.entryUrl)
    case '3mf':
      return await new ThreeMFLoader(mgr).loadAsync(pool.entryUrl)
    case 'usdz':
      return await new USDZLoader(mgr).loadAsync(pool.entryUrl)
  }
}
