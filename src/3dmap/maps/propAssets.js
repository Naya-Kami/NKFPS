import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const PROP_ASSETS=['crate','barrel','cabinet'];
export function normalizePropAsset(scene){
  scene.updateMatrixWorld(true);const meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  if(meshes.length!==1)throw new Error('Expected a single static mesh in the bundled prop');
  const mesh=meshes[0],geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();
  const bounds=geometry.boundingBox,center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());geometry.translate(-center.x,-bounds.min.y,-center.z);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return{geometry,material:mesh.material,size};
}
export async function loadPropAssets(renderer){
  const loader=new GLTFLoader(),entries=new Map();
  await Promise.all(PROP_ASSETS.map(async id=>{const gltf=await loader.loadAsync(`/assets/props/${id}.glb`),asset=normalizePropAsset(gltf.scene);for(const value of Object.values(asset.material))if(value?.isTexture)value.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());entries.set(id,asset);}));
  return{get:id=>entries.get(id),dispose(){for(const asset of entries.values()){asset.geometry.dispose();const textures=new Set(Object.values(asset.material).filter(t=>t?.isTexture));textures.forEach(t=>t.dispose());asset.material.dispose();}}};
}
export function createPropBatch(library,parent){
  const records=new Map(),meshes=[];
  return{
    place(id,position,scale=1,angle=0){const template=library.get(id);if(!template)return null;if(!records.has(id))records.set(id,{template,matrices:[]});const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle),new THREE.Vector3(scale,scale,scale));records.get(id).matrices.push(matrix);return template.size.clone().multiplyScalar(scale);},
    finish(){for(const[id,{template,matrices}]of records){const mesh=new THREE.InstancedMesh(template.geometry.clone(),template.material.clone(),matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.name=`PBR prop / ${id}`;parent.add(mesh);meshes.push(mesh);}},
    // Textures belong to the library, shared across maps; only dispose clones.
    dispose(){meshes.forEach(mesh=>mesh.material.dispose());records.clear();}
  };
}

// Packing preserves the model's real proportions, using stacked objects rather
// than stretching one small crate into a giant cube.
export function crateArrangement(size,w,h,d){
  const gap=Math.min(.025,w*.02),scale=Math.min((w-gap)/(size.x*2),d/size.z,h/size.y,1.35),items=[];let y=0;
  for(let level=0;level<4;level++){
    const turnedScale=Math.min(scale,w/size.z,d/size.x),layerScale=level%2===0?scale:turnedScale;
    if(y+size.y*layerScale>h+1e-8)break;
    if(level%2===0){for(const sign of[-1,1])items.push({x:sign*(size.x*scale+gap)/2,y,z:0,angle:0,scale});}
    else items.push({x:0,y,z:0,angle:Math.PI/2,scale:turnedScale});
    y+=size.y*layerScale;
  }return items;
}
