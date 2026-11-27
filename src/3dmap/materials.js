import * as THREE from 'three';
import {surfaceContextGLSL, wetSurfaceGLSL} from './rendering/surfaceContext.js';
import {publicAsset} from './publicAsset.js';

export const SCANNED_SURFACES=['wall','concrete','metal','rock','asphalt','aggregate','steel'];
const ACTIVE_SURFACES=['wall','concrete','metal','rock','steel'];

// Photographic PBR textures use meters in world space, so no wall or prop
// inherits the stretched 0..1 UV coordinates of its underlying primitive.
export async function loadScannedSurfaces(renderer,{names=ACTIVE_SURFACES,resolution='base'}={}) {
  const loader=new THREE.TextureLoader();
  const anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  const sets=await Promise.all(names.map(async name=>{
    const maps=await Promise.all(['color','normal','roughness'].map(async channel=>{
      const t=await loader.loadAsync(publicAsset(`assets/pbr/${resolution==='hi'?'hi/':''}${name}-${channel}.webp`));
      t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=anisotropy;
      if(channel==='color')t.colorSpace=THREE.SRGBColorSpace;
      return t;
    }));
    return [name,{map:maps[0],normalMap:maps[1],roughnessMap:maps[2]}];
  }));
  return Object.fromEntries(sets);
}

export function worldMapped(material,scale=.4,weathering=.2,saturation=1,tileSize=0) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.surfaceScale={value:scale};
    shader.uniforms.surfaceWeather={value:weathering};shader.uniforms.scanSaturation={value:saturation};shader.uniforms.surfaceTileSize={value:tileSize};
    shader.vertexShader=`varying vec3 vScanPosition;varying vec3 vScanNormal;\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>\nvScanPosition=(modelMatrix*vec4(transformed,1.)).xyz;vScanNormal=inverseTransformDirection(transformedNormal,viewMatrix);`);
    shader.fragmentShader=`varying vec3 vScanPosition;varying vec3 vScanNormal;uniform float surfaceScale;uniform float surfaceWeather;uniform float scanSaturation;uniform float surfaceTileSize;
    float scanHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float scanNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(scanHash(i),scanHash(i+vec2(1,0)),f.x),mix(scanHash(i+vec2(0,1)),scanHash(i+1.),f.x),f.y);}
    float scanTileEdge(){if(surfaceTileSize<.01)return 0.;vec2 uv=vScanPosition.xz/surfaceTileSize,dist=min(fract(uv),1.-fract(uv))*surfaceTileSize;float line=min(dist.x,dist.y),aa=max(fwidth(line),.001);return 1.-smoothstep(.003-aa,.007+aa,line);}
    vec3 scanWeights(){vec3 w=pow(abs(normalize(vScanNormal)),vec3(6.));return w/(w.x+w.y+w.z+.00001);}
    vec3 scanSigns(){return mix(vec3(-1.),vec3(1.),step(vec3(0.),vScanNormal));}
    vec4 scanTexture(sampler2D tex){vec3 w=scanWeights(),s=scanSigns(),p=vScanPosition*surfaceScale;return texture2D(tex,vec2(-s.x*p.z,p.y))*w.x+texture2D(tex,vec2(p.x,-s.y*p.z))*w.y+texture2D(tex,vec2(s.z*p.x,p.y))*w.z;}
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
    #ifdef USE_MAP
      vec4 scannedColor=scanTexture(map);scannedColor.rgb=mix(vec3(dot(scannedColor.rgb,vec3(.2126,.7152,.0722))),scannedColor.rgb,scanSaturation);
      diffuseColor*=scannedColor;
      float lowDamp=1.-smoothstep(-.5,2.7,vScanPosition.y);
      float surfaceMottle=scanNoise(vScanPosition.xz*.29);
      float wallMask=1.-abs(normalize(vScanNormal).y);
      float streaks=pow(scanNoise(vec2((vScanPosition.x+vScanPosition.z)*3.7,vScanPosition.y*.065)),4.);
      diffuseColor.rgb*=1.-surfaceWeather*(lowDamp*(.25+surfaceMottle*.4)+wallMask*streaks*.9);
      if(surfaceTileSize>.01){diffuseColor.rgb*=mix(.95,1.045,scanHash(floor(vScanPosition.xz/surfaceTileSize)));diffuseColor.rgb*=1.-scanTileEdge()*.32;}
    #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      float roughnessFactor=roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor*=scanTexture(roughnessMap).g;
      #endif
      roughnessFactor=clamp(roughnessFactor,.06,1.);
      roughnessFactor=mix(roughnessFactor,.88,scanTileEdge());
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
    #ifdef USE_NORMALMAP
      vec3 w=scanWeights(),s=scanSigns(),p=vScanPosition*surfaceScale,sn=normalize(vScanNormal);
      vec3 nx=texture2D(normalMap,vec2(-s.x*p.z,p.y)).xyz*2.-1.;
      vec3 ny=texture2D(normalMap,vec2(p.x,-s.y*p.z)).xyz*2.-1.;
      vec3 nz=texture2D(normalMap,vec2(s.z*p.x,p.y)).xyz*2.-1.;
      nx=normalize(vec3(nx.xy*normalScale,nx.z));ny=normalize(vec3(ny.xy*normalScale,ny.z));nz=normalize(vec3(nz.xy*normalScale,nz.z));
      // Whiteout reorientation preserves the geometric normal for a neutral map,
      // including curved surfaces and all six projection directions.
      vec3 bx=vec3(-s.x*sn.z+nx.x,sn.y+nx.y,abs(sn.x)*nx.z);
      vec3 by=vec3(sn.x+ny.x,-s.y*sn.z+ny.y,abs(sn.y)*ny.z);
      vec3 bz=vec3(s.z*sn.x+nz.x,sn.y+nz.y,abs(sn.z)*nz.z);
      vec3 worldBump=normalize(vec3(s.x*bx.z,bx.y,-s.x*bx.x)*w.x+vec3(by.x,s.y*by.z,-s.y*by.y)*w.y+vec3(s.z*bz.x,bz.y,s.z*bz.z)*w.z);
      #ifdef DOUBLE_SIDED
        worldBump*=faceDirection;
      #endif
      normal=normalize(mat3(viewMatrix)*worldBump);
    #endif`);
  };
  material.customProgramCacheKey=()=>`scanned-triplanar-v4:${scale}:${weathering}:${saturation}:${tileSize}`;
  return material;
}

export function applySurfaceContext(material, context, {wet = false, enclosed = false} = {}) {
  const originalCompile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${cacheKey}:surface-context:${wet}:${enclosed}`;
  material.onBeforeCompile = shader => {
    originalCompile(shader);
    Object.assign(shader.uniforms, context.uniforms);
    shader.fragmentShader = `${surfaceContextGLSL}${wet ? wetSurfaceGLSL : ''}${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec4 localSurface = readSurfaceContext(vScanPosition.xz);
      float localFloor = surfaceHeight.x + localSurface.a * surfaceHeight.y;
      float localRoof = surfaceHeight.x + localSurface.b * surfaceHeight.y;
      float nearFloor = 1.0 - smoothstep(0.05, 1.25, abs(vScanPosition.y - localFloor));
      float wallContact = (1.0 - localSurface.r) * nearFloor;
      float underRoof = (1.0 - smoothstep(0.1, 0.9, localSurface.g)) *
        smoothstep(0.1, 1.4, localRoof - vScanPosition.y);
      ${wet ? `float localWater = nearFloor * surfaceWater(vScanPosition.xz, localSurface);
        diffuseColor.rgb *= 1.0 - 0.28 * localWater;` : ''}
      diffuseColor.rgb *= 1.0 - 0.11 * wallContact;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `
      ${wet ? 'roughnessFactor = mix(roughnessFactor, 0.26, localWater * 0.75);' : ''}
      #include <metalnessmap_fragment>
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `
      #include <aomap_fragment>
      float localOcclusion = (1.0 - 0.27 * wallContact) * (1.0 - ${enclosed ? '0.09' : '0.24'} * underRoof);
      reflectedLight.indirectDiffuse *= localOcclusion;
      reflectedLight.indirectSpecular *= localOcclusion;
    `);
  };
}
