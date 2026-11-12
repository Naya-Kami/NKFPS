import {pointInPolygon,segmentPointDistance,toWorld} from '../maps/atlas.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createShoreField(map,size=128){
  const polygon=map.outer.map(p=>{const[x,,z]=toWorld(map,p);return[x,z];}),xs=polygon.map(p=>p[0]),zs=polygon.map(p=>p[1]);
  const min=[Math.min(...xs)-25,Math.min(...zs)-25],span=[Math.max(...xs)-min[0]+25,Math.max(...zs)-min[1]+25],data=new Uint8Array(size*size);
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const x=min[0]+i/(size-1)*span[0],z=min[1]+j/(size-1)*span[1];let d=Infinity;
    for(let k=0;k<polygon.length;k++)d=Math.min(d,segmentPointDistance(x,z,polygon[k],polygon[(k+1)%polygon.length]).distance);
    if(pointInPolygon(x,z,polygon))d=-d;data[j*size+i]=Math.round(clamp(.5+d/40,0,1)*255);
  }return{size,min,span,data};
}
export function sampleShoreDistance(field,x,z){
  const u=clamp((x-field.min[0])/field.span[0],0,1)*(field.size-1),v=clamp((z-field.min[1])/field.span[1],0,1)*(field.size-1),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,get=(x,z)=>field.data[Math.min(z,field.size-1)*field.size+Math.min(x,field.size-1)]/255;
  return((get(i,j)*(1-a)+get(i+1,j)*a)*(1-b)+(get(i,j+1)*(1-a)+get(i+1,j+1)*a)*b-.5)*40;
}
let cachedNoise;
export function cloudNoiseVolume(){
  if(cachedNoise)return cachedNoise;
  const size=64,data=new Uint8Array(size**3),smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
  const hash=(x,y,z)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
  function noise(x,y,z,period){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=smooth(x-ix),fy=smooth(y-iy),fz=smooth(z-iz),h=(a,b,c)=>hash(a%period,b%period,c%period);return mix(mix(mix(h(ix,iy,iz),h(ix+1,iy,iz),fx),mix(h(ix,iy+1,iz),h(ix+1,iy+1,iz),fx),fy),mix(mix(h(ix,iy,iz+1),h(ix+1,iy,iz+1),fx),mix(h(ix,iy+1,iz+1),h(ix+1,iy+1,iz+1),fx),fy),fz);}
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){let n=0;for(const[p,w]of[[4,.6],[8,.28],[16,.12]])n+=noise(x/size*p,y/size*p,z/size*p,p)*w;data[(z*size+y)*size+x]=Math.round(n*255);}
  return cachedNoise={size,data};
}
