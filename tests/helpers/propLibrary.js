import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PROP_ASSETS,normalizePropAsset} from '../../src/3dmap/maps/propAssets.js';

// Parse the actual bundled geometry and materials; replace only image decoding,
// which requires a browser. GPU texture appearance is a separate verification.
export async function bundledPropLibrary(){
  const loader=new GLTFLoader();loader.register(parser=>{parser.loadTextureImage=()=>Promise.resolve(new THREE.Texture());return{name:'CPU_IMAGE_DECODER'};});
  const entries=new Map();for(const id of PROP_ASSETS){const b=readFileSync(new URL(`../../public/assets/props/${id}.glb`,import.meta.url)),gltf=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');entries.set(id,normalizePropAsset(gltf.scene));}
  return{get:id=>entries.get(id)};
}
