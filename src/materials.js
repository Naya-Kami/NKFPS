import * as THREE from 'three';

export const SCANNED_SURFACES=['wall','concrete','metal','rock','asphalt','aggregate','steel'];

// Photographic PBR textures use meters in world space, so no wall or prop
// inherits the stretched 0..1 UV coordinates of its underlying primitive.
export async function loadScannedSurfaces(renderer,{names=SCANNED_SURFACES,resolution='base'}={}) {
  const loader=new THREE.TextureLoader();
  const anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  const sets=await Promise.all(names.map(async name=>{
    const maps=await Promise.all(['color','normal','roughness'].map(async channel=>{
      const t=await loader.loadAsync(`/assets/pbr/${resolution==='hi'?'hi/':''}${name}-${channel}.webp`);
      t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=anisotropy;
      if(channel==='color')t.colorSpace=THREE.SRGBColorSpace;
      return t;
    }));
    return [name,{map:maps[0],normalMap:maps[1],roughnessMap:maps[2]}];
  }));
  return Object.fromEntries(sets);
}

export function worldMapped(material,scale=.4,weathering=.2,saturation=1) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.surfaceScale={value:scale};
    shader.uniforms.surfaceWeather={value:weathering};shader.uniforms.scanSaturation={value:saturation};
    shader.vertexShader=`varying vec3 vScanPosition;varying vec3 vScanNormal;\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>\nvScanPosition=(modelMatrix*vec4(transformed,1.)).xyz;vScanNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    shader.fragmentShader=`varying vec3 vScanPosition;varying vec3 vScanNormal;uniform float surfaceScale;uniform float surfaceWeather;uniform float scanSaturation;
    float scanHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float scanNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(scanHash(i),scanHash(i+vec2(1,0)),f.x),mix(scanHash(i+vec2(0,1)),scanHash(i+1.),f.x),f.y);}
    vec3 scanWeights(){vec3 w=pow(abs(normalize(vScanNormal)),vec3(6.));return w/(w.x+w.y+w.z+.00001);}
    vec4 scanTexture(sampler2D tex){vec3 w=scanWeights();vec3 p=vScanPosition*surfaceScale;return texture2D(tex,p.zy)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
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
    #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      float roughnessFactor=roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor*=scanTexture(roughnessMap).g;
      #endif
      roughnessFactor=clamp(roughnessFactor,.06,1.);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
    #ifdef USE_NORMALMAP
      vec3 w=scanWeights();vec3 p=vScanPosition*surfaceScale;vec3 sn=normalize(vScanNormal);
      vec3 nx=texture2D(normalMap,p.zy).xyz*2.-1.;
      vec3 ny=texture2D(normalMap,p.xz).xyz*2.-1.;
      vec3 nz=texture2D(normalMap,p.xy).xyz*2.-1.;
      vec3 worldBump=normalize(vec3(nx.z*sign(sn.x),nx.y,nx.x)*w.x+vec3(ny.x,ny.z*sign(sn.y),ny.y)*w.y+vec3(nz.x,nz.y,nz.z*sign(sn.z))*w.z);
      normal=normalize(mat3(viewMatrix)*normalize(mix(sn,worldBump,clamp(normalScale.x,0.,1.))));
    #endif`);
  };
  material.customProgramCacheKey=()=>`scanned-triplanar-v3:${scale}:${weathering}:${saturation}`;
  return material;
}
