"""Turn the embedded crossed-fibre groom into curved, textured locks along its own guides."""

import numpy as np
from scipy.spatial import cKDTree
from PIL import Image

from glb import Piece, unit


def guide_paths(fibre):
    # Blender emits four vertices per sample and four triangles per crossed-ribbon segment.
    groups = fibre.faces.reshape(-1, 12)
    first = groups[:, 0].astype(int)
    if not np.array_equal(groups[:, [1, 2, 6, 7, 8]], first[:, None] + [1, 5, 2, 3, 7]):
        raise ValueError("Unexpected source groom topology")
    start = np.r_[0, np.flatnonzero(np.diff(first) != 4) + 1]
    stop = np.r_[start[1:], len(first)]
    return fibre.pos.reshape(-1, 4, 3).mean(1), first[start] // 4, stop - start + 1


def paint_roots(image, skin, guides, eye_y, colour):
    """Bake short roots into the original scalp UVs so they cannot intersect the skin during motion."""
    points, starts, _ = guides
    tree = cKDTree(points[starts])

    def coverage(pos):
        x, y, z = pos.T
        theta = np.arctan2(x, z - 0.045)
        angle = np.abs(theta)
        line = eye_y + np.interp(
            angle,
            [0, 0.55, 0.87, 1.13, 1.4, 1.56, 1.86, 2.17, 2.54, np.pi],
            [0.075, 0.068, 0.054, 0.034, 0.021, 0.018, 0.009, -0.022, -0.060, -0.077],
        )
        line += 0.0011 * np.sin(83 * theta + 65 * y) + 0.0014 * np.sin(25 * theta)
        sides = np.clip((angle - 0.74) / 0.5, 0, 1) * np.clip((y - line) / 0.009, 0, 1)
        roots = 1 - np.clip((tree.query(pos, k=4)[0][:, -1] - 0.0025) / 0.008, 0, 1)
        return np.maximum(roots, sides)

    pix = np.asarray(image.convert("RGB")).copy()
    h, w = pix.shape[:2]
    uv = skin.uv * np.array([w, h]) - 0.5
    strength = coverage(skin.pos)
    faces = skin.faces[strength[skin.faces].max(1) > 0.01]
    positions = np.zeros((h, w, 3), dtype="f4")
    marked = np.zeros((h, w), dtype=bool)
    for ids in faces:
        tri = uv[ids]
        x0, y0 = np.maximum(np.ceil(tri.min(0)).astype(int), 0)
        x1, y1 = np.minimum(np.floor(tri.max(0)).astype(int), [w - 1, h - 1])
        if x1 < x0 or y1 < y0:
            continue
        bx, by = tri[1] - tri[0]
        cx, cy = tri[2] - tri[0]
        determinant = bx * cy - by * cx
        if abs(determinant) < 1e-8:
            continue
        yy, xx = np.mgrid[y0 : y1 + 1, x0 : x1 + 1]
        local_x, local_y = xx - tri[0, 0], yy - tri[0, 1]
        u = (local_x * cy - local_y * cx) / determinant
        v = (bx * local_y - by * local_x) / determinant
        inside = (u >= 0) & (v >= 0) & (u + v <= 1)
        rows, cols = yy[inside], xx[inside]
        a, b, c = skin.pos[ids]
        positions[rows, cols] = a + u[inside, None] * (b - a) + v[inside, None] * (c - a)
        marked[rows, cols] = True
    pos = positions[marked]
    alpha = coverage(pos)
    alpha = (alpha * alpha * (3 - 2 * alpha))[:, None]
    x, y, z = pos.T
    theta = np.arctan2(x, z - 0.045)
    fibres = np.sin(208 * theta + 310 * y + 0.24 * np.sin(19 * theta)) + np.sin(409 * theta + 570 * y)
    roots = colour * (0.75 + 0.043 * fibres[:, None]) + 8
    pix[marked] = np.clip(pix[marked] * (1 - alpha) + roots * alpha, 0, 255)
    return Image.fromarray(pix)


def hair_texture(base):
    w, h = 512, 512
    rng = np.random.default_rng(843)
    atlas = np.zeros((h, w, 4), dtype="u1")
    y, x = np.meshgrid(np.linspace(0, 1, h), np.linspace(0, 1, 64), indexing="ij")
    for tile in range(8):
        drift = 0.013 * np.sin(y * 5 + tile * 0.72) + 0.009 * np.sin(y * 11 + tile)
        u = np.clip((x + drift) * 63, 0, 63)
        strand = np.interp(u, np.arange(64), rng.uniform(-0.17, 0.20, 64))
        broad = 0.09 * np.cos(x * 7 + tile * 0.8) + 0.05 * np.sin(y * 5 + tile / 2)
        atlas[:, tile * 64 : (tile + 1) * 64, :3] = np.clip(
            base * (1 + strand + broad)[:, :, None] + np.maximum(0, strand)[:, :, None] * 12, 0, 255
        )
        edge = np.minimum(x, 1 - x) * 63
        alpha = np.clip((edge - 0.65 + 2.2 * strand + 1.15 * np.sin(y * 7 + tile)) * 1.5, 0, 1)
        atlas[:, tile * 64 : (tile + 1) * 64, 3] = (alpha * 255).astype("u1")
    return Image.fromarray(atlas)


def groom(source, guides, eye_y):
    points, roots, counts = guides
    rng = np.random.default_rng(731)
    choice = np.sort(rng.choice(len(roots), min(1830, len(roots)), replace=False))
    t = np.linspace(0, 1, 10)
    sample = (counts[choice, None] - 1) * t
    i = roots[choice, None] + np.floor(sample).astype(int)
    j = np.minimum(i + 1, (roots[choice] + counts[choice] - 1)[:, None])
    centers = points[i] + (points[j] - points[i]) * (sample % 1)[:, :, None]
    # Ease shoulder-length ends up and towards the neck. Retain the original part and fringe.
    below = np.maximum(eye_y - 0.13 - centers[:, :, 1], 0)
    centers[:, :, 1] += below * 0.18
    centers[:, :, 0] *= 1 - np.clip(below * 0.42, 0, 0.07)
    x, y, z = centers.transpose(2, 0, 1)
    sweep = np.clip((eye_y + 0.051 - y) / 0.103, 0, 1)
    sweep = sweep * sweep * (3 - 2 * sweep)
    temple = np.clip((np.abs(x) - 0.025) / 0.049, 0, 1)
    tuck = sweep * temple
    forward = np.maximum(z - 0.057, 0)
    centers[:, :, 0] += (
        np.sign(x) * tuck * np.clip(forward / 0.055, 0, 1) * np.maximum(0.086 - np.abs(x), 0.004)
    )
    centers[:, :, 2] -= forward * tuck * 0.97
    tangent = unit(np.gradient(centers, axis=1))
    radial = centers - np.array([0, eye_y + 0.022, 0.044])
    radial[:, :, 1] = np.maximum(radial[:, :, 1], 0) * 1.40
    outward = unit(radial)
    transverse = unit(np.cross(tangent, outward))
    width = rng.uniform(0.0012, 0.0031, (len(choice), 1)) * (
        0.68 + 0.32 * np.sin(np.pi * (t * 0.85 + 0.1))
    )
    width *= 1 - 0.93 * t**4
    ridge = 0.00075 * np.sin(np.pi * (t * 0.88 + 0.06))[None, :, None]
    vertices = np.stack(
        (
            centers - transverse * width[:, :, None],
            centers + outward * ridge,
            centers + transverse * width[:, :, None],
        ),
        axis=2,
    )
    norm = unit(np.cross(np.gradient(vertices, axis=2), np.gradient(vertices, axis=1)))
    flip = (norm * outward[:, :, None]).sum(axis=-1).mean(axis=(1, 2)) < 0
    norm[flip] *= -1
    norm = unit(0.42 * norm + 0.58 * outward[:, :, None, :])
    ids = np.arange(vertices.size // 3).reshape(vertices.shape[:-1])
    a, b, c, d = ids[:, :-1, :-1], ids[:, :-1, 1:], ids[:, 1:, :-1], ids[:, 1:, 1:]
    faces = np.stack((a, b, d, a, d, c), axis=-1).reshape(len(choice), -1, 3)
    faces[flip] = faces[flip, :, ::-1]
    uv = np.zeros((*ids.shape, 2))
    uv[:, :, :, 0] = (
        rng.integers(0, 8, len(choice))[:, None, None] + np.array([0.03, 0.5, 0.97])[None, None, :]
    ) / 8
    uv[:, :, :, 1] = t[None, :, None]
    joint = np.zeros((len(choice), len(t), 3, 4), dtype="u1")
    joint[:, :, :, 0] = source.joints.index("head")
    joint[:, :, :, 1] = source.joints.index("neck01")
    joint[:, :, :, 2] = source.joints.index("spine01")
    influence = np.clip((eye_y - 0.082 - vertices[:, :, :, 1]) / 0.18, 0, 1)
    w = np.zeros(joint.shape, dtype="f4")
    w[:, :, :, 1] = 0.35 * influence
    w[:, :, :, 2] = 0.36 * influence**2
    w[:, :, :, 0] = 1 - w[:, :, :, 1] - w[:, :, :, 2]
    return Piece(
        vertices.reshape(-1, 3),
        norm.reshape(-1, 3),
        uv.reshape(-1, 2),
        joint.reshape(-1, 4),
        w.reshape(-1, 4),
        faces.reshape(-1, 3),
    )
