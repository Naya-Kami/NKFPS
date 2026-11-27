"""Read the embedded Blender GLBs and write self-contained, skinned glTF 2.0 assets."""

import copy
import io
import json
import struct
from dataclasses import dataclass

import numpy as np
from PIL import Image

DTYPES = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def tangents(piece):
    """Accumulate texture derivatives on the final indexed mesh, including mirrored islands."""
    i = piece.faces
    dp = piece.pos[i[:, 1:]] - piece.pos[i[:, :1]]
    duv = piece.uv[i[:, 1:]] - piece.uv[i[:, :1]]
    det = duv[:, 0, 0] * duv[:, 1, 1] - duv[:, 1, 0] * duv[:, 0, 1]
    scale = np.divide(1, det, out=np.zeros_like(det), where=np.abs(det) > 1e-10)
    u = (dp[:, 0] * duv[:, 1, 1, None] - dp[:, 1] * duv[:, 0, 1, None]) * scale[:, None]
    v = (dp[:, 1] * duv[:, 0, 0, None] - dp[:, 0] * duv[:, 1, 0, None]) * scale[:, None]
    t, b = np.zeros_like(piece.pos), np.zeros_like(piece.pos)
    for column in i.T:
        np.add.at(t, column, u)
        np.add.at(b, column, v)
    n = unit(piece.normal)
    t -= n * np.sum(n * t, axis=1, keepdims=True)
    bad = np.linalg.norm(t, axis=1) < 1e-8
    t[bad] = np.cross(n[bad], np.eye(3)[np.argmin(np.abs(n[bad]), axis=1)])
    t = unit(t)
    return np.column_stack((t, np.where(np.sum(np.cross(n, t) * b, axis=1) < 0, -1, 1)))


@dataclass
class Piece:
    pos: np.ndarray
    normal: np.ndarray
    uv: np.ndarray
    joint: np.ndarray
    weight: np.ndarray
    faces: np.ndarray

    def select(self, faces):
        ids, remap = np.unique(self.faces[faces], return_inverse=True)
        return Piece(
            self.pos[ids],
            self.normal[ids],
            self.uv[ids],
            self.joint[ids],
            self.weight[ids],
            remap.reshape(-1, 3),
        )

    @classmethod
    def join(cls, pieces):
        offsets = np.cumsum([0] + [len(p.pos) for p in pieces[:-1]])
        return cls(
            *(
                np.concatenate([getattr(p, k) for p in pieces])
                for k in ("pos", "normal", "uv", "joint", "weight")
            ),
            np.concatenate([p.faces + off for p, off in zip(pieces, offsets)]),
        )


class Source:
    def __init__(self, path):
        raw = path.read_bytes()
        (size,) = struct.unpack_from("<I", raw, 12)
        self.g = json.loads(raw[20 : 20 + size])
        self.bin = memoryview(raw)[28 + size :]
        self.body = next(n for n in self.g["nodes"] if n["name"].endswith("_glamour_body"))
        self.height = self.body["extras"]["reference_height_m"]
        self.joints = [self.g["nodes"][i]["name"] for i in self.g["skins"][0]["joints"]]

    def view(self, i):
        view = self.g["bufferViews"][i]
        offset = view.get("byteOffset", 0)
        return self.bin[offset : offset + view["byteLength"]]

    def array(self, i):
        a = self.g["accessors"][i]
        view = self.g["bufferViews"][a["bufferView"]]
        dtype = np.dtype(DTYPES[a["componentType"]])
        cols = WIDTH[a["type"]]
        return np.ndarray(
            (a["count"], cols),
            dtype,
            self.view(a["bufferView"]),
            a.get("byteOffset", 0),
            (view.get("byteStride", cols * dtype.itemsize), dtype.itemsize),
        )

    def primitives(self, node):
        return self.g["meshes"][node["mesh"]]["primitives"]

    def pieces(self, node):
        for p in self.primitives(node):
            a = p["attributes"]
            # Work in a common 1.70 m fitting space. The writer restores each character's height.
            yield (
                Piece(
                    self.array(a["POSITION"]) * (1.70 / self.height),
                    self.array(a["NORMAL"]),
                    self.array(a["TEXCOORD_0"]),
                    self.array(a["JOINTS_0"]),
                    self.array(a["WEIGHTS_0"]),
                    self.array(p["indices"]).reshape(-1, 3),
                ),
                p["material"],
            )

    def material_image(self, texture_info):
        index = self.g["textures"][texture_info["index"]]["source"]
        return Image.open(io.BytesIO(self.view(self.g["images"][index]["bufferView"])))


class Writer:
    def __init__(self, source):
        self.blob = bytearray()
        self.g = g = {
            "asset": {"version": "2.0", "generator": "NKFPS character tailoring"},
            "scene": 0,
            "nodes": [],
            "skins": [],
            "meshes": [],
            "materials": [],
            "textures": [],
            "images": [],
            "bufferViews": [],
            "accessors": [],
            "animations": [],
        }
        s = source.g
        # Keep the rig hierarchy and all original animation targets in their native transforms.
        keep = [i for i, n in enumerate(s["nodes"]) if "mesh" not in n]
        nodes = {old: new for new, old in enumerate(keep)}
        for old in keep:
            n = copy.deepcopy(s["nodes"][old])
            if "children" in n:
                n["children"] = [nodes[c] for c in n["children"] if c in nodes]
            g["nodes"].append(n)
        self.root = nodes[s["scenes"][s["scene"]]["nodes"][0]]
        g["nodes"][self.root]["extras"]["asset_revision"] = "field-v1"
        g["scenes"] = [{"nodes": [self.root]}]
        skin = copy.deepcopy(s["skins"][0])
        skin["joints"] = [nodes[j] for j in skin["joints"]]
        if "skeleton" in skin:
            skin["skeleton"] = nodes[skin["skeleton"]]
        cache = {}

        def import_array(i):
            if i not in cache:
                a = s["accessors"][i]
                cache[i] = self.array(source.array(i), a["type"], a["componentType"], bounds="min" in a)
            return cache[i]

        skin["inverseBindMatrices"] = import_array(skin["inverseBindMatrices"])
        g["skins"].append(skin)
        for anim in copy.deepcopy(s["animations"]):
            for channel in anim["channels"]:
                target = channel["target"]
                target["node"] = nodes[target["node"]]
            for sampler in anim["samplers"]:
                for k in ("input", "output"):
                    sampler[k] = import_array(sampler[k])
            g["animations"].append(anim)

    def view(self, raw, target=None):
        self.blob.extend(bytes((-len(self.blob)) % 4))
        v = {"buffer": 0, "byteOffset": len(self.blob), "byteLength": len(raw)}
        if target:
            v["target"] = target
        self.blob.extend(raw)
        self.g["bufferViews"].append(v)
        return len(self.g["bufferViews"]) - 1

    def array(self, values, kind, component=5126, target=None, bounds=False):
        data = np.ascontiguousarray(values, dtype=DTYPES[component]).reshape(-1, WIDTH[kind])
        a = {
            "bufferView": self.view(data.tobytes(), target),
            "componentType": component,
            "count": len(data),
            "type": kind,
        }
        if bounds:
            a.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        self.g["accessors"].append(a)
        return len(self.g["accessors"]) - 1

    def texture(self, name, img, size=None, alpha=False, quality=91):
        if size and max(img.size) > size:
            img = img.copy()
            img.thumbnail((size, size), Image.Resampling.LANCZOS)
        data = io.BytesIO()
        fmt = "PNG" if alpha else "JPEG"
        img.convert("RGBA" if alpha else "RGB").save(data, format=fmt, quality=quality, subsampling=0)
        index = len(self.g["images"])
        self.g["images"].append(
            {"name": name, "mimeType": "image/" + fmt.lower(), "bufferView": self.view(data.getvalue())}
        )
        self.g["textures"].append({"source": index})
        return {"index": len(self.g["textures"]) - 1}

    def material(self, name, **props):
        self.g["materials"].append(dict(name=name, **props))
        return len(self.g["materials"]) - 1

    def mesh(self, name, parts, height):
        primitives = []
        for mat, p in parts:
            indices = self.array(p.faces, "SCALAR", 5123 if len(p.pos) <= 65535 else 5125, 34963)
            # glTF requires zero-weight joint entries to be zero and nonzero weights to sum to one.
            weight = p.weight / np.maximum(p.weight.sum(axis=1, keepdims=True), 1e-12)
            attrs = {
                "POSITION": self.array(p.pos * (height / 1.70), "VEC3", target=34962, bounds=True),
                "NORMAL": self.array(unit(p.normal), "VEC3", target=34962),
                "JOINTS_0": self.array(np.where(weight > 0, p.joint, 0), "VEC4", 5121, 34962),
                "WEIGHTS_0": self.array(weight, "VEC4", target=34962),
            }
            material = self.g["materials"][mat]
            if "baseColorTexture" in material["pbrMetallicRoughness"]:
                attrs["TEXCOORD_0"] = self.array(p.uv, "VEC2", target=34962)
            if "normalTexture" in material:
                attrs["TANGENT"] = self.array(tangents(p), "VEC4", target=34962)
            primitives.append({"attributes": attrs, "indices": indices, "material": mat})
        node = {"mesh": len(self.g["meshes"]), "skin": 0, "name": name}
        self.g["meshes"].append({"name": name, "primitives": primitives})
        self.g["scenes"][0]["nodes"].append(len(self.g["nodes"]))
        self.g["nodes"].append(node)

    def save(self, path):
        g = self.g
        self.blob.extend(bytes((-len(self.blob)) % 4))
        g["buffers"] = [{"byteLength": len(self.blob)}]
        extensions = sorted({k for m in g["materials"] for k in m.get("extensions", {})})
        if extensions:
            g["extensionsUsed"] = extensions
        info = json.dumps(g, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
        info += b" " * ((-len(info)) % 4)
        with path.open("wb") as f:
            f.write(
                struct.pack(
                    "<4sIIII", b"glTF", 2, 28 + len(info) + len(self.blob), len(info), 0x4E4F534A
                )
            )
            f.write(info)
            f.write(struct.pack("<II", len(self.blob), 0x004E4942))
            f.write(self.blob)
