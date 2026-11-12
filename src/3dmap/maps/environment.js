import * as THREE from 'three';
import {createCloudSea} from './clouds.js';
import {createOcean} from './ocean.js';
export function buildEnvironment(map,mats,mobile,options={}){
  const group=new THREE.Group(),disposables=[],animate=[];
  const add=m=>{group.add(m);disposables.push(m);return m;};
  if(map.theme==='coastal'){
    const water=createOcean(map,mobile,options.skyHDR);group.add(water.mesh);
    const count=mobile?900:1800,positions=new Float32Array(count*6);for(let i=0;i<count;i++){const x=Math.random()*140-70,y=Math.random()*45,z=Math.random()*150-65;positions.set([x,y,z,x-.08,y-.6,z],i*6);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));const rain=add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xb9cbd1,transparent:true,opacity:.14,depthWrite:false})));
    let last=0;return{group,update(t,weather,night){water.update(t,night);rain.visible=weather;const dt=Math.min(.1,t-last);last=t;const a=g.attributes.position.array;for(let i=0;i<count;i++){a[i*6+1]-=dt*13;a[i*6+4]-=dt*13;if(a[i*6+1]<-6){a[i*6+1]+=52;a[i*6+4]+=52;}}g.attributes.position.needsUpdate=true;},setQuality(){},dispose(){water.dispose();dispose();}};
  }
  if(map.theme==='sky'){
    const clouds=createCloudSea(mobile);group.add(clouds.mesh);return{group,update(t,weather,night,camera){clouds.update(t,night,camera);},setQuality:q=>clouds.setQuality(q),dispose(){clouds.dispose();dispose();}};
  }
  const outer=[[-120,-100],[120,-100],[120,100],[-120,100]],shape=new THREE.Shape();outer.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
  const hole=new THREE.Path();map.outer.forEach(([px,py],i)=>{const x=(px-map.origin[0])*.1,z=-(py-map.origin[1])*.1;i?hole.lineTo(x,z):hole.moveTo(x,z);});hole.closePath();shape.holes.push(hole);
  const rock=add(new THREE.Mesh(new THREE.ShapeGeometry(shape),mats.foundation));rock.rotation.x=-Math.PI/2;rock.position.y=-.7;
  return{group,update(){},setQuality(){},dispose};
  function dispose(){for(const m of disposables){m.geometry?.dispose();m.material?.dispose();}}
}
