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

/** 1×1 transparent PNG — stands in for any missing referenced texture so a
 *  broken/absent map never blocks the whole conversion. */
const BLANK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** A LoadingManager that rewrites requested URLs to sibling blob URLs by
 *  basename; unknown refs fall back to a blank texture. */
function managerFor(pool: SiblingPool): THREE.LoadingManager {
  const mgr = new THREE.LoadingManager()
  mgr.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    const base = (url.split('/').pop() ?? url).toLowerCase()
    return pool.urls.get(base) ?? BLANK_PNG
  })
  return mgr
}

function meshFromGeometry(geom: THREE.BufferGeometry, vertexColors = false): THREE.Mesh {
  return new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xcccccc, vertexColors }))
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
      // Resolve the referenced .mtl if it's present in the pool.
      const objText = await (await fetch(pool.entryUrl)).text()
      const mtlMatch = objText.match(/^\s*mtllib\s+(.+)$/m)
      const loader = new OBJLoader(mgr)
      if (mtlMatch) {
        const mtlBase = (mtlMatch[1].trim().split(/\s+/)[0].split('/').pop() ?? '').toLowerCase()
        const mtlUrl = pool.urls.get(mtlBase)
        if (mtlUrl) {
          const mtl = await new MTLLoader(mgr).loadAsync(mtlUrl)
          mtl.preload()
          loader.setMaterials(mtl)
        }
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
