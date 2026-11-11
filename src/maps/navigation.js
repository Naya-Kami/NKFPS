import {floorAt,toWorld} from './atlas.js';
import {createPhysicsWorld,bodyIsClear,PLAYER} from './physics.js';
const worlds=new WeakMap();

export function canOccupy(map,colliders,x,z,feet,radius=PLAYER.radius){
  const floor=floorAt(map,x,z,feet);if(floor===null||floor>feet+.68)return false;
  if(!worlds.has(colliders))worlds.set(colliders,createPhysicsWorld(map,colliders));
  return bodyIsClear(worlds.get(colliders),x,z,Math.max(feet,floor));
}
export function spawnPosition(map,id='attacker',colliders=[]){
  const poi=map.poi.find(p=>p.id===id)||map.labels.find(p=>p.id===id)||map.poi[0];
  const at=id==='core'?[507,468]:id==='atrium'?[633,618]:id==='pit'?[535,665]:poi.at,[x,,z]=toWorld(map,at);
  for(let ring=0;ring<=12;ring++)for(let i=0;i<(ring?24:1);i++){const a=i*Math.PI/12,nx=x+Math.cos(a)*ring*.35,nz=z+Math.sin(a)*ring*.35,floor=floorAt(map,nx,nz,100);if(floor!==null&&canOccupy(map,colliders,nx,nz,floor))return[nx,floor+PLAYER.eye,nz];}
  throw new Error(`No safe spawn near ${map.id}/${id}`);
}
