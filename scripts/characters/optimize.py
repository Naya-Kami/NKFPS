"""Reduce the original subdivision meshes while keeping UV seams and skinning transitions."""

from dataclasses import replace
import ctypes as ct

import meshoptimizer
import numpy as np
from meshoptimizer.simplifier import lib

# The pinned binding declares simplify() but omits the typed signature of this native overload.
if lib.meshopt_simplifyWithAttributes.argtypes is None:
    floats = ct.POINTER(ct.c_float)
    indices = ct.POINTER(ct.c_uint)
    size = ct.c_size_t
    lib.meshopt_simplifyWithAttributes.argtypes = [
        indices,
        indices,
        size,
        floats,
        size,
        size,
        floats,
        size,
        floats,
        size,
        ct.POINTER(ct.c_ubyte),
        size,
        ct.c_float,
        ct.c_uint,
        floats,
    ]
    lib.meshopt_simplifyWithAttributes.restype = size


def simplify(p, fraction):
    if len(p.faces) < 700:
        return p
    # Blender split many identical corners before exporting. Weld equivalent corners only.
    attributes = np.column_stack(
        (np.round(p.pos, 6), np.round(p.normal, 4), np.round(p.uv, 6), p.joint, np.round(p.weight, 5))
    )
    _, ids, remap = np.unique(attributes, axis=0, return_index=True, return_inverse=True)
    compact = type(p)(
        p.pos[ids], p.normal[ids], p.uv[ids], p.joint[ids], p.weight[ids], remap[p.faces].astype("u4")
    )
    # Encode the *weighted joint identities*. Four weight magnitudes alone cannot distinguish,
    # for example, a corner bound to the wrist from one bound to the forearm.
    embedding = np.random.default_rng(521).uniform(-1, 1, (256, 7))
    binding = np.sum(embedding[compact.joint] * compact.weight[:, :, None], axis=1)
    features = np.ascontiguousarray(np.column_stack((compact.normal, compact.uv, binding)), dtype="f4")
    importance = np.array([0.018] * 3 + [0.065] * 2 + [0.060] * binding.shape[1], dtype="f4")
    indices = compact.faces.ravel()
    out = np.empty_like(indices)
    count = meshoptimizer.simplify_with_attributes(
        out,
        indices,
        np.ascontiguousarray(compact.pos, dtype="f4"),
        features,
        importance,
        target_index_count=3 * int(len(p.faces) * fraction),
        target_error=0.006,
        options=meshoptimizer.SIMPLIFY_LOCK_BORDER,
    )
    return replace(compact, faces=out[:count].reshape(-1, 3)).select(slice(None))
