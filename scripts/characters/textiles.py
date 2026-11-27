"""Bake wrap-around tailoring maps. Draw in UV space so seams survive changing poses."""

import math

import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageFont

from glb import Piece


def rgb(s):
    return np.array(ImageColor.getrgb(s), float)


def mix(a, b, t):
    return tuple(np.round(a * (1 - t) + b * t).clip(0, 255).astype(int))


def linear(s):
    x = rgb(s) / 255.0
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).tolist()


def woven_label(key, design):
    base, accent = rgb(design.panel), rgb(design.accent)
    img = Image.new("RGB", (256, 96), mix(base, np.zeros(3), 0.44))
    d = ImageDraw.Draw(img)
    thread = mix(accent, np.full(3, 240), 0.35)
    for x in range(7, 249, 10):
        d.line((x, 5, x + 5, 5), fill=thread, width=2)
        d.line((x, 89, x + 5, 89), fill=thread, width=2)
    for i in range(3):
        d.polygon(
            [(18 + i * 12, 63), (32 + i * 12, 32), (39 + i * 12, 32), (25 + i * 12, 63)], fill=thread
        )
    initials = "".join(word[0].upper() for word in key.split("_"))
    d.text((71, 18), initials, font=ImageFont.load_default(size=50), fill=thread)
    d.text((158, 38), "P / V", font=ImageFont.load_default(size=20), fill=thread)
    return img.resize((256, 128), Image.Resampling.LANCZOS)


def wrap_uv(p, zone):
    x, y, z = p.pos.T
    if zone == "torso":
        center_x, center_z, top, height = 0.0, 0.043, 1.50, 0.54
    else:
        # Follow each leg's axis below the crotch. Above it the waistband uses a common centre.
        leg = np.clip((0.875 - y) / 0.19, 0, 1)
        center_x = np.sign(x) * (0.105 + 0.074 * np.clip((0.88 - y) / 0.8, 0, 1)) * leg
        center_z = np.interp(
            y, [0.05, 0.26, 0.48, 0.65, 0.86, 1.04], [0.035, 0.016, 0.052, 0.048, 0.02, 0.038]
        )
        top, height = 1.045, 1.045
    u = np.arctan2(x - center_x, z - center_z) / (2 * np.pi) + 0.5
    uv = np.stack((u, (top - y) / height), axis=-1)
    # Duplicate vertices only along the back seam. Interpolation must not cross the whole atlas.
    faces = p.faces.copy()
    seam = np.ptp(u[faces], axis=1) > 0.5
    ids = np.unique(faces[seam][u[faces[seam]] < 0.5])
    remap = np.arange(len(u))
    remap[ids] = len(u) + np.arange(len(ids))
    faces[seam] = remap[faces[seam]]
    keep = np.r_[np.arange(len(u)), ids]
    uv = uv[keep]
    uv[len(u) :, 0] += 1
    return Piece(p.pos[keep], p.normal[keep], uv, p.joint[keep], p.weight[keep], faces)


def atlas(design, zone, number):
    # The full circumference covers one tile. Atlas v increases downwards in glTF.
    w, h = 1024, 1024
    base = rgb(design.shell if zone == "torso" else design.trouser)
    panel, accent = rgb(design.panel), rgb(design.accent)
    ink = np.array([23, 27, 31.0])
    light = np.full(3, 218.0)
    img = Image.new("RGB", (w, h), tuple(base.astype(int)))
    d = ImageDraw.Draw(img)

    def coords(points):
        return [(int(x * w), int(y * h)) for x, y in points]

    def fill(points, color):
        d.polygon(coords(points), fill=color)

    def seam(points, bright=None, thickness=4):
        line = coords(points)
        d.line(line, fill=mix(base, ink, 0.58), width=thickness + 3, joint="curve")
        d.line(line, fill=bright or mix(base, light, 0.24), width=thickness, joint="curve")
        # A second, offset row of individual stitches follows the actual arc length.
        for (ax, ay), (bx, by) in zip(line, line[1:]):
            length = math.hypot(bx - ax, by - ay)
            if length < 4:
                continue
            dx, dy = (bx - ax) / length, (by - ay) / length
            for t in np.arange(3, length - 2, 8):
                x, y = ax + dx * t - dy * 5, ay + dy * t + dx * 5
                d.line((x, y, x + dx * 3, y + dy * 3), fill=mix(base, light, 0.36), width=2)

    if zone == "torso":
        cut = design.cut
        yoke = {
            "wrap": 0.24,
            "pleat": 0.28,
            "track": 0.32,
            "work": 0.31,
            "court": 0.29,
            "double": 0.22,
            "bias": 0.30,
        }[cut]
        slope = {"wrap": 0.19, "track": -0.08, "bias": -0.16}.get(cut, 0)
        points = [
            (0, yoke - 0.03),
            (0.18, yoke + 0.02),
            (0.32, yoke - 0.07),
            (0.5, yoke + slope),
            (0.68, yoke - 0.07),
            (0.82, yoke + 0.02),
            (1, yoke - 0.03),
        ]
        fill([(0, -0.1), (1, -0.1)] + points[::-1], mix(base, panel, 0.77))
        seam(points, mix(base, accent, 0.72) if cut in ("track", "court") else None, 4)
        for sign in (-1, 1):

            def mirror(path):
                return [(0.5 + sign * (x - 0.5), y) for x, y in path]

            line = mirror([(0.735, 0.15), (0.704, 0.32), (0.655, 0.50), (0.633, 0.72), (0.652, 0.99)])
            fill(
                line + mirror([(0.782, 1.0), (0.772, 0.64), (0.795, 0.39), (0.85, 0.12)]),
                mix(base, panel, 0.84),
            )
            seam(line)
            if cut in ("track", "court", "work"):
                seam(mirror([(0.703, 0.28), (0.68, 0.37), (0.668, 0.44)]), mix(base, accent, 0.9), 6)
        # A compact woven emblem on the upper chest. Every cut has its own stripe count.
        x, y = coords([(0.573, 0.27)])[0]
        d.rounded_rectangle((x - 20, y - 14, x + 20, y + 14), radius=4, fill=mix(panel, ink, 0.4))
        for i in range(2 + number % 3):
            d.line(
                (x - 13 + i * 7, y + 6, x - 6 + i * 7, y - 6), fill=mix(accent, light, 0.22), width=3
            )
        for u in (0.06, 0.94):
            seam([(u, 0.12), (u, 0.42), (u + 0.016, 0.63), (u + 0.018, 0.89)], thickness=2)
    else:
        if design.cut in ("track", "court"):
            hem = round(h * (1 - (0.70 if design.cut == "court" else 0.67) / 1.045))
            d.rectangle(
                (0, 0, w, hem),
                fill=mix(rgb(design.shell), panel, 0.25 if design.cut == "court" else 0.77),
            )
            if design.cut == "court":
                d.rectangle((0, round(0.67 * h), w, h), fill=mix(rgb(design.shell), light, 0.15))
        for side in (-1, 1):
            line = [
                (0.5 + side * x, y)
                for x, y in [
                    (0.13, -0.02),
                    (0.17, 0.14),
                    (0.22, 0.26),
                    (0.19, 0.43),
                    (0.15, 0.58),
                    (0.19, 0.82),
                    (0.17, 1),
                ]
            ]
            fill(line + [(0.5 + side * 0.40, 1), (0.5 + side * 0.405, 0)], mix(base, panel, 0.49))
            seam(line, thickness=3)
            if design.cut in ("track", "court"):
                seam(
                    [(0.5 + side * 0.235, 0.22), (0.5 + side * 0.21, 0.36), (0.5 + side * 0.20, 0.48)],
                    mix(base, accent, 0.7),
                    4,
                )
        for y in (0.54, 0.565):
            seam(
                [(0.35, y - 0.015), (0.46, y + 0.014), (0.54, y + 0.014), (0.65, y - 0.015)],
                thickness=2,
            )
        seam([(0, 0.59), (0.08, 0.608), (0.16, 0.574)], thickness=2)
        seam([(0.84, 0.574), (0.92, 0.608), (1, 0.59)], thickness=2)
    # Ripstop grid and yarns are baked as fine, low-contrast variation in the colour map.
    arr = np.asarray(img).astype(float)
    y, x = np.indices((h, w))
    weave = (x % 5 == 0) * 1.1 - (y % 4 == 0) * 1.2 + (x % 31 == 0) * 1.6 + (y % 32 == 0) * 1.6
    rng = np.random.default_rng(173 + number)
    arr += (weave + rng.normal(0, 0.95, (h, w)))[:, :, None]
    return Image.fromarray(arr.clip(0, 255).astype("u1"))
