import * as THREE from 'three';
import {surfaceContextGLSL} from './surfaceContext.js';

// Animate streaks on the GPU in world space. Each streak uses the same traced
// shelter and deck heights as the wet surfaces beneath it.
export function createCoastalRain(context, mobile) {
  const count = mobile ? 1050 : 2300;
  const positions = new Float32Array(count * 6);
  const streaks = new Float32Array(count * 4);
  const span = 46;
  let seed = 92731;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < count; i++) {
    const start = [random() * span, random() * 22, random() * span];
    positions.set(start, i * 6);
    positions.set(start, i * 6 + 3);
    const speed = 11 + random() * 7;
    streaks.set([0, speed, .045, speed], i * 4);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('streak', new THREE.BufferAttribute(streaks, 2));
  const material = new THREE.ShaderMaterial({
    uniforms: {...context.uniforms, elapsed: {value: 0}, night: {value: 0}},
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec2 streak;
      uniform float elapsed;
      varying vec3 vRainPosition;
      varying float vDistance;
      void main() {
        vec2 wind = vec2(2.4, 0.8);
        vec2 anchor = cameraPosition.xz;
        vec2 fall = mod(position.xz + elapsed * wind - anchor + 23.0, 46.0) - 23.0 + anchor + streak.x * wind;
        float y = mod(position.y - elapsed * streak.y, 22.0) - 7.0 - streak.x * streak.y;
        vRainPosition = vec3(fall.x, y, fall.y);
        vec4 view = viewMatrix * vec4(vRainPosition, 1.0);
        vDistance = length(view.xyz);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      ${surfaceContextGLSL}
      uniform float night;
      varying vec3 vRainPosition;
      varying float vDistance;
      void main() {
        vec4 localSurface = readSurfaceContext(vRainPosition.xz);
        float floorY = surfaceHeight.x + localSurface.a * surfaceHeight.y;
        float roofY = surfaceHeight.x + localSurface.b * surfaceHeight.y;
        float clearHeight = max(floorY, roofY);
        float visible = smoothstep(clearHeight + 0.05, clearHeight + 0.65, vRainPosition.y);
        visible *= smoothstep(1.0, 2.5, vDistance) * (1.0 - smoothstep(13.0, 25.0, vDistance));
        gl_FragColor = vec4(mix(vec3(0.45, 0.57, 0.65), vec3(0.23, 0.29, 0.38), night), visible * 0.26);
      }
    `,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.name = 'Coastal rain with roof and deck occlusion';
  mesh.frustumCulled = false;
  return {
    mesh,
    update(time, weather, night) {
      material.uniforms.elapsed.value = time;
      material.uniforms.night.value = night ? 1 : 0;
      mesh.visible = weather;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
