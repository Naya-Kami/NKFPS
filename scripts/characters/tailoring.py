"""Cut and bind raised panels on cross-sections of the actual, character-specific garment."""

from collections import defaultdict
from dataclasses import replace

import numpy as np
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree

from glb import Piece, unit
from textiles import wrap_uv


class Surface:
    def __init__(self, cloth, low, high, domain, side=0):
        self.low, self.high, self.domain, self.side = low, high, domain, side
        tri = cloth.pos[cloth.faces]
        centers = tri.mean(axis=1)
        mask = (tri[:, :, 1].min(1) <= high + 0.025) & (tri[:, :, 1].max(1) >= low - 0.025)
        if domain == "torso":
            mask &= np.abs(centers[:, 0]) < 0.216
        elif domain != "arm":
            mask &= centers[:, 0] * side > 0
        part = cloth.select(mask)
        self.part, self.tree = part, cKDTree(part.pos)
        tri = part.pos[part.faces]
        lo, hi = tri[:, :, 1].min(1), tri[:, :, 1].max(1)
        self.levels = np.linspace(low, high, max(20, int((high - low) / 0.0055)))
        angles = np.arange(120) * 2 * np.pi / 120
        dx, dz = np.sin(angles)[:, None], np.cos(angles)[:, None]
        rows = []
        for y in self.levels:
            cx, cz = self.center(y)
            a = tri[(lo <= y) & (hi > y)]
            b = np.roll(a, -1, axis=1)
            hits = (a[:, :, 1] > y) != (b[:, :, 1] > y)
            a, b = a[hits], b[hits]
            points = (a + (b - a) * ((y - a[:, 1]) / (b[:, 1] - a[:, 1]))[:, None]).reshape(-1, 2, 3)
            if not len(points):
                rows.append(np.full(120, np.nan))
                continue
            x, z = points[:, 0, 0] - cx, points[:, 0, 2] - cz
            ex, ez = points[:, 1, 0] - points[:, 0, 0], points[:, 1, 2] - points[:, 0, 2]
            denom = dx * ez - dz * ex
            denom[np.abs(denom) < 1e-11] = np.nan
            r = (x * ez - z * ex) / denom
            t = (x * dz - z * dx) / denom
            # The fitted outer cloth may overlap the underlying skin near a cut edge.
            good = (t >= 0) & (t <= 1) & (r > 0)
            if domain == "torso":
                good &= np.abs(dx * r) < 0.215
            if domain == "arm":
                good &= r < 0.090
                radius = np.where(good, r, np.inf).min(1)
                radius[~np.isfinite(radius)] = 0
            else:
                radius = np.where(good, r, 0).max(1)
            ids = np.flatnonzero(radius > 0)
            rows.append(
                np.interp(np.arange(120), ids, radius[ids], period=120)
                if len(ids) > 8
                else np.full(120, np.nan)
            )
        rows = np.array(rows)
        valid = np.flatnonzero(np.isfinite(rows[:, 0]))
        if not len(valid):
            raise ValueError(f"No garment sections for {domain} at {low}–{high}")
        for i in range(rows.shape[1]):
            rows[:, i] = np.interp(np.arange(len(rows)), valid, rows[valid, i])
        self.radius = gaussian_filter(rows, sigma=(0.8, 0.85), mode=("nearest", "wrap"))

    def center(self, y):
        if self.domain == "arm":
            return 0.0, 0.0
        if self.domain == "torso":
            return 0.0, np.interp(y, [0.91, 1.02, 1.12, 1.24, 1.38], [0.03, 0.049, 0.061, 0.058, 0.028])
        if self.domain == "shoe":
            return self.side * 0.183, np.interp(
                y, [0.015, 0.036, 0.065, 0.12], [0.10, 0.09, 0.065, 0.032]
            )
        return (
            self.side * (0.104 + 0.074 * np.clip((0.875 - y) / 0.8, 0, 1)),
            np.interp(y, [0.05, 0.26, 0.48, 0.65, 0.86], [0.035, 0.016, 0.052, 0.048, 0.02]),
        )

    def points(self, theta, y, offset):
        theta, y = np.broadcast_arrays(theta, y)
        t = (theta / (2 * np.pi) * self.radius.shape[1]) % self.radius.shape[1]
        h = np.clip(
            (y - self.low) / (self.high - self.low) * (len(self.levels) - 1),
            0,
            len(self.levels) - 1.000001,
        )
        i, j = np.floor(t).astype(int), np.floor(h).astype(int)
        f, g = t - i, h - j
        k = (i + 1) % self.radius.shape[1]
        r = (self.radius[j, i] * (1 - f) + self.radius[j, k] * f) * (1 - g) + (
            self.radius[j + 1, i] * (1 - f) + self.radius[j + 1, k] * f
        ) * g
        cx, cz = self.center(y)
        return np.stack(
            (cx + (r + offset) * np.sin(theta), y, cz + (r + offset) * np.cos(theta)), axis=-1
        )

    def radial(self, theta):
        return np.stack((np.sin(theta), np.zeros_like(theta), np.cos(theta)), axis=-1)

    def weights(self, pos):
        dist, ids = self.tree.query(pos, k=6)
        factors = 1 / (0.00025 + dist) ** 2
        dense = np.zeros((len(pos), self.part.joint.max().item() + 1))
        np.add.at(
            dense,
            (np.arange(len(pos))[:, None, None], self.part.joint[ids]),
            factors[:, :, None] * self.part.weight[ids],
        )
        joints = np.argsort(-dense, axis=1, kind="stable")[:, :4]
        weight = np.take_along_axis(dense, joints, axis=1)
        return joints, weight / weight.sum(axis=1, keepdims=True)


class ArmSurface(Surface):
    """Use the humerus as the sleeve's longitudinal axis."""

    def __init__(self, cloth, shoulder, elbow):
        self.origin = shoulder
        axis = unit(elbow - shoulder)
        front = unit(np.array([0.0, 0.0, 1.0]) - axis * axis[2])
        self.basis = np.stack((np.cross(axis, front), axis, front))
        local = (cloth.pos - shoulder) @ self.basis.T
        mesh = replace(cloth, pos=local)
        mesh = mesh.select(np.linalg.norm(local[cloth.faces].mean(1)[:, [0, 2]], axis=1) < 0.096)
        super().__init__(mesh, 0.001, 0.205, "arm")

    def points(self, theta, y, offset):
        return super().points(theta, y, offset) @ self.basis + self.origin

    def radial(self, theta):
        return super().radial(theta) @ self.basis

    def weights(self, pos):
        return super().weights((pos - self.origin) @ self.basis.T)


class Tailor:
    def __init__(self):
        self.parts = defaultdict(list)

    def panel(self, surface, mat, pattern, nx=30, ny=8, backing=0):
        """pattern maps a rectangular cut to circumferential angle, height and ease in metres."""
        u, v = np.meshgrid(np.linspace(0, 1, nx + 1), np.linspace(0, 1, ny + 1))
        theta, y, ease = pattern(u, v)
        a = surface.points(theta, y, ease)
        normal = unit(np.cross(np.gradient(a, axis=1), np.gradient(a, axis=0)))
        # Mirrored cuts wind oppositely around the form.
        radial = surface.radial(theta)
        flipped = np.sum(normal * radial) < 0
        if flipped:
            normal = -normal
        ids = np.arange(a.shape[0] * a.shape[1]).reshape(a.shape[:2])
        tl, tr, bl, br = ids[:-1, :-1], ids[:-1, 1:], ids[1:, :-1], ids[1:, 1:]
        faces = np.stack((tl, tr, br, tl, br, bl), axis=-1).reshape(-1, 3)
        if flipped:
            faces = faces[:, ::-1]
        pos = a.reshape(-1, 3)
        joint, weight = surface.weights(pos)
        self.parts[mat].append(
            Piece(
                pos,
                normal.reshape(-1, 3),
                np.stack((u, 1 - v), axis=-1).reshape(-1, 2),
                joint,
                weight,
                faces,
            )
        )
        if backing:
            # Bridge each exposed edge to its backing. A side view must show a sewn edge
            # or pocket gusset, not a strip suspended above the underlying fabric.
            closed = np.max(np.linalg.norm(a[:, 0] - a[:, -1], axis=-1)) < 0.0001
            edges = [ids[0], ids[-1, ::-1]]
            if not closed:
                edges.extend((ids[:, -1], ids[::-1, 0]))
            for edge in edges:
                outer = pos[edge]
                inner = outer - backing * radial.reshape(-1, 3)[edge]
                wall = np.stack((inner, outer), axis=1)
                n = unit(np.cross(np.gradient(outer, axis=0), outer - inner))
                if flipped:
                    n = -n
                k = np.arange(len(edge) - 1) * 2
                f = np.stack((k, k + 2, k + 3, k, k + 3, k + 1), axis=1).reshape(-1, 3)
                if flipped:
                    f = f[:, ::-1]
                self.parts[mat].append(
                    Piece(
                        wall.reshape(-1, 3),
                        np.repeat(n, 2, axis=0),
                        np.tile([[0.0, 1.0], [0.0, 0.0]], (len(edge), 1)),
                        np.repeat(joint[edge], 2, axis=0),
                        np.repeat(weight[edge], 2, axis=0),
                        f,
                    )
                )

    def band(self, surf, mat, left, right, bottom, top, ease, nx=30, ny=4, backing=0):
        self.panel(
            surf,
            mat,
            lambda u, v: (left + (right - left) * u, bottom + (top - bottom) * v, ease),
            nx,
            ny,
            backing,
        )

    def disc(self, surf, mat, theta, y, rx, ry, ease):
        # A raised lozenge with bevelled edges. No coplanar faces at the tips.
        self.panel(
            surf,
            mat,
            lambda u, v: (
                theta + (u - 0.5) * rx * (0.6 + 0.4 * np.sin(np.pi * v)),
                y + (v - 0.5) * ry,
                ease + 0.0009 * np.sin(np.pi * u) * np.sin(np.pi * v),
            ),
            6,
            4,
        )

    def jacket(self, surf, d, m):
        cut = d.cut
        top, hem, tilt = d.jacket

        def edges(theta):
            # Scallop at the armscye, short at the waist. Split-point hems differ with the cut.
            side = np.sin(theta) ** 2
            neckline = top - 0.067 * side + tilt * np.sin(theta) * np.cos(theta / 2) ** 2
            neckline += 0.051 * np.sin(2 * theta) ** 2
            base = hem + 0.023 * side
            if cut in ("wrap", "bias", "double"):
                base -= 0.031 * np.exp(-(((theta - (0.36 if cut == "double" else -0.34)) / 0.33) ** 2))
            if cut == "court":
                neckline -= 0.045 * np.maximum(0, np.cos(theta)) ** 9
            return base, neckline

        def shell(u, v):
            t = -np.pi + 2 * np.pi * u
            a, b = edges(t)
            ease = 0.006 + 0.009 * np.sin(np.pi * v) + 0.004 * np.sin(t) ** 2
            if cut == "pleat":
                ease += 0.006 * (0.5 + 0.5 * np.cos(26 * t)) ** 3 * (1 - v) ** 2
            if cut in ("track", "court"):
                ease -= 0.002
            return t, a + (b - a) * v, ease

        self.panel(surf, m["top"], shell, 120, 24, 0.010)
        # Shell panels use the same circumferential UVs as their matching base layer.
        self.parts[m["top"]] = [wrap_uv(p, "torso") for p in self.parts[m["top"]]]
        # Turned edges stand proud of the main panel instead of drawn lines along its silhouette.
        for upper in (True, False):

            def binding(u, v):
                t = -np.pi + 2 * np.pi * u
                edge = edges(t)[int(upper)]
                width = 0.008 if upper else 0.013
                ease = 0.009 + 0.004 * np.sin(t) ** 2 + 0.002 * np.sin(np.pi * v)
                if cut == "pleat" and not upper:
                    ease += 0.006 * (0.5 + 0.5 * np.cos(26 * t)) ** 3
                return t, edge + (v - (1 if upper else 0)) * width, ease

            self.panel(surf, m["binding"], binding, 112, 3, 0.006)
        # Closure follows the overlap from the hem to the neckline.
        low, high = {
            "wrap": (-0.88, 0.60),
            "pleat": (0.0, 0.0),
            "track": (-0.19, 0.11),
            "work": (0.06, 0.06),
            "court": (0.0, 0.0),
            "double": (0.43, 0.39),
            "bias": (0.87, -0.68),
        }[cut]

        def zipline(v):
            t = low + (high - low) * v
            a, b = edges(t)
            return t, a + 0.014 + (b - a - 0.027) * v

        def tape(u, v):
            t, y = zipline(v)
            return t + (u - 0.5) * 0.093, y, 0.016 + 0.010 * np.sin(v * np.pi)

        self.panel(surf, m["binding"], tape, 5, 30)
        if cut == "double":
            for angle in (-0.36, 0.40):
                for y in (1.104, 1.172, 1.240):
                    self.disc(surf, m["metal"], angle, y, 0.094, 0.013, 0.026)
        else:

            def teeth(u, v):
                t, y = zipline(v)
                return t + (u - 0.5) * 0.018, y, 0.0175 + 0.010 * np.sin(np.pi * v)

            self.panel(surf, m["metal"], teeth, 2, 38)
            t, y = zipline(0.83)
            self.disc(surf, m["metal"], t, y, 0.062, 0.019, 0.027)
            self.band(surf, m["accent"], t - 0.02, t + 0.009, y - 0.029, y - 0.004, 0.028, 3, 5)
        # Inset panels provide different seam layouts on the front, flanks and back.
        for sign in (-1, 1):

            def flank(u, v):
                left = {
                    "wrap": 0.76,
                    "bias": 0.79,
                    "pleat": 0.42,
                    "track": 0.63,
                    "work": 0.75,
                    "court": 0.49,
                    "double": 0.86,
                }[cut]
                t = sign * (left + 0.23 * np.sin(np.pi * v) + u * (1.92 - left))
                a, b = edges(t)
                return (
                    t,
                    a + 0.015 + (b - a - 0.027) * v,
                    0.009 + 0.012 * np.sin(np.pi * v) + 0.006 * np.sin(t) ** 2,
                )

            self.panel(surf, m["inset"], flank, 23, 16)

            def dart(u, v):
                t, y, e = flank(0.025 + 0.023 * u, v)
                return t, y, e + 0.0016

            self.panel(surf, m["accent"], dart, 3, 18)
        # Back vent and back yoke; split above the belt, clear of the legs.
        for sign in (-1, 1):

            def vent(u, v):
                t = sign * (2.40 + 0.55 * u)
                a, b = edges(t)
                y = b - 0.053 + 0.022 * u + v * 0.005
                return t, y, 0.020 + 0.004 * np.sin(np.pi * u)

            self.panel(surf, m["binding"], vent, 16, 2)

        self.band(surf, m["belt"], -np.pi, np.pi, 0.993, 1.021, 0.009, 110, 4, 0.013)
        self.band(surf, m["inset"], -np.pi, np.pi, 1.014, 1.017, 0.0105, 110, 2)
        buckle = -0.29 if cut in ("wrap", "bias") else 0.03
        self.band(surf, m["metal"], buckle - 0.13, buckle + 0.13, 0.993, 1.018, 0.014, 9, 5, 0.005)
        self.band(surf, m["belt"], buckle - 0.084, buckle + 0.084, 0.999, 1.011, 0.015, 7, 3)
        for a in (-2.36, -1.48, -0.70, 0.67, 1.5, 2.40):
            self.band(surf, m["binding"], a - 0.027, a + 0.027, 0.991, 1.023, 0.012, 3, 5, 0.004)

        # Woven identifier on the wearer's left chest, tilted with the outer pattern.
        h = edges(0.44)[1] - 0.040
        self.panel(
            surf,
            m["label"],
            lambda u, v: (
                0.53 + (u - 0.5) * 0.39,
                h + (v - 0.5) * 0.024 + 0.006 * u,
                0.0215 + 0.004 * np.sin(np.pi * v),
            ),
            16,
            5,
            0.004,
        )

    def sleeve(self, surf, d, m, sign):
        cut = d.cut
        if cut == "bias" and sign > 0:
            return
        if cut == "court":
            if sign < 0:
                return
            self.band(surf, m["inset"], -np.pi, np.pi, 0.128, 0.162, 0.003, 48, 5, 0.004)
            self.band(surf, m["accent"], -np.pi, np.pi, 0.150, 0.156, 0.004, 48, 2)
            return
        reach = {
            "wrap": 0.131,
            "pleat": 0.085,
            "track": 0.157,
            "work": 0.185,
            "double": 0.085,
            "bias": 0.152,
        }[cut]

        def sleeve(u, v):
            t = (u - 0.5) * 2 * np.pi
            # Higher on the deltoid, lower on the inside of the arm.
            along = (1 - np.clip(surf.radial(t)[:, :, 0] * sign, -1, 1)) * 0.035 + 0.003
            end = reach + 0.006 * np.cos(t)
            return t, along * (1 - v) + end * v, 0.004 + 0.006 * np.sin(np.pi * v)

        self.panel(surf, m["shell"], sleeve, 52, 14, 0.005)
        for v0, mat, thick in [(0.90, "binding", 0.094), (0.82, "accent", 0.026)]:
            self.panel(
                surf,
                m[mat],
                lambda u, v: (lambda t, y, e: (t, y, e + 0.0018))(*sleeve(u, v0 + v * thick)),
                52,
                3,
                0.002,
            )

    def leg(self, surf, d, m, sign):
        sport = d.cut in ("court", "track")
        # A separate shell on each thigh permits full stride and hip flexion.
        if sport:

            def short(u, v):
                theta = (u - 0.5) * 2 * np.pi
                hem = (0.655 if d.cut == "track" else 0.672) + 0.022 * (np.sin(theta) * sign) ** 2
                return theta, hem + (0.812 - hem) * v, 0.010 + 0.006 * (1 - v)

            self.panel(surf, m["shell"] if d.cut == "court" else m["inset"], short, 56, 14, 0.015)
            self.panel(
                surf,
                m["accent"],
                lambda u, v: (short(u, v * 0)[0], short(u, v * 0)[1] + 0.006 * v, 0.017),
                56,
                2,
            )
        # Articulated knee cap follows the knee weights; piping stops at the flex crease.
        center = 0.468
        length = 0.095 if d.cut in ("work", "wrap") else 0.071

        def knee(u, v):
            t = (u - 0.5) * (1.78 + 0.48 * np.sin(np.pi * v))
            y = center + (v - 0.5) * length * 2 + 0.016 * (1 - np.cos(t))
            return t, y, 0.005 + 0.009 * np.sin(np.pi * v) * np.sin(np.pi * u)

        if d.cut != "court":
            self.panel(surf, m["inset"] if not sport else m["belt"], knee, 23, 14, 0.006)
            for v0 in (0.22, 0.73):
                self.panel(
                    surf,
                    m["binding"],
                    lambda u, v: (lambda t, y, e: (t, y, e + 0.0015))(
                        *knee(0.09 + 0.82 * u, v0 + 0.023 * v)
                    ),
                    18,
                    2,
                )
        else:
            self.band(surf, m["shell"], -np.pi, np.pi, 0.293, 0.332, 0.002, 48, 5, 0.003)
            for y in (0.306, 0.319):
                self.band(surf, m["inset"], -np.pi, np.pi, y, y + 0.004, 0.003, 48, 2)
        if d.pocket_side == sign:
            # Raised bellows pocket and lid are confined to one outer thigh.
            base = 0.730 if not sport else 0.739
            height = 0.091 if not sport else 0.057

            def pocket(u, v):
                t = sign * (1.18 + (u - 0.5) * (0.95 + 0.11 * np.sin(v * np.pi)))
                ease = 0.009 + 0.014 * (np.sin(np.pi * u) * np.sin(np.pi * v)) ** 0.65
                return t, base + (v - 0.5) * height + 0.007 * (u - 0.5), ease + (0.012 if sport else 0)

            self.panel(surf, m["shell"] if d.cut == "work" else m["inset"], pocket, 16, 10, 0.012)

            def flap(u, v):
                t = sign * (1.18 + (u - 0.5) * 1.03)
                return (
                    t,
                    base + height * 0.40 - 0.012 * np.sin(np.pi * u) + 0.021 * v,
                    0.023 + 0.011 * np.sin(np.pi * u) + (0.011 if sport else 0),
                )

            self.panel(surf, m["belt"], flap, 20, 6, 0.013)
            self.disc(
                surf,
                m["metal"],
                sign * 1.18,
                base + height * 0.38,
                0.09,
                0.008,
                0.037 + (0.011 if sport else 0),
            )
        if d.boot == "boot":
            self.band(surf, m["belt"], -np.pi, np.pi, 0.124, 0.208, 0.006, 50, 8)
            self.band(surf, m["binding"], -np.pi, np.pi, 0.199, 0.208, 0.009, 50, 3)
            self.band(surf, m["inset"], -np.pi, np.pi, 0.158, 0.172, 0.009, 50, 3)

    def shoe(self, surf, m, sign, boot):
        # Raised vamp straps follow the shoe section rather than passing through the ankle.
        if boot == "boot":
            for base in (0.046, 0.076):
                self.panel(
                    surf,
                    m["binding"],
                    lambda u, v: (sign * (u - 0.5) * 3.6, base + 0.016 * u + 0.009 * v, 0.0035),
                    28,
                    3,
                )
            self.disc(surf, m["metal"], sign * 1.28, 0.089, 0.24, 0.011, 0.006)
        self.band(surf, m["sole"], -np.pi, np.pi, 0.015, 0.021, 0.0015, 54, 2)

    def meshes(self):
        return [(mat, Piece.join(parts)) for mat, parts in self.parts.items()]
