import * as THREE from 'three';
import {pointInPolygon,toPixel} from '../maps/atlas.js';

function crossesWall(a,b,wall){
  const dx=b.x-a.x,dz=b.z-a.z,sx=wall.b[0]-wall.a[0],sz=wall.b[1]-wall.a[1],den=dx*sz-dz*sx;if(Math.abs(den)<1e-8)return false;
  const ex=wall.a[0]-a.x,ez=wall.a[1]-a.z,t=(ex*sz-ez*sx)/den,u=(ex*dz-ez*dx)/den;if(t<=.02||t>=.98||u<0||u>1)return false;
  const y=a.y+(b.y-a.y)*t;return y>wall.bottom&&y<wall.top;
}
export function selectEmitters(emitters,focus,budget,active=new Set(),map=null,walls=[]){
  const pixel=map?toPixel(map,focus.x,focus.z):null,room=map?.rooms.find(r=>pointInPolygon(...pixel,r.polygon));
  return emitters.map(light=>({light,score:score(light)})).sort((a,b)=>b.score-a.score).slice(0,budget).map(p=>p.light);
  function score(light){const d=light.position.distanceToSquared(focus);let score=light.intensity/(d+12);if(active.has(light))score*=1.25;if(room&&light.userData.roomId===room.id)score*=1.5;if(d<900&&walls.some(w=>crossesWall(focus,light.position,w)))score*=.12;return score;}
}

// Keep a fixed number of GPU lights. A slot fades out before changing source,
// avoiding both abrupt light pops and a temporary doubling of light count.
export function createLightBudget(parent,emitters,map,walls=[]){
  emitters.forEach(l=>l.visible=false);const group=new THREE.Group();parent.add(group);let slots=[];
  function setBudget(count){group.clear();slots=Array.from({length:count},()=>{const light=new THREE.PointLight(0xffffff,0,10,2);group.add(light);return{light,source:null,gain:0,desired:false};});}
  function select(focus){const active=new Set(slots.map(s=>s.source).filter(Boolean)),selected=new Set(selectEmitters(emitters,focus,slots.length,active,map,walls));slots.forEach(s=>s.desired=selected.has(s.source));return selected;}
  let selected=new Set();
  return{group,setBudget,select(focus){selected=select(focus);},update(dt){
    const held=new Set(slots.map(s=>s.source).filter(Boolean)),pending=[...selected].filter(l=>!held.has(l));
    for(const slot of slots){
      if((!slot.source||!slot.desired&&slot.gain<.025)&&pending.length){slot.source=pending.shift();slot.desired=true;slot.gain=0;slot.light.position.copy(slot.source.position);slot.light.color.copy(slot.source.color);slot.light.distance=slot.source.distance;slot.light.decay=slot.source.decay;}
      slot.gain+=(Number(slot.desired)-slot.gain)*(1-Math.exp(-dt/.18));slot.light.intensity=(slot.source?.intensity||0)*slot.gain;
    }
  },get count(){return slots.length;},dispose(){parent.remove(group);group.clear();slots=[];}};
}
