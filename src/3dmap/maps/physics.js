import {levelSurfaces,stairProgress,surfaceContains,pointInPolygon,segmentPointDistance,toPixel} from './atlas.js';

export const PLAYER={radius:.27,height:1.78,eye:1.7,step:.24,gravity:18,jump:5.2};
const EPS=.012;
function polygonDistance(p,poly){return Math.min(...poly.map((v,i)=>segmentPointDistance(...p,v,poly[(i+1)%poly.length]).distance));}
export function overlapsCollider(map,c,x,z,r=PLAYER.radius){
  if(c.kind==='wall'||c.kind==='rail')return segmentPointDistance(x,z,c.a,c.b).distance<c.thickness/2+r;
  if(c.kind==='circle')return Math.hypot(x-c.x,z-c.z)<c.radius+r;
  if(c.kind==='box'){const dx=x-c.x,dz=z-c.z,co=Math.cos(c.angle||0),si=Math.sin(c.angle||0),lx=dx*co-dz*si,lz=dx*si+dz*co;return Math.abs(lx)<c.w/2+r&&Math.abs(lz)<c.d/2+r;}
  if(c.kind==='slab'){
    const p=toPixel(map,x,z),rp=r/map.scale;if(!pointInPolygon(...p,c.polygon)&&polygonDistance(p,c.polygon)>rp)return false;
    return ![...(c.holes||[]),...(c.cuts||[])].some(h=>pointInPolygon(...p,h)&&polygonDistance(p,h)>rp);
  }
  if(c.kind==='ramp')return stairProgress({...c.stair,width:c.stair.width+2*r/map.scale},toPixel(map,x,z))!==null;
  return false;
}
function boundsAt(world,c,x,z){if(c.kind==='rail'&&c.yA!==undefined){const t=segmentPointDistance(x,z,c.a,c.b).t,bottom=c.yA+(c.yB-c.yA)*t;return[bottom,bottom+1.25];}if(c.kind!=='ramp')return[c.bottom,c.top];const t=stairProgress({...c.stair,width:c.stair.width+2*PLAYER.radius/world.map.scale},toPixel(world.map,x,z));const top=c.stair.fromY+(c.stair.toY-c.stair.fromY)*(t??0);return[top-.24,top];}
export function createPhysicsWorld(map,colliders=[]){
  const world={map,solids:[...colliders,...levelSurfaces(map).map(s=>({...s,kind:'slab'})),...map.stairs.map(stair=>({kind:'ramp',stair}))],grid:new Map()};
  for(const c of world.solids){let xs,zs,pad=PLAYER.radius+.08;
    if(c.kind==='slab'){const p=c.polygon.map(p=>[(p[0]-map.origin[0])*map.scale,(p[1]-map.origin[1])*map.scale]);xs=p.map(p=>p[0]);zs=p.map(p=>p[1]);}
    else if(c.kind==='ramp'){const s=c.stair;xs=[s.from[0],s.to[0]].map(x=>(x-map.origin[0])*map.scale);zs=[s.from[1],s.to[1]].map(z=>(z-map.origin[1])*map.scale);pad+=s.width*map.scale/2;}
    else if(c.a){xs=[c.a[0],c.b[0]];zs=[c.a[1],c.b[1]];pad+=(c.thickness||0)/2;}
    else{const r=c.kind==='circle'?c.radius:Math.hypot(c.w,c.d)/2;xs=[c.x-r,c.x+r];zs=[c.z-r,c.z+r];}
    for(let x=Math.floor((Math.min(...xs)-pad)/4);x<=Math.floor((Math.max(...xs)+pad)/4);x++)for(let z=Math.floor((Math.min(...zs)-pad)/4);z<=Math.floor((Math.max(...zs)+pad)/4);z++){const key=x+','+z;if(!world.grid.has(key))world.grid.set(key,[]);world.grid.get(key).push(c);}
  }return world;
}
export const collisionCandidates=(world,x,z)=>world.grid.get(Math.floor(x/4)+','+Math.floor(z/4))||[];
export function bodyIsClear(world,x,z,feet,height=PLAYER.height){
  for(const c of collisionCandidates(world,x,z)){if(!overlapsCollider(world.map,c,x,z))continue;const[bottom,top]=boundsAt(world,c,x,z);if(feet<top-EPS&&feet+height>bottom+EPS)return false;}return true;
}
export function supportHeight(world,x,z,maxY=Infinity,minY=-Infinity){
  const p=toPixel(world.map,x,z);let floor=null;
  for(const c of collisionCandidates(world,x,z)){let top;
    if(c.kind==='slab'){if(!surfaceContains(c,p,PLAYER.radius/world.map.scale))continue;top=c.top;}
    else if(c.kind==='ramp'){const t=stairProgress(c.stair,p);if(t===null)continue;top=c.stair.fromY+(c.stair.toY-c.stair.fromY)*t;}
    else{if(!overlapsCollider(world.map,c,x,z,0))continue;top=boundsAt(world,c,x,z)[1];}
    if(top<=maxY+EPS&&top>=minY-EPS&&(floor===null||top>floor))floor=top;
  }return floor;
}

// Substeps prevent tunnelling. Swept vertical intervals handle landings and
// head hits against the same static shapes as the visible architecture.
export function stepPlayer(state,world,input,dt){
  const pos=state.position,jump=!!input.jump,height=input.height??PLAYER.height;if(jump&&!state.jumpHeld&&state.onGround){state.verticalVelocity=PLAYER.jump;state.onGround=false;}state.jumpHeld=jump;
  const n=Math.max(1,Math.ceil(Math.min(dt,.2)/(1/90))),step=Math.min(dt,.2)/n;
  for(let i=0;i<n;i++){
    for(const axis of['x','z']){
      const amount=(input[axis]||0)*step;if(!amount)continue;const x=pos.x+(axis==='x'?amount:0),z=pos.z+(axis==='z'?amount:0),feet=pos.y-PLAYER.eye;
      const support=state.onGround?supportHeight(world,x,z,feet+PLAYER.step,feet-.32):null,target=state.onGround&&support!==null?support:feet;
      if(bodyIsClear(world,x,z,target,height)){pos.x=x;pos.z=z;if(state.onGround&&support!==null)pos.y=target+PLAYER.eye;}
    }
    const feet=pos.y-PLAYER.eye;state.verticalVelocity=Math.max(-32,state.verticalVelocity-PLAYER.gravity*step);let next=feet+state.verticalVelocity*step;
    if(state.verticalVelocity<=0){const floor=supportHeight(world,pos.x,pos.z,feet+.02,next);if(floor!==null){next=floor;state.verticalVelocity=0;state.onGround=true;}else state.onGround=false;}
    else{for(const c of collisionCandidates(world,pos.x,pos.z)){if(!overlapsCollider(world.map,c,pos.x,pos.z))continue;const[bottom]=boundsAt(world,c,pos.x,pos.z);if(feet+height<=bottom+EPS&&next+height>=bottom){next=Math.min(next,bottom-height);state.verticalVelocity=0;}}state.onGround=false;}
    pos.y=next+PLAYER.eye;
  }
  if(state.onGround&&bodyIsClear(world,pos.x,pos.z,pos.y-PLAYER.eye,height))state.safePosition={x:pos.x,y:pos.y,z:pos.z};
  const kill=world.map.theme==='sky'?-32:world.map.theme==='coastal'?-13:-10;
  if(pos.y<kill&&state.safePosition){Object.assign(pos,state.safePosition);state.verticalVelocity=0;state.onGround=true;state.recoveries=(state.recoveries||0)+1;}
}
