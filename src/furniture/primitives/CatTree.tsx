import { useEffect, useMemo } from 'react'
import { MeshStandardMaterial, RepeatWrapping } from 'three'
import { getFabricMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'
import { getSisalTexture } from './sisalTexture'
import { seg, useDetail } from './useDetail'

/**
 * Cat tree (parametric) — a floor-standing multi-tier climbing frame. A heavy
 * base slab anchors `tiers` (2–5) plush platforms rising to `height`; each
 * platform is carried by a sisal-wrapped post that reaches down onto the
 * platform (or base) below it, so every member connects (structural-soundness
 * rule). Platforms stagger left/right within the base footprint envelope so the
 * frame stays balanced (its centre of mass over the base) yet reads like a real
 * cat tree. Optional cosy house cube on a middle tier and a raised top perch.
 * Floor-anchored, footprint-centred, faces +Z. Real metres.
 */
const BASE_T = 0.05 // base slab thickness
const PLAT_T = 0.045 // platform thickness
const POST_R = 0.032 // sisal post radius
const FIRST_CLEAR = 0.28 // gap from base top to the first platform

export function CatTree({ props }: { props: ParamProps }) {
  const tiers = Math.max(2, Math.min(5, Math.round(readNum(props, 'tiers', 3))))
  const height = readNum(props, 'height', 1.4)
  const baseW = readNum(props, 'baseWidth', 0.5)
  const postStyle = readStr(props, 'postStyle', 'sisal')
  const plush = readStr(props, 'plushColor', '#c8bda8')
  const postColor = readStr(props, 'postColor', '#c9a875')
  const withHouse = readStr(props, 'house', 'yes')
  const withPerch = readStr(props, 'topPerch', 'yes')
  const detail = useDetail()
  const r = seg(20, detail)

  const baseD = baseW
  const platW = Math.min(0.4, Math.max(0.3, baseW * 0.72)) // 30–40 cm platform
  // Stagger step: bounded so a platform's centre + its post stay over the base
  // footprint (stability) and consecutive platforms overlap (post lands on one).
  const stagger = Math.min(0.09, (baseW - platW) / 2 + 0.04)

  const plushMat = getFabricMaterial(plush, 0.95)

  // Layout: platform centres from just above the base to `height`, staggered.
  // With the perch on, the top platform drops by the perch rim's rise so the
  // whole tree (rim included) stays within the declared `height`/verticalSpan.
  const levels = useMemo(() => {
    const bottom = BASE_T + FIRST_CLEAR // first platform clears the base
    const perchRise = withPerch === 'yes' ? 0.08 : 0
    const top = Math.max(bottom + 0.2, height - PLAT_T - perchRise)
    const out: { y: number; x: number; z: number }[] = []
    for (let i = 0; i < tiers; i++) {
      const f = tiers === 1 ? 0 : i / (tiers - 1)
      const y = bottom + (top - bottom) * f
      // Alternate the horizontal offset so the stack zig-zags but each platform
      // still overlaps the one below (|Δx| = stagger < platW/2).
      const x = (i % 2 === 0 ? -1 : 1) * (i === 0 ? 0 : stagger)
      const z = (i % 2 === 0 ? 1 : -1) * (i === 0 ? 0 : stagger * 0.6)
      out.push({ y, x, z })
    }
    return out
  }, [tiers, height, stagger, withPerch])

  // One shared post material — sisal rope texture (tint rides the texture) or a
  // plain ribbed-cylinder look. Coil pitch keyed off the mean segment height so
  // every post shares one GPU material.
  const postMat = useMemo(() => {
    if (postStyle === 'ribbed') {
      return new MeshStandardMaterial({ color: postColor, roughness: 0.85, metalness: 0 })
    }
    const meanSeg = Math.max(0.12, (height - BASE_T - FIRST_CLEAR) / Math.max(1, tiers - 1))
    const coils = Math.max(2, Math.round(meanSeg / 0.08))
    const tex = getSisalTexture(postColor).clone()
    tex.wrapS = tex.wrapT = RepeatWrapping
    tex.repeat.set(1, coils)
    tex.needsUpdate = true
    return new MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 })
  }, [postStyle, postColor, height, tiers])
  // Dispose the material + its per-param sisal clone on param change + unmount
  // (the clone owns its own GPU upload, distinct from the shared base texture).
  useEffect(
    () => () => {
      postMat.map?.dispose()
      postMat.dispose()
    },
    [postMat],
  )

  const posts = useMemo(() => {
    return levels.map((lvl, i) => {
      const below = i === 0 ? { y: BASE_T } : levels[i - 1]
      const postTop = lvl.y - PLAT_T / 2
      const postBottom = below.y + (i === 0 ? 0 : PLAT_T / 2)
      const segH = Math.max(0.05, postTop - postBottom)
      return { y: postBottom + segH / 2, x: lvl.x, z: lvl.z, h: segH }
    })
  }, [levels])

  return (
    <group>
      {/* Heavy base slab (keeps the tree from tipping). */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, BASE_T / 2, 0]}
        material={plushMat}
        args={[baseW, BASE_T, baseD]}
      />
      {/* Posts: each connects the platform below (or the base top) to this one. */}
      {posts.map((p, i) => (
        <mesh
          key={`post${i}`}
          castShadow
          receiveShadow
          position={[p.x, p.y, p.z]}
          material={postMat}
        >
          <cylinderGeometry args={[POST_R, POST_R, p.h, Math.max(12, r)]} />
        </mesh>
      ))}
      {/* Plush platforms. */}
      {levels.map((lvl, i) => (
        <BeveledBox
          key={`plat${i}`}
          castShadow
          receiveShadow
          position={[lvl.x, lvl.y, lvl.z]}
          material={plushMat}
          args={[platW, PLAT_T, platW]}
        />
      ))}
      {/* House cube on the second tier — only when it's a MIDDLE tier (tiers ≥ 3):
          at tiers=2 the second tier IS the top platform, where the house would
          interpenetrate the top perch. Five soft panels with an open doorway
          front so a cat can step inside. */}
      {withHouse === 'yes' && tiers >= 3
        ? (() => {
            const lvl = levels[1]
            const hw = platW * 0.98
            const hh = 0.3
            const wall = 0.022
            const floorY = lvl.y + PLAT_T / 2
            const door = hw * 0.5
            return (
              <group position={[lvl.x, floorY, lvl.z]}>
                {/* Back wall */}
                <BeveledBox
                  castShadow
                  position={[0, hh / 2, -hw / 2 + wall / 2]}
                  material={plushMat}
                  args={[hw, hh, wall]}
                />
                {/* Side walls */}
                {[-1, 1].map((s) => (
                  <BeveledBox
                    key={s}
                    castShadow
                    position={[s * (hw / 2 - wall / 2), hh / 2, 0]}
                    material={plushMat}
                    args={[wall, hh, hw]}
                  />
                ))}
                {/* Roof */}
                <BeveledBox
                  castShadow
                  position={[0, hh - wall / 2, 0]}
                  material={plushMat}
                  args={[hw, wall, hw]}
                />
                {/* Front: two jambs + a lintel framing a doorway. */}
                {[-1, 1].map((s) => (
                  <BeveledBox
                    key={`j${s}`}
                    castShadow
                    position={[s * (door / 2 + (hw - door) / 4), hh / 2, hw / 2 - wall / 2]}
                    material={plushMat}
                    args={[(hw - door) / 2, hh, wall]}
                  />
                ))}
                <BeveledBox
                  castShadow
                  position={[0, hh - hh * 0.18, hw / 2 - wall / 2]}
                  material={plushMat}
                  args={[door, hh * 0.36, wall]}
                />
              </group>
            )
          })()
        : null}
      {/* Top perch: a shallow raised cup on the top platform. */}
      {withPerch === 'yes'
        ? (() => {
            const lvl = levels[levels.length - 1]
            const cupR = platW * 0.42
            const cupY = lvl.y + PLAT_T / 2
            return (
              <group position={[lvl.x, cupY, lvl.z]}>
                {/* Rim ring */}
                <mesh
                  castShadow
                  receiveShadow
                  position={[0, 0.05, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  material={plushMat}
                >
                  <torusGeometry args={[cupR, 0.03, 10, r]} />
                </mesh>
                {/* Cushion pad */}
                <mesh receiveShadow position={[0, 0.03, 0]} material={plushMat}>
                  <cylinderGeometry args={[cupR * 0.92, cupR * 0.92, 0.03, r]} />
                </mesh>
              </group>
            )
          })()
        : null}
    </group>
  )
}
