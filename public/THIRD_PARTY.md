# Third-party assets and photographic surfaces

- Three.js (MIT): https://github.com/mrdoob/three.js
- Vite (MIT): https://github.com/vitejs/vite
- Barlow and Barlow Condensed, Jeremy Tribby (SIL OFL 1.1): https://github.com/jpt/barlow — license included in fonts/OFL-Barlow.txt.
- IBM Plex Mono, IBM (SIL OFL 1.1): https://github.com/IBM/plex — license included in fonts/OFL-IBMPlexMono.txt.

## Photographic PBR materials (CC0 1.0)

Each material contains a photographed color map, OpenGL normal map, and roughness map. Base maps are resized to at most 1024 pixels. Selected HIGH/ULTRA maps retain the original 2K resolution, without upscaling, and load on demand. All maps use WebP with original aspect ratio for memory and transfer budgets. Surface coordinates use meters in world space. Exact source URLs and SHA-256 hashes of delivered assets are in assets/pbr/sources.json.

- Concrete047A (floor) — ambientCG: https://ambientcg.com/view?id=Concrete047A
- Rusty Painted Metal — Amal Kumar / Poly Haven: https://polyhaven.com/a/rusty_painted_metal
- Asphalt 03 — Charlotte Baglioni and Dario Barresi / Poly Haven: https://polyhaven.com/a/asphalt_03
- Gravel Embedded Concrete — Charlotte Baglioni / Poly Haven: https://polyhaven.com/a/gravel_embedded_concrete
- Weathered Steel / Metal055A — ambientCG: https://ambientcg.com/view?id=Metal055A
- Concrete034 — ambientCG: https://ambientcg.com/view?id=Concrete034
- Rock058 — ambientCG: https://ambientcg.com/view?id=Rock058

The Poly Haven material maps were obtained from the CC0 asset mirrors in https://github.com/AetherRadar/operation-steel-tide/tree/main/assets/textures (see that directory's LICENSE.md). The ambientCG maps were obtained from https://github.com/petroulacl/fps-asset-kit/tree/main/textures (see its README license summary). Only the documented texture assets were reused; no game code or external agent instructions were adopted.

## Dusk environment (CC0 1.0)

Kloppenheim 06 Pure Sky — Greg Zaal, sky edits by Jarod Guest / Poly Haven: https://polyhaven.com/a/kloppenheim_06_puresky

1K HDR obtained from the same documented operation-steel-tide texture mirror, original SHA-256 206c67e3a1b992282821cf06662bdd69bbb4915c1c4444a66338a40d6a7d4e34. Used for the environment, sky background, and ocean reflections.

The earlier Venice Sunset environment (Greg Zaal / Poly Haven, CC0) is retained as an unused legacy asset: https://polyhaven.com/a/venice_sunset.

CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/

Facility geometry, terrain forms, wet-floor mask, coastline distance field, procedural ocean movement, cloud density volume, blossom cutouts and instanced foliage, contact-shadow decals, interface, and tactical map are authored for this project. Three.js Sky (MIT, part of the dependency above) supplies the atmospheric sky used for both the Skyport background and image-based lighting. The user's concept images guide the layout and art direction; they are not used as screenshots or flat replacements for the interactive 3D world.

## Supplied map design references

`references/blacksite.jpg`, `references/skyport.jpg`, and `references/terminal.jpg` are the user's supplied Blacksite Echo, Skyport Nexus, and Terminal Below concept maps, preserved unchanged for side-by-side comparison. Their file hashes are recorded in `references/manifest.json`. They are separate from the CC0 material library above. Map footprints, room/wall coordinates and 3D geometry are reconstructed from these supplied references; small hidden or undimensioned details are interpreted.
