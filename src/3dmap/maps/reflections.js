import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {floorGeometry} from './geometry.js';
import {levelSurfaces} from './atlas.js';
import {qualityProfile} from '../rendering/quality.js';
import {surfaceContextGLSL, wetSurfaceGLSL} from '../rendering/surfaceContext.js';

export function mapReflections(map, normalMap, mobile, context) {
  const coastal = map.theme === 'coastal';
  const metro = map.theme === 'metro';
  const size = mobile ? 512 : 1024;
  const shader = {
    name: 'Localized floor reflections',
    uniforms: {
      color: {value: new THREE.Color(0xffffff)},
      tDiffuse: {value: null},
      textureMatrix: {value: null},
      normalTex: {value: normalMap},
      reflectTexel: {value: new THREE.Vector2(1 / size, 1 / size)},
      elapsed: {value: 0},
    },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vReflect;
      varying vec3 vWorld;
      void main() {
        vReflect = textureMatrix * vec4(position, 1.0);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform sampler2D normalTex;
      uniform vec2 reflectTexel;
      uniform float elapsed;
      varying vec4 vReflect;
      varying vec3 vWorld;
      ${surfaceContextGLSL}
      ${coastal ? wetSurfaceGLSL : ''}
      void main() {
        vec4 ground = readSurfaceContext(vWorld.xz);
        float wetness = ${coastal ? 'surfaceWater(vWorld.xz, ground)' : '0.0'};
        ${coastal ? 'if (wetness < 0.005) discard;' : ''}
        float viewUp = max(normalize(cameraPosition - vWorld).y, 0.0);
        float fresnel = 0.04 + 0.96 * pow(1.0 - viewUp, 5.0);
        float strength = ${coastal ? 'wetness * 0.62' : metro ? '0.095' : '0.24'};
        vec2 p = vReflect.xy / vReflect.w;
        vec2 detail = texture2D(normalTex, vWorld.xz * 0.4).rg - 0.5;
        p += detail * ${coastal ? 'mix(0.004, 0.0015, wetness)' : '0.003'};
        ${coastal ? 'p += sin(vWorld.xz * vec2(11.3, 13.7) + elapsed * 10.0) * 0.00055 * wetness;' : ''}
        vec2 edge = min(p, 1.0 - p);
        float edgeFade = smoothstep(0.0, 0.025, min(edge.x, edge.y));
        vec2 blur = reflectTexel * ${coastal ? 'mix(3.2, 1.1, wetness)' : metro ? '3.4' : '1.8'};
        vec3 reflection = texture2D(tDiffuse, p).rgb * 0.4;
        reflection += 0.15 * (texture2D(tDiffuse, p + vec2(blur.x, 0.0)).rgb +
          texture2D(tDiffuse, p - vec2(blur.x, 0.0)).rgb +
          texture2D(tDiffuse, p + vec2(0.0, blur.y)).rgb +
          texture2D(tDiffuse, p - vec2(0.0, blur.y)).rgb);
        gl_FragColor = vec4(reflection, edgeFade * ground.r * strength * (0.12 + fresnel * 0.88));
      }
    `,
  };
  const groundGeometry = floorGeometry(map, map.outer, map.floorHoles, levelSurfaces(map)[0].cuts);
  const mesh = new Reflector(groundGeometry.rotateX(Math.PI / 2), {
    textureWidth: size, textureHeight: size, clipBias: .04, multisample: 0, shader,
  });
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .017;
  mesh.material.transparent = true;
  mesh.material.depthWrite = false;
  mesh.renderOrder = 2;
  const uniforms = mesh.material.uniforms;
  Object.assign(uniforms, context.uniforms);
  uniforms.normalTex.value = normalMap;

  let frames = 0;
  let quality = mobile ? 'balanced' : 'high';
  let profile = qualityProfile(quality, mobile);
  const before = mesh.onBeforeRender;
  const lastPosition = new THREE.Vector3(Infinity, 0, 0);
  const lastRotation = new THREE.Quaternion();
  mesh.onBeforeRender = function (renderer, scene, camera) {
    if (scene.overrideMaterial || quality === 'performance') return;
    const moved = lastPosition.distanceToSquared(camera.position) > .00001 ||
      lastRotation.angleTo(camera.quaternion) > .0003;
    if (!moved && frames++ % profile.reflectionInterval !== 0) return;
    lastPosition.copy(camera.position);
    lastRotation.copy(camera.quaternion);
    before.call(this, renderer, scene, camera);
  };

  return {
    mesh,
    update(time, visible) {
      uniforms.elapsed.value = time;
      mesh.visible = visible && quality !== 'performance' && (!coastal || uniforms.surfaceRain.value > .02);
    },
    setNormalMap(normal) { uniforms.normalTex.value = normal; },
    setQuality(next) {
      quality = next;
      profile = qualityProfile(quality, mobile);
      frames = 0;
      lastPosition.set(Infinity, 0, 0);
      mesh.getRenderTarget().setSize(profile.reflection, profile.reflection);
      uniforms.reflectTexel.value.setScalar(1 / profile.reflection);
    },
    dispose() {
      mesh.getRenderTarget().dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
