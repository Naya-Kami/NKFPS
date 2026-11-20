import * as THREE from 'three';
import {levelSurfaces, pointInPolygon, surfaceContains, toWorld, wallSegments} from '../maps/atlas.js';

const MAP_PADDING = 6;
const MIN_HEIGHT = -8;
const HEIGHT_RANGE = 20;

// RGB+A stores wall proximity, exposure to rain, shelter height, and floor height.
// World-space sampling lets the floor, wall bases, reflections and rain share
// the same map without adding a separate pass or a light per object.
export function createSurfaceContext(map, mobile = false) {
  const resolution = mobile ? 160 : 224;
  const [left, north, right, south] = map.frame;
  const [minX, , minZ] = toWorld(map, [left, north]);
  const [maxX, , maxZ] = toWorld(map, [right, south]);
  const bounds = new THREE.Vector4(
    minX - MAP_PADDING, minZ - MAP_PADDING,
    maxX - minX + 2 * MAP_PADDING, maxZ - minZ + 2 * MAP_PADDING,
  );
  const heightEncoding = new THREE.Vector2(MIN_HEIGHT, HEIGHT_RANGE);
  const data = new Uint8Array(resolution * resolution * 4);
  const roofs = map.rooms.filter(room => !room.openEdges);
  const surfaces = levelSurfaces(map);
  const wallReach = 2.5 / map.scale;
  const encodeHeight = y => Math.round(255 * THREE.MathUtils.clamp((y - MIN_HEIGHT) / HEIGHT_RANGE, 0, 1));
  const pixelLeft = map.origin[0] + bounds.x / map.scale;
  const pixelNorth = map.origin[1] + bounds.y / map.scale;
  const stepX = bounds.z / (resolution * map.scale);
  const stepZ = bounds.w / (resolution * map.scale);

  for (let row = 0; row < resolution; row++) {
    const z = pixelNorth + (row + .5) * stepZ;
    for (let col = 0; col < resolution; col++) {
      const x = pixelLeft + (col + .5) * stepX;
      const pixel = [x, z];
      let floor = MIN_HEIGHT;
      let shelter = MIN_HEIGHT;
      for (const surface of surfaces) {
        if (!surfaceContains(surface, pixel)) continue;
        if (surface.id === 'ground' || surface.top <= 0) floor = Math.max(floor, surface.top);
        else shelter = Math.max(shelter, surface.top);
      }
      for (const room of roofs) {
        if (pointInPolygon(x, z, room.polygon)) {
          shelter = Math.max(shelter, (room.floorY || 0) + (room.wallHeight || 3.6) + .15);
        }
      }
      if (map.theme === 'metro' && pointInPolygon(x, z, map.outer)) shelter = 6.5;
      const index = (row * resolution + col) * 4;
      data[index] = 255;
      data[index + 1] = shelter > 0 ? 0 : 255;
      data[index + 2] = encodeHeight(shelter);
      data[index + 3] = encodeHeight(floor);
    }
  }

  // Visit only cells within a wall's local influence. Long sections of open
  // concourse stay cheap, and door openings use the same split as collision.
  for (const {a, b, base, height, thickness} of wallSegments(map)) {
    if (base > .3 || height < .5) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    const halfThickness = thickness / (2 * map.scale);
    const reach = wallReach + halfThickness;
    const left = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - pixelLeft) / stepX));
    const right = Math.min(resolution - 1, Math.ceil((Math.max(a[0], b[0]) + reach - pixelLeft) / stepX));
    const north = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - pixelNorth) / stepZ));
    const south = Math.min(resolution - 1, Math.ceil((Math.max(a[1], b[1]) + reach - pixelNorth) / stepZ));
    for (let row = north; row <= south; row++) {
      const az = pixelNorth + (row + .5) * stepZ - a[1];
      for (let col = left; col <= right; col++) {
        const ax = pixelLeft + (col + .5) * stepX - a[0];
        const t = THREE.MathUtils.clamp((ax * dx + az * dz) / lengthSquared, 0, 1);
        const distance = Math.hypot(ax - dx * t, az - dz * t) - halfThickness;
        const visibility = Math.round(255 * THREE.MathUtils.smoothstep(distance, .5, wallReach));
        const index = (row * resolution + col) * 4;
        data[index] = Math.min(data[index], visibility);
      }
    }
  }

  const texture = new THREE.DataTexture(data, resolution, resolution);
  texture.name = `${map.id} surface context`;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    uniforms: {
      surfaceContext: {value: texture},
      surfaceBounds: {value: bounds},
      surfaceHeight: {value: heightEncoding},
      surfaceRain: {value: map.theme === 'coastal' ? 1 : 0},
    },
    update(weather, dt) {
      const rain = this.uniforms.surfaceRain;
      const target = map.theme === 'coastal' && weather ? 1 : 0;
      rain.value = THREE.MathUtils.damp(rain.value, target, .65, dt);
    },
    dispose() { texture.dispose(); },
  };
}

export const surfaceContextGLSL = `
uniform sampler2D surfaceContext;
uniform vec4 surfaceBounds;
uniform vec2 surfaceHeight;
uniform float surfaceRain;
vec4 readSurfaceContext(vec2 worldXZ) {
  return texture2D(surfaceContext, (worldXZ - surfaceBounds.xy) / surfaceBounds.zw);
}
`;

export const wetSurfaceGLSL = `
float wetHash(vec2 p) {
  return fract(sin(dot(p, vec2(43.71, 92.37))) * 23187.12);
}
float wetNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wetHash(cell), wetHash(cell + vec2(1.0, 0.0)), f.x),
    mix(wetHash(cell + vec2(0.0, 1.0)), wetHash(cell + vec2(1.0)), f.x), f.y);
}
float surfaceWater(vec2 worldXZ, vec4 localSurface) {
  float basin = wetNoise(worldXZ * 0.38) * 0.74 + wetNoise(worldXZ * 1.3) * 0.26;
  return surfaceRain * smoothstep(0.65, 0.97, localSurface.g) * smoothstep(0.57, 0.74, basin);
}
`;
