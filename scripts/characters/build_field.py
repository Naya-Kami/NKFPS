"""Build the seven field variants from the checked-in everyday GLBs (NumPy, SciPy and Pillow)."""

import copy
import hashlib
import json
from collections import defaultdict
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image

from designs import DESIGNS
from glb import Piece, Source, Writer, unit
from groom import groom, guide_paths, hair_texture, paint_roots
from optimize import simplify
from tailoring import ArmSurface, Surface, Tailor
from textiles import atlas, linear, woven_label, wrap_uv

ROOT = Path(__file__).resolve().parents[2]
VARIANTS = ROOT / "assets/characters/variants"
ORIGINAL = VARIANTS / "female_everyday"
OUTPUT = VARIANTS / "female_field"


def smooth(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def shape(points, eye, dimensions):
    x, y, z = points.T
    jaw, chin, cheek, shoulder, rib, hip, seat = np.array(dimensions) * 0.001
    eye_y = eye[1]
    lower = np.exp(-(((y - eye_y + 0.086) / 0.030) ** 2))
    chin_tip = np.exp(-(((y - eye_y + 0.110) / 0.019) ** 2))
    cheek_pad = np.exp(-(((y - eye_y + 0.043) / 0.024) ** 2))
    forward = smooth(0.008, 0.095, z)
    face = smooth(0.0, 0.045, z) * (1 - smooth(0.079, 0.107, np.abs(x)))
    dx = np.tanh(x / 0.024) * face * (jaw * lower + cheek * cheek_pad)
    dy = chin * chin_tip * np.exp(-((x / 0.031) ** 2)) * forward
    dz = (
        -0.0025 * chin_tip * np.exp(-((x / 0.034) ** 2))
        + cheek * 0.7 * cheek_pad * smooth(0.020, 0.049, np.abs(x))
    ) * forward
    # Ease the upper lid and balance the nose/upper lip against the broader lower face.
    socket = np.exp(-(((np.abs(x) - abs(eye[0])) / 0.021) ** 2)) * smooth(
        eye[2] - 0.015, eye[2] + 0.007, z
    )
    dy -= (0.0007 + chin * 0.16) * socket * np.exp(-(((y - eye_y - 0.007) / 0.008) ** 2))
    midline = np.exp(-((x / 0.015) ** 2)) * forward
    dz += (0.65 * cheek - 0.0010) * midline * np.exp(-(((y - eye_y + 0.032) / 0.022) ** 2))
    dz += 0.28 * chin * forward * np.exp(-((x / 0.033) ** 2) - ((y - eye_y + 0.071) / 0.009) ** 2)
    # Shape a continuous torso profile. Limbs and garment edges share the same deformation field.
    torso = (1 - smooth(0.18, 0.30, np.abs(x))) * smooth(0.53, 0.79, y) * (1 - smooth(1.40, 1.49, y))
    flank = np.tanh(x / 0.084) * torso
    hips = np.exp(-(((y - 0.885) / 0.107) ** 2))
    ribs = np.exp(-(((y - 1.18) / 0.104) ** 2))
    dx += flank * (hip * hips + rib * ribs)
    dx += (
        np.tanh(x / 0.13)
        * shoulder
        * np.exp(-(((y - 1.369) / 0.075) ** 2))
        * (1 - smooth(0.24, 0.35, np.abs(x)))
    )
    dz += torso * (
        np.tanh((z - 0.031) / 0.052) * (0.53 * rib * ribs + 0.48 * hip * hips)
        - seat * hips * (1 - smooth(-0.071, 0.015, z))
    )
    return points + np.stack((dx, dy, dz), axis=-1)


def reshape(p, eye, dimensions):
    # Transform normals by the local cofactor matrix. Preserve authored smooth normals and UV seams.
    q = p.pos.astype(float)
    eps = 0.00012
    deriv = [
        (shape(q + axis, eye, dimensions) - shape(q - axis, eye, dimensions)) / (2 * eps)
        for axis in np.eye(3) * eps
    ]
    cofactor = [np.cross(deriv[(i + 1) % 3], deriv[(i + 2) % 3]) for i in range(3)]
    n = sum(vec * p.normal[:, i, None] for i, vec in enumerate(cofactor))
    return replace(p, pos=shape(q, eye, dimensions), normal=unit(n))


def find_node(source, predicate):
    return next(n for n in source.g["nodes"] if "mesh" in n and predicate(n))


def iris_albedo(image):
    """Keep the source iris colour and keep its pupil legible after mipmapping."""
    rgba = np.asarray(image.resize((1024, 1024), Image.Resampling.LANCZOS).convert("RGBA"))
    result = rgba[:, :, :3].copy()
    # The two eyes occupy separate islands on the MakeHuman atlas. Locate the black pupil
    # inside each island, avoiding the transparent padding and the dark limbal ring.
    for u, v in ((0.29, 0.71), (0.71, 0.29)):
        left, top = int(1024 * u) - 125, int(1024 * v) - 125
        region = rgba[top : top + 250, left : left + 250]
        y, x = np.ogrid[:250, :250]
        core = (
            (region[:, :, :3].max(axis=2) < 9)
            & (region[:, :, 3] > 245)
            & ((x - 125) ** 2 + (y - 125) ** 2 < 49**2)
        )
        py, px = np.nonzero(core)
        if not len(px):
            continue
        radius = np.sqrt(len(px) / np.pi)
        distance = np.hypot(x - px.mean(), y - py.mean()) / radius
        pigment = region[:, :, :3] * (0.90 + 0.10 * smooth(3.05, 3.40, distance))[:, :, None]
        edge = smooth(1.12, 1.24, distance)[:, :, None]
        result[top : top + 250, left : left + 250] = pigment * edge + np.array([5, 6, 7]) * (1 - edge)
    return Image.fromarray(result)


def original_material(src, writer, idx, role, albedo=None):
    mat = copy.deepcopy(src.g["materials"][idx])
    mat.pop("extras", None)
    mat.pop("name", None)
    pbr = mat["pbrMetallicRoughness"]
    tex = pbr.get("baseColorTexture")
    if tex:
        size = {"skin": 2048, "iris": 1024, "lashes": 512}[role]
        img = albedo if albedo is not None else src.material_image(tex)
        if role == "iris":
            img = iris_albedo(img)
        pbr["baseColorTexture"] = writer.texture(role + " colour", img, size, role == "lashes", 95)
    if "metallicRoughnessTexture" in pbr:
        tex = pbr["metallicRoughnessTexture"]
        pbr["metallicRoughnessTexture"] = writer.texture(
            role + " roughness", src.material_image(tex), 512, quality=94
        )
    if "normalTexture" in mat:
        img = src.material_image(mat["normalTexture"])
        mat["normalTexture"] = dict(
            writer.texture(role + " micro-normal", img, 1024, quality=96), scale=0.45
        )
    if role == "iris":
        mat["extensions"] = {
            "KHR_materials_clearcoat": {"clearcoatFactor": 0.18, "clearcoatRoughnessFactor": 0.10},
            "KHR_materials_specular": {"specularFactor": 0.32},
        }
        pbr["roughnessFactor"] = 0.41
    return writer.material(role, **mat)


def fabric_materials(w, character, d, no):
    materials = {}
    materials["label"] = w.material(
        "Woven insignia",
        pbrMetallicRoughness={
            "baseColorTexture": w.texture(
                "Personal woven label", woven_label(character, d), quality=95
            ),
            "roughnessFactor": 0.92,
            "metallicFactor": 0,
        },
        doubleSided=True,
    )
    for key, zone in [("top", "torso"), ("pants", "leg")]:
        tex = w.texture(zone + " cut panels and topstitching", atlas(d, zone, no), quality=95)
        materials[key] = w.material(
            zone + " | ripstop",
            pbrMetallicRoughness={
                "baseColorTexture": tex,
                "roughnessFactor": 0.82,
                "metallicFactor": 0,
            },
            doubleSided=True,
        )
    colors = {
        "shell": d.shell,
        "inset": d.panel,
        "accent": d.accent,
        "binding": d.trouser,
        "belt": "#302e32",
        "metal": "#aca79d",
        "sole": "#25272c",
        "leather": "#37343a",
    }
    for key, hex_color in colors.items():
        if key == "leather" and d.cut == "court":
            continue
        r = {
            "shell": 0.72,
            "inset": 0.85,
            "accent": 0.61,
            "binding": 0.75,
            "belt": 0.77,
            "metal": 0.33,
            "sole": 0.96,
            "leather": 0.52,
        }[key]
        color = linear(hex_color)
        materials[key] = w.material(
            key,
            pbrMetallicRoughness={
                "baseColorFactor": color + [1.0],
                "metallicFactor": 0.74 if key == "metal" else 0,
                "roughnessFactor": r,
            },
            doubleSided=True,
        )
    return materials


def field_trousers(donor, src, d):
    clothes = find_node(
        donor,
        lambda n: "wardrobe_source" in n.get("extras", {}) and "fabric_allowance_m" in n["extras"],
    )
    pieces = list(donor.pieces(clothes))
    p = Piece.join([item[0] for item in pieces[1:]])
    # Match the pattern to each character, with room at the hip and taper inside the shoe.
    x, y, z = p.pos.T
    side = np.sign(x)
    cx = side * (0.104 + 0.074 * np.clip((0.875 - y) / 0.8, 0, 1))
    cz = np.interp(y, [0.05, 0.26, 0.48, 0.65, 0.86, 1.04], [0.035, 0.016, 0.052, 0.048, 0.02, 0.038])
    width = {
        "wrap": 1.02,
        "pleat": 0.98,
        "track": 0.96,
        "work": 1.085,
        "court": 0.99,
        "double": 1.075,
        "bias": 0.97,
    }[d.cut]
    pos = p.pos.copy()
    pos[:, 0] += (x - cx) * (width - 1) * (1 - smooth(0.84, 1.03, y))
    pos[:, 2] += (z - cz) * (width - 1) * (1 - smooth(0.84, 1.03, y))
    pos[:, 1] -= 0.060 * (1 - smooth(0.114, 0.225, y))
    # The skin-joint order is an input contract shared by the checked-in variants.
    if donor.joints != src.joints:
        raise ValueError("Mismatched source skeletons")
    return replace(p, pos=pos)


def build(model, source, donor, boot_source, index, destination):
    key = Path(model["file"]).stem
    d = DESIGNS[key]
    w = Writer(source)
    m = fabric_materials(w, key, d, index)
    eye = np.array(json.loads(source.body["extras"]["distinct_face_landmarks_world"])["eyes"][0])
    eye = eye[[0, 2, 1]] * np.array([1, 1, -1]) * (1.70 / source.height)

    def emit(name, parts, fraction=1):
        fitted = []
        for mat, p in parts:
            p = reshape(p, eye, d.sculpt)
            fitted.append((mat, simplify(p, fraction) if fraction < 1 else p))
        w.mesh(name, fitted, source.height)

    fibre, fibre_material = next(
        source.pieces(find_node(source, lambda n: "SignatureGroom" in n["name"]))
    )
    source_colour = source.g["materials"][fibre_material]["pbrMetallicRoughness"]["baseColorFactor"][:3]
    linear_rgb = np.array(source_colour)
    hair_rgb = 255 * np.where(
        linear_rgb < 0.0031308, 12.92 * linear_rgb, 1.055 * linear_rgb ** (1 / 2.4) - 0.055
    )
    guides = guide_paths(fibre)

    skin, skinmat = next(source.pieces(source.body))
    centers = skin.pos[skin.faces].mean(axis=1)
    keep = (centers[:, 1] > 1.009) | (np.abs(centers[:, 0]) > 0.278)
    if d.cut == "court":
        keep |= (centers[:, 1] > 0.297) & (centers[:, 1] < 0.706) & (np.abs(centers[:, 0]) < 0.25)
    skin = skin.select(keep)
    skin_tex = source.g["materials"][skinmat]["pbrMetallicRoughness"]["baseColorTexture"]
    albedo = paint_roots(source.material_image(skin_tex), skin, guides, eye[1], hair_rgb)
    emit(
        "Face, neck and exposed skin",
        [(original_material(source, w, skinmat, "skin", albedo), skin)],
        0.31,
    )
    eye_node = find_node(source, lambda n: n["name"].endswith("_eyes"))
    iris, imat = next(source.pieces(eye_node))
    lash, lmat = next(source.pieces(find_node(source, lambda n: "eyelashes" in n["name"])))
    emit(
        "Eyes and lashes",
        [
            (original_material(source, w, imat, "iris"), iris),
            (original_material(source, w, lmat, "lashes"), lash),
        ],
        0.58,
    )

    clothes = find_node(source, lambda n: "fabric_allowance_m" in n.get("extras", {}))
    upper = []
    for part, _ in source.pieces(clothes):
        cut = part.pos[part.faces, 1].mean(axis=1) > 0.992
        if np.any(cut):
            upper.append(part.select(cut))
    top = Piece.join(upper)
    pants = field_trousers(donor, source, d)
    visible = pants
    if d.cut == "court":
        y = pants.pos[pants.faces, 1].mean(axis=1)
        visible = pants.select((y > 0.688) | (y < 0.325))
    emit(
        "Base layers", [(m["top"], wrap_uv(top, "torso")), (m["pants"], wrap_uv(visible, "leg"))], 0.31
    )

    trim = []
    for node in source.g["nodes"]:
        if "mesh" in node and "stitched turned edges" in node["name"]:
            for p, _ in source.pieces(node):
                if p.pos[:, 1].min() >= 1.033:
                    trim.append(p)
    if trim:
        emit("Neckline, sleeve and armhole bindings", [(m["binding"], Piece.join(trim))], 0.26)

    shoes = source if d.boot == "trainer" else boot_source
    shoe_parts = defaultdict(list)
    for node in shoes.g["nodes"]:
        if "mesh" not in node or not node.get("extras", {}).get("shoe_fit"):
            continue
        for p, mat in shoes.pieces(node):
            part = shoes.g["materials"][mat]["name"].lower()
            role = (
                "sole"
                if "outsole" in part
                else "accent"
                if "lace" in part
                else "inset"
                if ("binding" in part or "facing" in part)
                else "leather"
            )
            if d.cut == "court" and role == "leather":
                role = "shell"
            shoe_parts[m[role]].append(p)
    shoe_parts = [(mat, Piece.join(pieces)) for mat, pieces in shoe_parts.items()]
    emit("Footwear", shoe_parts, 0.30)
    shoes_mesh = Piece.join([p for _, p in shoe_parts])
    tailor = Tailor()
    body = Piece.join([skin, top, pants])
    torso = Surface(body, 0.976, 1.408, "torso")
    tailor.jacket(torso, d, m)
    skin_def = source.g["skins"][0]
    pivots = np.linalg.inv(source.array(skin_def["inverseBindMatrices"]).reshape(-1, 4, 4))[
        :, 3, :3
    ] * (1.70 / source.height)
    for sign in (-1, 1):
        suffix = ".L" if sign > 0 else ".R"
        tailor.sleeve(
            ArmSurface(
                body,
                pivots[source.joints.index("upperarm01" + suffix)],
                pivots[source.joints.index("lowerarm01" + suffix)],
            ),
            d,
            m,
            sign,
        )
        tailor.leg(Surface(pants, 0.103, 0.853, "leg", sign), d, m, sign)
        tailor.shoe(Surface(shoes_mesh, 0.011, 0.121, "shoe", sign), m, sign, d.boot)
    emit("Tailored shell, articulated panels and hardware", tailor.meshes(), 0.66)

    hair = groom(source, guides, eye[1])
    hairmat = w.material(
        "Combed locks",
        pbrMetallicRoughness={
            "baseColorTexture": w.texture("Individual hair fibres", hair_texture(hair_rgb), alpha=True),
            "metallicFactor": 0,
            "roughnessFactor": 0.65,
        },
        extensions={"KHR_materials_specular": {"specularFactor": 0.42}},
        alphaMode="MASK",
        alphaCutoff=0.40,
        doubleSided=True,
    )
    emit("Signature groom", [(hairmat, hair)])
    path = destination / model["file"]
    w.save(path)
    print(
        f"{key}: {path.stat().st_size / 2**20:.1f} MiB, {sum(w.g['accessors'][p['indices']]['count'] // 3 for mesh in w.g['meshes'] for p in mesh['primitives']):,} triangles",
        flush=True,
    )
    return {
        "character": model["character"],
        "outfit": d.outfit,
        "file": path.name,
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def main():
    base = json.loads((ORIGINAL / "models.json").read_text())["models"]
    OUTPUT.mkdir(exist_ok=True)
    donor = Source(ORIGINAL / "ayame_blaze.glb")
    boot = Source(ORIGINAL / "reina_cross.glb")
    with TemporaryDirectory(dir=OUTPUT) as temp:
        stage = Path(temp)
        result = [
            build(model, Source(ORIGINAL / model["file"]), donor, boot, i, stage)
            for i, model in enumerate(base)
        ]
        (stage / "models.json").write_text(
            json.dumps(
                {"revision": "field-v1", "format": "GLB 2.0", "models": result},
                indent=2,
                ensure_ascii=False,
            )
            + "\n"
        )
        for name in [r["file"] for r in result] + ["models.json"]:
            (stage / name).replace(OUTPUT / name)


if __name__ == "__main__":
    main()
