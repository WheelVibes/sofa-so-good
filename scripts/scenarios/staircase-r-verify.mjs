// Visual-verification scenario for the parametric Staircase primitive.
// Three shots: straight-flight close-up, L-shape (landing + return) close-up,
// and the stair in a multi-level (loft) context feeding stairConnectivity.
// Run: node scripts/shot.mjs --scenario scripts/scenarios/staircase-r-verify.mjs \
//        --out-dir <shots-dir>   (SHOT_GPU=1 for real WebGL).
import { readFileSync } from 'node:fs'

// Loft plan serialised from templates/condo.ts loft() (sibling fixture — the
// harness imports this .mjs via plain node, which can't load the .ts template).
const LOFT = JSON.parse(
  readFileSync(new URL('./staircase-r-loft-plan.json', import.meta.url), 'utf8'),
)

// A staircase item at plan XZ [x,z] with the given props.
const stair = (id, x, z, rotation, props, levelId) => ({
  id,
  defId: 'staircase',
  position: [x, z],
  rotation,
  ...(levelId ? { levelId } : {}),
  props: { color: '#9c6b3f', material: 'wood', ...props },
})

// Aim the orbit camera at a target from an offset (metres). Async: polls for
// window.__three (exposed once the 3D scene mounts) so it never races the mount.
const aimCam = (tx, ty, tz, ox, oy, oz) => ({
  name: 'aim-cam',
  eval: `(async () => { for (let i=0;i<80 && !window.__three;i++) await new Promise((r)=>setTimeout(r,100));
    const c=window.__three.controls, cam=window.__three.camera;
    cam.position.set(${tx + ox}, ${ty + oy}, ${tz + oz}); c.target.set(${tx}, ${ty}, ${tz}); c.update(); })()`,
})

export default {
  name: 'staircase-r-verify',
  url: 'http://localhost:5211/',
  steps: [
    { name: 'viewport', viewport: { width: 1400, height: 950 } },
    { name: 'store-ready', waitFor: { storeExists: true }, timeout: 60000 },
    {
      name: 'dismiss-overlays',
      eval: "(() => { const s=window.__store.getState(); localStorage.setItem('hdb_onboarded','1'); s.setOnboardingOpen?.(false); s.endTour?.(); s.dismissLocationPrompt?.(); s.setLocation?.({ lat: 1.3521, lon: 103.8198, label: 'SG' }); s.setManualHour?.(13); s.setQualityTier?.('high'); })()",
    },
    { name: 'scene-ready', store: { action: 'setSceneReady', args: [true] } },
    { name: 'reveal-walls', store: { action: 'setWallRevealStrength', args: [0.9] } },

    // --- Phase A: straight flight close-up -------------------------------
    {
      name: 'place-straight',
      store: {
        action: 'setItems',
        args: [
          [
            stair('stair-straight', 3, 3, 0, {
              style: 'straight',
              steps: 14,
              width: 1.0,
              riserHeight: 0.17,
              treadDepth: 0.27,
              railing: 'both',
            }),
          ],
        ],
      },
    },
    aimCam(3, 1.2, 4.0, -2.6, 1.4, -2.8),
    { name: 'settle-a', wait: 1400 },
    { name: 'shot-straight', screenshot: 'stair-straight-closeup' },

    // --- Phase B: L-shape close-up ---------------------------------------
    {
      name: 'place-lshape',
      store: {
        action: 'setItems',
        args: [
          [
            stair('stair-lshape', 3, 3, 0, {
              style: 'lshape',
              steps: 16,
              width: 1.0,
              riserHeight: 0.17,
              treadDepth: 0.27,
              railing: 'both',
            }),
          ],
        ],
      },
    },
    aimCam(3.4, 1.3, 3.6, -3.0, 1.8, -3.0),
    { name: 'settle-b', wait: 1400 },
    { name: 'shot-lshape', screenshot: 'stair-lshape-closeup' },

    // --- Phase C: multi-level (loft) context ----------------------------
    { name: 'load-loft', store: { action: 'setFloorPlan', args: [LOFT] } },
    {
      name: 'place-context',
      store: {
        action: 'setItems',
        args: [
          [
            // Ground floor (levelId absent) under the 'Stair Landing', rising to
            // the 3.3 m loft. L-shape to fit the ~1.2 m-wide stair bay footprint.
            stair('stair-ctx', 5.5, 4.5, Math.PI, {
              style: 'lshape',
              steps: 19,
              width: 1.0,
              riserHeight: 0.174,
              treadDepth: 0.26,
              railing: 'both',
            }),
          ],
        ],
      },
    },
    { name: 'settle-c1', wait: 800 },
    aimCam(4.5, 1.6, 3.5, -5.0, 3.2, -5.5),
    { name: 'settle-c', wait: 1600 },
    { name: 'shot-context', screenshot: 'stair-loft-context' },
  ],
}
