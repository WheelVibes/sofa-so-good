"""Dump a scene-referred linear EXR to a `.npy` float32 array — the readback that is TRUSTED.

    blender --background --factory-startup \
      --python python/scripts/blender/exr_dump.py -- <in.exr> <out.npy>

`bpy` pixel readback is explicitly distrusted in `docs/skills/blender.md` (it returned zeros for
a render that had succeeded, and 1.50 for a background of exactly 1.0) — but that finding is about
PNG/render-result reads, and the EXR path is the one `agx_three.py` already builds on. So it is
CONTROLLED rather than assumed: this dump was checked by pushing the recovered buffer through
`agx_three.agx()` at the app's exposure 1.38 and diffing against the `agx_three.py --image`
PNG made from the same EXR — mean 0.18 counts, max 0.5 over 2000 sampled pixels.

Rows are flipped: `Image.pixels` is bottom-up, every consumer here is top-down.
"""

from __future__ import annotations

import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
img = bpy.data.images.load(src)
# Say it explicitly rather than trusting the loader's guess (same call `agx_three.convert` makes).
img.colorspace_settings.name = "Linear Rec.709"
w, h = img.size
buf = np.empty(w * h * 4, dtype=np.float32)
img.pixels.foreach_get(buf)
a = buf.reshape(h, w, 4)[::-1, :, :3].astype(np.float32)
np.save(dst, a)
print(f"EXR_DUMP {{\"src\": \"{src}\", \"out\": \"{dst}\", \"w\": {w}, \"h\": {h}, "
      f"\"min\": {float(a.min()):.6f}, \"max\": {float(a.max()):.6f}, "
      f"\"mean\": {float(a.mean()):.6f}}}")
