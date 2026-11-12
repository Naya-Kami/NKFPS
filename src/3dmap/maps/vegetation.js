import * as THREE from 'three';

function blossomTexture(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),a=Math.atan2(v,u),edge=.66+.2*Math.cos(a*5),alpha=THREE.MathUtils.clamp((edge-r)*25,0,1),i=(y*size+x)*4;data[i]=255;data[i+1]=r<.16?205:245;data[i+2]=r<.16?152:249;data[i+3]=Math.round(alpha*255);}
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
export function createBlossomCanopy(branches,mobile=false,seed=1847){
  const texture=blossomTexture(),material=new THREE.MeshStandardMaterial({map:texture,alphaTest:.42,alphaToCoverage:true,side:THREE.DoubleSide,roughness:.85,metalness:0,emissive:0x50313e,emissiveIntensity:.13});
  const count=mobile?950:2100,mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(.2,.2),material,count),dummy=new THREE.Object3D(),palette=[0xffe5ec,0xeeb1c5,0xd48fa7,0xf2d5dc],rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<count;i++){
    const c=branches[i%branches.length],theta=rand()*Math.PI*2,cos=rand()*2-1,r=Math.cbrt(rand())*.95,sin=Math.sqrt(1-cos*cos);
    dummy.position.set(c[0]+Math.cos(theta)*sin*r,c[1]+cos*r*.7,c[2]+Math.sin(theta)*sin*r);dummy.rotation.set(rand()*Math.PI,rand()*Math.PI*2,rand()*Math.PI);dummy.scale.setScalar(.65+rand()*.85);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(palette[i%palette.length]));
  }
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.name='Cherry blossom canopy';return mesh;
}
