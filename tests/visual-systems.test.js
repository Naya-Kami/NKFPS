import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {lightingPreset} from '../src/3dmap/rendering/lighting.js';
import {createShoreField,sampleShoreDistance,cloudNoiseVolume} from '../src/3dmap/rendering/naturalFields.js';
import {createLightBudget,selectEmitters} from '../src/3dmap/rendering/lightBudget.js';

const brightness=hex=>{const c=new THREE.Color(hex);return c.r*.2126+c.g*.7152+c.b*.0722;};
test('night presets darken atmosphere, fog and illumination for all three map themes',()=>{
  for(const theme of['coastal','sky','metro']){
    const day=lightingPreset(theme,false,true),night=lightingPreset(theme,true,true);
    assert.ok(brightness(night.background)<brightness(day.background));assert.ok(brightness(night.fog)<brightness(day.fog));assert.ok(night.sun<day.sun);assert.ok(night.hemi<day.hemi);assert.ok(night.environmentIntensity<day.environmentIntensity);assert.ok(Math.abs(Math.hypot(...day.sunDirection)-1)<.01);
  }
});
test('shore distance follows a concave coastline rather than its bounding ellipse',()=>{
  const map={outer:[[0,0],[12,0],[12,4],[4,4],[4,12],[0,12]],origin:[0,0],scale:1},field=createShoreField(map,160);
  assert.ok(sampleShoreDistance(field,2,8)<-1.5);assert.ok(sampleShoreDistance(field,8,8)>3.3);assert.ok(Math.abs(sampleShoreDistance(field,14,2)-2)<.3);assert.ok(sampleShoreDistance(field,8,2)<-1.5);
});
test('cloud density volume has coherent three-dimensional detail and a bounded memory footprint',()=>{
  const {size,data}=cloudNoiseVolume();assert.equal(size,64);assert.equal(data.byteLength,262144);let min=255,max=0,totalStep=0;
  for(let i=1;i<data.length;i++){min=Math.min(min,data[i]);max=Math.max(max,data[i]);if(i%size)totalStep+=Math.abs(data[i]-data[i-1]);}
  assert.ok(max-min>80);assert.ok(totalStep/data.length<10);assert.ok(data.some((n,i)=>i+size*size<data.length&&n!==data[i+size*size]));
});
function emitter(x){const l=new THREE.PointLight(0xffffff,10,20,2);l.position.set(x,2,0);return l;}
test('light transitions preserve the GPU light limit and fade smoothly between rooms',()=>{
  const scene=new THREE.Scene(),lights=[0,2,8,10].map(emitter),map={origin:[0,0],scale:1,rooms:[]},pool=createLightBudget(scene,lights,map);pool.setBudget(2);pool.select(new THREE.Vector3(0,1.7,0));
  for(let i=0;i<90;i++)pool.update(1/60);assert.deepEqual(pool.group.children.map(l=>l.position.x).sort((a,b)=>a-b),[0,2]);
  pool.select(new THREE.Vector3(10,1.7,0));let previous=pool.group.children.map(l=>l.intensity);
  for(let i=0;i<150;i++){pool.update(1/60);assert.equal(pool.group.children.length,2);pool.group.children.forEach((l,j)=>assert.ok(Math.abs(l.intensity-previous[j])<1));previous=pool.group.children.map(l=>l.intensity);}
  assert.deepEqual(pool.group.children.map(l=>l.position.x).sort((a,b)=>a-b),[8,10]);assert.ok(pool.group.children.every(l=>l.intensity>9.5));assert.ok(lights.every(l=>!l.visible));pool.dispose();assert.equal(scene.children.length,0);
});
test('wall occlusion and retention affect emitter selection without increasing the budget',()=>{
  const lights=[emitter(2),emitter(8)],focus=new THREE.Vector3(0,1.7,0),wall={a:[4,-2],b:[4,2],bottom:0,top:3};lights[1].intensity=100;
  assert.equal(selectEmitters(lights,focus,1)[0],lights[1]);assert.equal(selectEmitters(lights,focus,1,new Set(),null,[wall])[0],lights[0]);
  const close=[emitter(1),emitter(-1)];assert.equal(selectEmitters(close,focus,1,new Set([close[1]]))[0],close[1]);
});
