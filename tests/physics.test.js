import {bundledPropLibrary} from './helpers/propLibrary.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MAPS,toWorld,levelSurfaces,stairProgress,rectPoly} from '../src/3dmap/maps/atlas.js';
import {floorGeometry,slabGeometry} from '../src/3dmap/maps/geometry.js';
import {buildMap,createMaterials} from '../src/3dmap/maps/model.js';
import {spawnPosition} from '../src/3dmap/maps/navigation.js';
import {PLAYER,createPhysicsWorld,stepPlayer,bodyIsClear,collisionCandidates,overlapsCollider} from '../src/3dmap/maps/physics.js';

globalThis.document={createElement(){return{width:0,height:0,getContext(){return{fillRect(){},fillText(){},createRadialGradient(){return{addColorStop(){}}}}}}}};
const propLibrary=await bundledPropLibrary();
const models=new Map();
function realWorld(map){if(!models.has(map.id)){const scans=Object.fromEntries(['wall','concrete','steel','rock','metal'].map(n=>[n,{}])),model=buildMap(map,createMaterials(scans,map.theme),{mobile:true,assets:propLibrary});models.set(map.id,{model,world:createPhysicsWorld(map,model.colliders)});}return models.get(map.id);}
const fixture=(extra={})=>({id:'fixture',origin:[0,0],scale:1,theme:'coastal',outer:rectPoly([-10,-10,20,20]),floorHoles:[],stairs:[],additionalFloors:[],bridges:[],rooms:[],...extra});
const player=(x=0,feet=0,z=0)=>({position:{x,y:feet+PLAYER.eye,z},verticalVelocity:0,onGround:true});
function simulate(state,world,seconds,input={}){for(let i=0;i<seconds*60;i++)stepPlayer(state,world,input,1/60);}

test('voids apply gravity instead of creating an invisible floor at zero, then recover to safe ground',()=>{
  const map=fixture({floorHoles:[rectPoly([-2,-2,4,4])]}),world=createPhysicsWorld(map),state=player();
  simulate(state,world,.8);assert.ok(state.position.y<0);assert.equal(state.onGround,false);
  state.safePosition={x:5,y:PLAYER.eye,z:5};simulate(state,world,1);assert.equal(state.recoveries,1);assert.equal(state.position.x,5);assert.ok(Math.abs(state.position.y-PLAYER.eye)<.02);
});
test('falling lands on a real crate top and upward motion stops at a ceiling',()=>{
  const map=fixture(),box={kind:'box',x:0,z:0,w:2,d:2,angle:0,bottom:0,top:.75},world=createPhysicsWorld(map,[box]),state=player(0,3);
  state.onGround=false;simulate(state,world,1);assert.ok(Math.abs(state.position.y-PLAYER.eye-.75)<.02);assert.ok(bodyIsClear(world,0,0,.75));
  const ceiling={kind:'slab',polygon:rectPoly([-2,-2,4,4]),bottom:2,top:2.2},low=createPhysicsWorld(map,[ceiling]),jumper=player();let high=0;
  for(let i=0;i<90;i++){stepPlayer(jumper,low,{jump:true},1/60);high=Math.max(high,jumper.position.y-PLAYER.eye);}assert.ok(high>0);assert.ok(high<=2-PLAYER.height+.02);assert.ok(Math.abs(jumper.position.y-PLAYER.eye)<.02);
});
test('thin walls stop sprinting even on a long frame, while allowing sliding along the wall',()=>{
  const map=fixture(),world=createPhysicsWorld(map,[{kind:'wall',a:[1,-5],b:[1,5],thickness:.1,bottom:0,top:3}]),state=player();
  for(let i=0;i<8;i++)stepPlayer(state,world,{x:6.6,z:1},.2);assert.ok(state.position.x<.7);assert.ok(state.position.z>1);
});
test('holding jump does not trigger repeated jumps on landing',()=>{
  const world=createPhysicsWorld(fixture()),state=player();simulate(state,world,2,{jump:true});assert.ok(Math.abs(state.position.y-PLAYER.eye)<.02);assert.equal(state.onGround,true);
  stepPlayer(state,world,{jump:false},1/60);stepPlayer(state,world,{jump:true},1/60);assert.ok(state.position.y>PLAYER.eye);
});
test('stairwells remove visible deck triangles and slab faces at the ascending route',()=>{
  const map=fixture({stairs:[{id:'access',from:[0,0],to:[4,0],width:2,fromY:0,toY:3}],bridges:[{id:'bridge',polygon:rectPoly([2,-2,4,4]),floorY:3}]}),surface=levelSurfaces(map).find(f=>f.id==='bridge');
  const geom=floorGeometry(map,surface.polygon,[],surface.cuts),mesh=new THREE.Mesh(geom,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.y=3;mesh.updateMatrixWorld();
  const ray=new THREE.Raycaster(new THREE.Vector3(3,8,0),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(mesh).length,0);ray.ray.origin.x=5;assert.ok(ray.intersectObject(mesh).length>0);
  const slab=slabGeometry(map,surface.polygon,.25,[],surface.cuts);for(const n of slab.attributes.position.array)assert.ok(Number.isFinite(n));geom.dispose();slab.dispose();
  assert.equal(stairProgress(map.stairs[0],[-.1,0]),null);assert.equal(stairProgress(map.stairs[0],[4.1,0]),null);
});
for(const map of Object.values(MAPS)){
  test(`${map.id}: every staircase can be walked in both directions with the actual player controller`,()=>{
    const{world}=realWorld(map);
    for(const s of map.stairs)for(const reverse of[false,true]){
      const start=reverse?s.to:s.from,end=reverse?s.from:s.to,fromY=reverse?s.toY:s.fromY,toY=reverse?s.fromY:s.toY,[x,,z]=toWorld(map,start),state=player(x,fromY,z),length=Math.hypot(end[0]-start[0],end[1]-start[1]),input={x:(end[0]-start[0])/length*2,z:(end[1]-start[1])/length*2};
      simulate(state,world,length*map.scale/2,input);const target=toWorld(map,end);assert.ok(Math.hypot(state.position.x-target[0],state.position.z-target[2])<.12,`${s.id||s.label} ${reverse?'down':'up'} did not reach its landing`);assert.ok(Math.abs(state.position.y-PLAYER.eye-toY)<.18,`${s.id||s.label} landing height`);assert.ok(bodyIsClear(world,state.position.x,state.position.z,state.position.y-PLAYER.eye),`${s.id||s.label} body penetration`);
    }
  });
  test(`${map.id}: all named destinations spawn on clear supported ground`,()=>{
    const{model,world}=realWorld(map);for(const poi of [...map.poi,...map.labels]){const[x,y,z]=spawnPosition(map,poi.id,model.colliders);assert.ok(bodyIsClear(world,x,z,y-PLAYER.eye),poi.id);}
  });
  test(`${map.id}: spatial collision lookup retains nearby architectural blockers`,()=>{
    const{world}=realWorld(map);for(const c of world.solids.filter(c=>c.a||c.kind==='box'||c.kind==='circle')){const x=c.x??(c.a[0]+c.b[0])/2,z=c.z??(c.a[1]+c.b[1])/2;if(overlapsCollider(map,c,x,z))assert.ok(collisionCandidates(world,x,z).includes(c));}
  });
}

test('Skyport raised service flanks connect through the intended stairs and doors to security',()=>{
  const map=MAPS.skyport,{world}=realWorld(map),points=[[279,438],[279,400],[279,264],[321,215],[344,213],[367,204],[450,200],[470,221],[505,240],[519,271],[540,271],[600,252]];
  for(const east of[false,true]){const path=points.map(p=>east?[1264-p[0],p[1]]:p),start=toWorld(map,path[0]),state=player(start[0],0,start[2]);for(const p of path.slice(1)){const target=toWorld(map,p);for(let i=0;i<1200&&Math.hypot(target[0]-state.position.x,target[2]-state.position.z)>.045;i++){const dx=target[0]-state.position.x,dz=target[2]-state.position.z,n=Math.hypot(dx,dz);stepPlayer(state,world,{x:dx/n*2,z:dz/n*2},1/60);}assert.ok(Math.hypot(target[0]-state.position.x,target[2]-state.position.z)<.1,`${east?'east':'west'} flank blocked before ${p}`);}assert.ok(Math.abs(state.position.y-PLAYER.eye-2)<.1);}
});
