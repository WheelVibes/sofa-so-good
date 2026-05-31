"""
GLB analysis for interior-design metadata.

Parses a binary GLB (no rendering, stdlib only) to extract the two things the
IKEA page metadata cannot give us:

  * geometry  — real-world bounding box (footprint W/D/H in metres) and the
                local-space anchor offset, used for placement and collision.
  * materials — the per-component renderable palette: each glTF material's
                baseColorFactor (exact hex), metallic/roughness, and whether it
                is textured; plus the mesh -> material mapping (segments) so an
                app can recolour individual components (e.g. steel legs vs. cloth).

Texture-baked single-material models (common at IKEA) yield one material with a
texture flag; multi-material models (e.g. a sofa with steel + fabric) yield a
real per-part palette. If Pillow is available, textured materials are annotated
with a dominant colour sampled from the embedded basecolor image.
"""

import json
import struct

try:
    from PIL import Image  # optional; only for sampling textured base colours
    import io
    _HAVE_PIL = True
except ImportError:
    _HAVE_PIL = False


_GLB_MAGIC = 0x46546C67
_CHUNK_JSON = 0x4E4F534A
_CHUNK_BIN = 0x004E4942


def _parse_glb(blob):
    """Return (gltf_dict, bin_chunk_bytes) from raw GLB bytes."""
    magic, _version, length = struct.unpack_from("<III", blob, 0)
    if magic != _GLB_MAGIC:
        raise ValueError("not a GLB file")
    off = 12
    gltf, binchunk = None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<II", blob, off)
        off += 8
        chunk = blob[off:off + clen]
        if ctype == _CHUNK_JSON:
            gltf = json.loads(chunk)
        elif ctype == _CHUNK_BIN:
            binchunk = chunk
        off += clen
    if gltf is None:
        raise ValueError("GLB has no JSON chunk")
    return gltf, binchunk


def _hex(factor):
    """[r,g,b,(a)] floats 0..1 -> '#rrggbb'."""
    if not factor or len(factor) < 3:
        return None
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(c * 255))) for c in factor[:3])


def _bbox_from_accessors(gltf):
    """
    Union the min/max of every POSITION accessor (glTF stores these per accessor,
    so no buffer decoding is needed). Returns (size[x,y,z], center[x,y,z]) or None.
    """
    accessors = gltf.get("accessors", [])
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    found = False
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            pa = prim.get("attributes", {}).get("POSITION")
            if pa is None or pa >= len(accessors):
                continue
            acc = accessors[pa]
            mn, mx = acc.get("min"), acc.get("max")
            if not (mn and mx and len(mn) >= 3 and len(mx) >= 3):
                continue
            found = True
            for i in range(3):
                lo[i] = min(lo[i], mn[i])
                hi[i] = max(hi[i], mx[i])
    if not found:
        return None
    size = [round(hi[i] - lo[i], 4) for i in range(3)]
    center = [round((hi[i] + lo[i]) / 2, 4) for i in range(3)]
    return size, center


def _sample_texture_hex(gltf, binchunk, tex_index):
    """Dominant colour of a basecolor texture image, if Pillow is available."""
    if not _HAVE_PIL:
        return None
    try:
        textures = gltf.get("textures", [])
        if tex_index >= len(textures):
            return None
        src = textures[tex_index].get("source")
        images = gltf.get("images", [])
        if src is None or src >= len(images):
            return None
        img = images[src]
        if "bufferView" not in img:
            return None  # external image; not embedded
        bv = gltf["bufferViews"][img["bufferView"]]
        start = bv.get("byteOffset", 0)
        data = binchunk[start:start + bv["byteLength"]]
        im = Image.open(io.BytesIO(data)).convert("RGB").resize((1, 1))
        return "#%02x%02x%02x" % im.getpixel((0, 0))
    except Exception:
        return None


def analyze_glb(path, sample_textures=True):
    """
    Analyze a GLB file. Returns a dict:
      {
        "footprint": {"w","d","h","anchor_offset":[ox,oy,oz]},   # metres
        "materials": [{"name","hex","metallic","roughness","textured","sampled_hex"?}],
        "segments":  [{"mesh","material"}],
        "material_count": int, "mesh_count": int
      }
    Fields are omitted when the GLB lacks the data. Never raises on a valid GLB.
    """
    with open(path, "rb") as f:
        blob = f.read()
    gltf, binchunk = _parse_glb(blob)
    result = {}

    bbox = _bbox_from_accessors(gltf)
    if bbox:
        size, center = bbox
        # glTF convention: X = width, Y = up/height, Z = depth.
        result["footprint"] = {
            "w": size[0], "d": size[2], "h": size[1],
            "anchor_offset": center,
        }

    materials = []
    for m in gltf.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {}) or {}
        bcf = pbr.get("baseColorFactor")
        textured = "baseColorTexture" in pbr
        entry = {
            "name": m.get("name"),
            "hex": _hex(bcf),
            "metallic": pbr.get("metallicFactor"),
            "roughness": pbr.get("roughnessFactor"),
            "textured": textured,
        }
        if textured and sample_textures:
            tex_idx = pbr["baseColorTexture"].get("index")
            if tex_idx is not None:
                sampled = _sample_texture_hex(gltf, binchunk, tex_idx)
                if sampled:
                    entry["sampled_hex"] = sampled
        materials.append({k: v for k, v in entry.items() if v is not None})
    if materials:
        result["materials"] = materials

    mats = gltf.get("materials", [])
    segments = []
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            mi = prim.get("material")
            mat_name = mats[mi].get("name") if (mi is not None and mi < len(mats)) else None
            segments.append({"mesh": mesh.get("name"), "material": mat_name})
    if segments:
        result["segments"] = segments

    result["material_count"] = len(mats)
    result["mesh_count"] = len(gltf.get("meshes", []))
    return result


if __name__ == "__main__":
    import sys
    print(json.dumps(analyze_glb(sys.argv[1]), indent=2, ensure_ascii=False))
