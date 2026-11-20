import * as THREE from 'three';
import {createCloudSea} from './clouds.js';
import {createOcean} from './ocean.js';
import {createCoastalRain} from '../rendering/coastalRain.js';
export function buildEnvironment(map,mats,mobile,options={}){
  const group=new THREE.Group(),disposables=[],animate=[];
  const add=m=>{group.add(m);disposables.push(m);return m;};
  if(map.theme==='coastal'){
    const water=createOcean(map,mobile,options.skyHDR);group.add(water.mesh);
    const rain=createCoastalRain(options.surfaceContext,mobile);group.add(rain.mesh);
    return{group,update(t,weather,night){water.update(t,night);rain.update(t,weather,night);},setQuality(){},dispose(){water.dispose();rain.dispose();dispose();}};
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
