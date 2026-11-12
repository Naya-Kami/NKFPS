import * as THREE from 'three';
import {Sky} from 'three/addons/objects/Sky.js';

export function lightingPreset(theme,night=false,playing=false){
  const metro=theme==='metro',sky=theme==='sky';
  return{
    background:metro?(night?0x05090f:0x080d10):sky?(night?0x08142b:0x9bb4ce):(night?0x0b1727:0x425b68),
    fog:metro?(night?0x070c13:0x111b21):sky?(night?0x111e35:0xb6cbd9):(night?0x102131:0x557080),
    fogDensity:playing?(metro?.006:.0024):.0004,
    environmentIntensity:night?(metro?.2:.18):metro?.55:sky?.8:.7,
    backgroundIntensity:night?.22:sky?.68:.65,
    hemi:night?.32:metro?(playing?.8:1.4):sky?1.25:1.1,
    sun:night?(metro?.08:.12):metro?.35:sky?3:2.3,
    sunColor:night?0x93b6de:sky?0xffeddb:0xffdfba,
    rim:night?.16:metro?.3:.6,
    exposure:metro?1.2:sky?1:1.05,
    sunDirection:sky?[-.5,.707,.5]:[-.457,.762,.457]
  };
}

// Background and reflections come from the same rendered atmosphere.
export function createSkyLighting(renderer,mobile=false){
  const scene=new THREE.Scene(),sky=new Sky();sky.scale.setScalar(1000);scene.add(sky);
  const u=sky.material.uniforms;u.turbidity.value=5.5;u.rayleigh.value=2.1;u.mieCoefficient.value=.004;u.mieDirectionalG.value=.82;
  const pmrem=new THREE.PMREMGenerator(renderer),resources=[];
  function capture(night){
    const elevation=night?-9:45;u.sunPosition.value.setFromSphericalCoords(1,THREE.MathUtils.degToRad(90-elevation),THREE.MathUtils.degToRad(315));
    const cube=new THREE.WebGLCubeRenderTarget(mobile?256:512,{type:THREE.HalfFloatType,generateMipmaps:false});
    new THREE.CubeCamera(.1,1500,cube).update(renderer,scene);
    const filtered=pmrem.fromCubemap(cube.texture);resources.push(cube,filtered);return{background:cube.texture,environment:filtered.texture};
  }
  const day=capture(false),night=capture(true);pmrem.dispose();sky.geometry.dispose();sky.material.dispose();
  return{day,night,dispose(){resources.forEach(r=>r.dispose());}};
}
