import * as THREE from 'three';
import {toWorld} from './atlas.js';
export function blueprintShape(map,poly,holes=[]){
  const shape=new THREE.Shape();poly.forEach((p,i)=>{const [x,,z]=toWorld(map,p);i?shape.lineTo(x,-z):shape.moveTo(x,-z);});shape.closePath();
  for(const points of holes){const hole=new THREE.Path();points.forEach((p,i)=>{const [x,,z]=toWorld(map,p);i?hole.lineTo(x,-z):hole.moveTo(x,-z);});hole.closePath();shape.holes.push(hole);}
  return shape;
}
export function floorGeometry(map,poly,holes=[],cuts=[]){
  const base=new THREE.ShapeGeometry(blueprintShape(map,poly,holes)).rotateX(-Math.PI/2);if(!cuts.length)return base;
  const cutter=cuts.map(p=>p.map(v=>{const[x,,z]=toWorld(map,v);return[x,z];})),p=base.attributes.position,ix=base.index,vertices=[];
  for(let i=0;i<ix.count;i+=3){let pieces=[[0,1,2].map(j=>{const k=ix.getX(i+j);return[p.getX(k),p.getZ(k)];})];for(const cut of cutter)pieces=pieces.flatMap(piece=>subtractConvex(piece,cut));for(const piece of pieces)for(let j=1;j<piece.length-1;j++)for(const[x,z]of[piece[0],piece[j],piece[j+1]])vertices.push(x,0,z);}
  base.dispose();const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap((v,i)=>i%3===1?[]:[v]),2));result.computeVertexNormals();return result;
}
// Partition triangulated floors around stairwells, even where a cut meets an
// exterior boundary. ShapeGeometry holes alone cannot represent these notches.
function subtractConvex(subject,cut){
  const sign=Math.sign(cut.reduce((a,p,i)=>{const q=cut[(i+1)%cut.length];return a+p[0]*q[1]-q[0]*p[1];},0))||1,out=[];let inside=subject;
  for(let i=0;i<cut.length&&inside.length>=3;i++){const a=cut[i],b=cut[(i+1)%cut.length],side=p=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));const clip=keep=>{const result=[];for(let j=0;j<inside.length;j++){const u=inside[j],v=inside[(j+1)%inside.length],du=side(u),dv=side(v),ui=keep*du>=-1e-7,vi=keep*dv>=-1e-7;if(ui)result.push(u);if(ui!==vi){const t=du/(du-dv);result.push([u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t]);}}return result;};const outside=clip(-1);if(outside.length>=3)out.push(outside);inside=clip(1);}
  return out;
}
export function slabGeometry(map,poly,depth=.5,holes=[],cuts=[]){
  if(!cuts.length)return new THREE.ExtrudeGeometry(blueprintShape(map,poly,holes),{depth,bevelEnabled:false,steps:1}).rotateX(-Math.PI/2).translate(0,-depth,0);
  const floor=floorGeometry(map,poly,holes,cuts),p=floor.attributes.position,faces=[],edges=new Map();
  for(let i=0;i<p.count;i+=3){const tri=[0,1,2].map(j=>[p.getX(i+j),0,p.getZ(i+j)]);faces.push(...tri.flat(),...[...tri].reverse().flatMap(v=>[v[0],-depth,v[2]]));for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=[a,b].map(v=>[v[0].toFixed(4),v[2].toFixed(4)].join(',')).sort().join('|');const e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,count:1});}}
  for(const {a,b,count}of edges.values())if(count===1){const c=[a[0],-depth,a[2]],d=[b[0],-depth,b[2]];faces.push(...a,...c,...b,...b,...c,...d);}
  floor.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(faces,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(faces.flatMap((v,i)=>i%3===1?[]:[v]),2));g.computeVertexNormals();return g;
}
export function stairsPolygon(stair){const dx=stair.to[0]-stair.from[0],dy=stair.to[1]-stair.from[1],length=Math.hypot(dx,dy),nx=-dy/length*stair.width/2,ny=dx/length*stair.width/2;return[[stair.from[0]+nx,stair.from[1]+ny],[stair.to[0]+nx,stair.to[1]+ny],[stair.to[0]-nx,stair.to[1]-ny],[stair.from[0]-nx,stair.from[1]-ny]];}
