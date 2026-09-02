"""Work around glTF-importer bugs in the installed Blender before importing.

Kept separate from `sofa_scene` so each workaround can carry the upstream diagnosis
that justifies it, and can be **deleted** when the upstream fix lands rather than
lingering as folklore.

## `KHR_materials_dispersion` with no properties — Blender 5.2.1

`io_scene_gltf2/blender/imp/pbrMetallicRoughness.py` guards the *creation* of the
settings node on the extension's **value**:

    if dispersion_ext := mh.get_ext('KHR_materials_dispersion'):   # line 35
        if dispersion_ext.get('dispersion', 0) != 0:               # line 36
            need_settings_node = True

but guards its *use* on the extension's mere **presence**:

    if dispersion_ext is not None:                                 # line 136
        dispersion(mh, mh.settings_node.inputs['Dispersion'])      # line 137

So a material carrying `KHR_materials_dispersion: {}` — dispersion absent, i.e. zero —
creates no settings node and then dereferences `None`, aborting the whole import with
`AttributeError: 'NoneType' object has no attribute 'inputs'`.

three.js's `GLTFExporter` writes exactly that empty object for a `MeshPhysicalMaterial`
whose `dispersion` is 0, so any scene with glass hits it. Measured on this repo's own
export: **4 of 897 materials**, enough to block the entire import.

Stripping the extension where it is absent-or-zero is **lossless** — zero dispersion is
the glTF default and means "no dispersion". This does not paper over a real material
property; it removes a no-op the importer mishandles.
"""

from __future__ import annotations

import json
import os
import struct

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942


def _read_glb(path: str) -> tuple[dict, bytes]:
    with open(path, "rb") as f:
        magic, version, _total = struct.unpack("<III", f.read(12))
        if magic != GLB_MAGIC:
            raise ValueError(f"{path} is not a GLB (bad magic)")
        if version != 2:
            raise ValueError(f"{path} is glTF version {version}, expected 2")
        gltf: dict | None = None
        binary = b""
        while True:
            head = f.read(8)
            if len(head) < 8:
                break
            length, ctype = struct.unpack("<II", head)
            data = f.read(length)
            if ctype == CHUNK_JSON:
                gltf = json.loads(data.decode("utf-8"))
            elif ctype == CHUNK_BIN:
                binary = data
        if gltf is None:
            raise ValueError(f"{path} has no JSON chunk")
        return gltf, binary


def _write_glb(path: str, gltf: dict, binary: bytes) -> None:
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)          # JSON chunk pads with SPACES
    bn = binary + b"\x00" * ((4 - len(binary) % 4) % 4)  # BIN chunk pads with ZEROS
    total = 12 + 8 + len(js) + (8 + len(bn) if bn else 0)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", GLB_MAGIC, 2, total))
        f.write(struct.pack("<II", len(js), CHUNK_JSON))
        f.write(js)
        if bn:
            f.write(struct.pack("<II", len(bn), CHUNK_BIN))
            f.write(bn)


def strip_noop_dispersion(src: str, dst: str | None = None) -> tuple[str, int]:
    """Remove no-op `KHR_materials_dispersion` and return `(path, materials_fixed)`.

    Returns `src` untouched when there is nothing to fix, so callers can pass every GLB
    through this unconditionally without paying a rewrite.
    """
    gltf, binary = _read_glb(src)
    fixed = 0
    for mat in gltf.get("materials", []):
        ext = mat.get("extensions")
        if not ext or "KHR_materials_dispersion" not in ext:
            continue
        if float(ext["KHR_materials_dispersion"].get("dispersion", 0) or 0) == 0:
            del ext["KHR_materials_dispersion"]
            if not ext:
                del mat["extensions"]
            fixed += 1
    if not fixed:
        return (src, 0)
    # Drop the declaration too when nothing uses it any more — a stale entry in
    # extensionsUsed is harmless to Blender but misleading to any other consumer.
    still_used = any(
        "KHR_materials_dispersion" in m.get("extensions", {}) for m in gltf.get("materials", [])
    )
    if not still_used:
        for key in ("extensionsUsed", "extensionsRequired"):
            if key in gltf and "KHR_materials_dispersion" in gltf[key]:
                gltf[key] = [e for e in gltf[key] if e != "KHR_materials_dispersion"]
                if not gltf[key]:
                    del gltf[key]
    out = dst or os.path.join(
        os.path.dirname(os.path.abspath(src)),
        f"{os.path.splitext(os.path.basename(src))[0]}.blenderfix.glb",
    )
    _write_glb(out, gltf, binary)
    return (out, fixed)
