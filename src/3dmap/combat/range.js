import * as THREE from 'three';
import {segmentPointDistance,stairProgress,surfaceContains,toPixel} from '../maps/atlas.js';
import {bodyIsClear,collisionCandidates,overlapsCollider,PLAYER,supportHeight} from '../maps/physics.js';

const MAX_TARGETS=3;
const TARGET_HEALTH=100;
const TARGET_RESPAWN=2;
const TRACE_SPACING=.035;
const TRAIL_LENGTH=7;
const TRAIL_LINGER=.09;
const MAX_TRACERS=32;
const MAX_IMPACTS=12;
const Y_AXIS=new THREE.Vector3(0,1,0);

function solidAt(world,point){
  const {x,y,z}=point;
  let pixel;
  for(const collider of collisionCandidates(world,x,z)){
    if(collider.kind==='ramp'){
      const stair=collider.stair;
      if(y<Math.min(stair.fromY,stair.toY)-.24||y>Math.max(stair.fromY,stair.toY))continue;
      pixel??=toPixel(world.map,x,z);
      const progress=stairProgress(stair,pixel);
      if(progress===null)continue;
      const top=THREE.MathUtils.lerp(stair.fromY,stair.toY,progress);
      if(y>=top-.24&&y<=top)return collider;
      continue;
    }
    if(y<collider.bottom||y>collider.top)continue;
    if(collider.kind==='slab'){
      pixel??=toPixel(world.map,x,z);
      if(surfaceContains(collider,pixel))return collider;
    }else if(collider.kind==='rail'&&collider.yA!==undefined){
      const {distance,t}=segmentPointDistance(x,z,collider.a,collider.b);
      const height=THREE.MathUtils.lerp(collider.yA,collider.yB,t);
      if(distance<=collider.thickness/2&&y>=height&&y<=height+1.25)return collider;
    }else if(overlapsCollider(world.map,collider,x,z,0)){
      return collider;
    }
  }
  return null;
}

// Sweep the segment in small increments so fast projectiles still stop on map geometry.
export function traceRangeSegment(world,start,end,sample=new THREE.Vector3()){
  const steps=Math.ceil(start.distanceTo(end)/TRACE_SPACING);
  if(solidAt(world,start))return 0;
  for(let i=1;i<=steps;i++){
    const fraction=i/steps;
    if(!solidAt(world,sample.lerpVectors(start,end,fraction)))continue;
    let low=(i-1)/steps,high=fraction;
    for(let refine=0;refine<5;refine++){
      const middle=(low+high)/2;
      if(solidAt(world,sample.lerpVectors(start,end,middle)))high=middle;
      else low=middle;
    }
    return high;
  }
  return null;
}

function targetLanes(world,eye,yaw){
  const feet=eye.y-PLAYER.eye;
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const lanes=[];
  const sample=new THREE.Vector3(),sight=new THREE.Vector3();
  const standingY=(x,z)=>supportHeight(world,x,z,feet+.24,feet-.32);

  function lanePoint(center,offset){
    const point=center.clone().addScaledVector(right,offset);
    const floor=standingY(point.x,point.z);
    if(floor===null||Math.abs(floor-center.y)>.04||!bodyIsClear(world,point.x,point.z,floor))return null;
    point.y=floor;
    sight.copy(point).y+=1.38;
    return traceRangeSegment(world,eye,sight,sample)===null?point:null;
  }

  for(const [distance,offset] of [[8,0],[11,-2.5],[13,2.7],[6,-2],[9,2.2],[5,0],[4,-1.4],[4,1.4],[3,0],[2.3,0],[2.6,-1.6],[2.6,1.6]]){
    const center=eye.clone().addScaledVector(forward,distance).addScaledVector(right,offset);
    center.y=standingY(center.x,center.z);
    if(center.y===null||!lanePoint(center,0))continue;
    if(lanes.some(lane=>lane.center.distanceTo(center)<2.2))continue;
    let halfWidth=0;
    for(let width=.24;width<=1.45;width+=.24){
      if(!lanePoint(center,-width)||!lanePoint(center,width))break;
      halfWidth=width;
    }
    lanes.push({center,right,halfWidth});
    if(lanes.length===MAX_TARGETS)break;
  }
  return lanes;
}

function makeRobot(lane,index,geometry,materials){
  const group=new THREE.Group();
  const torso=new THREE.Group();
  torso.position.y=.93;
  group.add(torso);
  const marks=[];
  const armor=materials.armor[index];

  function part(parent,shape,material,position,size,zone){
    const mesh=new THREE.Mesh(geometry[shape],material);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    parent.add(mesh);
    if(zone)marks.push({mesh,zone});
    return mesh;
  }
  function pivot(parent,x,y,z=0){
    const joint=new THREE.Group();
    joint.position.set(x,y,z);
    parent.add(joint);
    return joint;
  }

  part(torso,'box',materials.frame,[0,.015,0],[.34,.20,.28],'body');
  part(torso,'box',materials.frame,[0,.185,0],[.37,.29,.27],'body');
  part(torso,'bevel',armor,[0,.30,.046],[.49,.33,.32],'body');
  part(torso,'box',materials.frame,[0,.28,-.18],[.29,.27,.12],'body');
  part(torso,'box',materials.joint,[0,.29,.222],[.28,.17,.034]);
  for(const x of [-.081,0,.081])part(torso,'box',materials.signal,[x,.29,.244],[.021,.096,.018]);

  const head=pivot(torso,0,.555);
  part(torso,'box',materials.joint,[0,.48,0],[.16,.17,.15]);
  part(head,'bevel',materials.frame,[0,.095,0],[.315,.30,.29],'head');
  part(head,'bevel',armor,[0,.149,-.013],[.31,.185,.28],'head');
  part(head,'box',materials.joint,[0,.097,.142],[.265,.116,.051],'head');
  part(head,'box',materials.signal,[0,.104,.175],[.198,.033,.013]);
  for(const side of [-1,1])part(head,'box',armor,[side*.167,.104,-.007],[.049,.11,.125],'head');

  const arms=[],legs=[];
  for(const side of [-1,1]){
    const shoulder=pivot(torso,side*.295,.345);
    part(shoulder,'bevel',armor,[0,-.025,0],[.185,.174,.22],'body');
    part(shoulder,'box',materials.frame,[0,-.161,0],[.105,.199,.12],'body');
    const elbow=pivot(shoulder,0,-.255);
    part(elbow,'bevel',materials.frame,[0,-.112,0],[.123,.206,.141],'body');
    part(elbow,'box',armor,[0,-.104,.075],[.104,.155,.026]);
    part(elbow,'box',materials.joint,[0,-.248,.002],[.094,.102,.088],'body');
    arms.push({shoulder,elbow,side});

    const hip=pivot(group,side*.125,.929);
    part(hip,'bevel',materials.frame,[0,-.187,0],[.178,.352,.182],'body');
    part(hip,'box',armor,[0,-.155,.097],[.136,.206,.034]);
    const knee=pivot(hip,0,-.402);
    part(knee,'box',materials.joint,[0,-.019,0],[.137,.147,.156],'body');
    part(knee,'bevel',materials.frame,[0,-.222,.004],[.147,.316,.16],'body');
    part(knee,'box',armor,[0,-.218,.091],[.127,.214,.034]);
    part(knee,'bevel',materials.frame,[0,-.466,.051],[.178,.124,.263],'body');
    legs.push({hip,knee,side});
  }

  const target={group,torso,head,arms,legs,lane,index,marks,health:TARGET_HEALTH,respawn:0,tint:0};
  for(const {mesh,zone} of marks)mesh.userData.rangeHit={target,zone};
  group.position.copy(lane.center);
  return target;
}

function poseRobot(target,time,dt,eye){
  if(target.respawn>0){
    target.respawn=Math.max(0,target.respawn-dt);
    if(target.respawn>0)return;
    target.health=TARGET_HEALTH;
    target.group.visible=true;
  }
  const {group,torso,head,arms,legs,lane,index}=target;
  const phase=time*(1.05+index*.12)+index*1.7;
  const travel=Math.sin(phase)*lane.halfWidth;
  const lateralSpeed=Math.cos(phase)*Math.min(1,lane.halfWidth);
  const gait=phase*4;
  const stride=Math.abs(lateralSpeed);
  group.position.copy(lane.center).addScaledVector(lane.right,travel);
  group.rotation.y=Math.atan2(eye.x-group.position.x,eye.z-group.position.z);
  target.tint=Math.max(0,target.tint-dt);
  torso.rotation.set(-target.tint*1.25,Math.sin(phase*1.6)*.06,lateralSpeed*-.085);
  torso.position.y=.93+Math.sin(time*3+index)*.009-Math.abs(Math.sin(gait))*.019*stride;
  head.rotation.y=Math.sin(phase)*.12;
  for(const {shoulder,elbow,side} of arms){
    shoulder.rotation.set(Math.sin(gait)*side*.26*stride-.08,0,side*.14-lateralSpeed*.13);
    elbow.rotation.x=-.22-Math.max(0,Math.sin(gait)*side)*.19*stride;
  }
  for(const {hip,knee,side} of legs){
    const swing=Math.sin(gait)*side;
    hip.rotation.set(swing*.20*stride,0,(lateralSpeed+side*.35)*.17*stride);
    knee.rotation.x=Math.max(0,-swing)*.37*stride;
  }
  group.updateMatrixWorld(true);
}

export function createPracticeRange(scene,world,{onHit=()=>{}}={}){
  const group=new THREE.Group();
  group.name='Practice range';
  group.visible=false;
  scene.add(group);
  const geometry={
    box:new THREE.BoxGeometry(1,1,1),
    bevel:new THREE.DodecahedronGeometry(.64,0),
    pulse:new THREE.IcosahedronGeometry(1,0),
    ring:new THREE.RingGeometry(.82,1,18)
  };
  const material=(color,metalness=.2)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.47});
  const materials={
    frame:material(0x283944,.56),
    joint:material(0x121a22,.4),
    armor:[0xf7a65a,0xe08754,0xffc171].map(color=>material(color,.31)),
    signal:new THREE.MeshBasicMaterial({color:new THREE.Color(0xffaa4b).multiplyScalar(1.8),toneMapped:false})
  };
  const targets=[],tracers=[],impacts=[];
  let time=0;
  let hitMeshes=[];
  const eye=new THREE.Vector3();
  const sample=new THREE.Vector3(),end=new THREE.Vector3(),direction=new THREE.Vector3();
  const trailStart=new THREE.Vector3(),axis=new THREE.Vector3();
  const raycaster=new THREE.Raycaster(),targetHits=[];

  function removeTracer(tracer){
    group.remove(tracer.line,tracer.pulse);
    tracer.line.geometry.dispose();
    tracer.line.material.dispose();
    tracer.pulse.material.dispose();
  }
  function removeImpact(impact){
    group.remove(impact.mesh);
    impact.mesh.material.dispose();
  }
  function clearEffects(){
    tracers.forEach(removeTracer);
    impacts.forEach(removeImpact);
    tracers.length=0;
    impacts.length=0;
  }
  function reset(eyePosition,yaw=0){
    time=0;
    clearEffects();
    for(const target of targets)group.remove(target.group);
    targets.length=0;
    eye.copy(eyePosition);
    targetLanes(world,eye,yaw).forEach((lane,index)=>{
      const target=makeRobot(lane,index,geometry,materials);
      group.add(target.group);
      targets.push(target);
      poseRobot(target,time,0,eye);
    });
    hitMeshes=targets.flatMap(target=>target.marks.map(({mesh})=>mesh));
  }
  function setVisible(visible){
    group.visible=visible;
    if(!visible)clearEffects();
  }
  function fire({origin,muzzle,direction,speed,gravity,range,bodyDamage,headDamage,color}){
    if(!group.visible)return;
    if(tracers.length>=MAX_TRACERS)removeTracer(tracers.shift());
    const traceGeometry=new THREE.BufferGeometry();
    const tracePositions=new THREE.BufferAttribute(new Float32Array(16*3),3);
    tracePositions.setUsage(THREE.DynamicDrawUsage);
    traceGeometry.setAttribute('position',tracePositions);
    traceGeometry.setDrawRange(0,0);
    const colorValue=new THREE.Color(color).multiplyScalar(1.75);
    const line=new THREE.Line(traceGeometry,new THREE.LineBasicMaterial({
      color:colorValue,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,toneMapped:false
    }));
    line.frustumCulled=false;
    const pulse=new THREE.Mesh(geometry.pulse,new THREE.MeshBasicMaterial({
      color:colorValue,transparent:true,depthWrite:false,toneMapped:false
    }));
    pulse.scale.set(.021,.115,.021);
    pulse.visible=false;
    group.add(line,pulse);

    // The viewmodel muzzle provides the visual start, while the shot follows the reticle.
    const offset=new THREE.Vector3();
    if(muzzle&&traceRangeSegment(world,origin,muzzle,sample)===null)offset.subVectors(muzzle,origin);
    tracers.push({
      position:origin.clone(),velocity:direction.clone().setLength(speed),offset,gravity,range,bodyDamage,headDamage,
      traveled:0,stopped:false,linger:TRAIL_LINGER,line,pulse,
      points:[{position:origin.clone().add(offset),distance:0}]
    });
  }
  function addImpact(point,heading,color,robot){
    if(impacts.length>=MAX_IMPACTS)removeImpact(impacts.shift());
    const mesh=new THREE.Mesh(geometry.ring,new THREE.MeshBasicMaterial({
      color:new THREE.Color(color).multiplyScalar(1.6),depthWrite:false,
      transparent:true,side:THREE.DoubleSide,toneMapped:false
    }));
    mesh.position.copy(point).addScaledVector(heading,-.045);
    mesh.quaternion.setFromUnitVectors(axis.set(0,0,1),heading);
    mesh.scale.setScalar(.045);
    group.add(mesh);
    impacts.push({mesh,age:0,robot});
  }
  function stepTracer(tracer,dt){
    const {position,velocity}=tracer;
    end.copy(position).addScaledVector(velocity,dt);
    end.y-=.5*tracer.gravity*dt*dt;
    direction.subVectors(end,position);
    const length=direction.length();
    if(length===0)return;
    direction.divideScalar(length);
    const distance=Math.min(length,tracer.range-tracer.traveled);
    end.copy(position).addScaledVector(direction,distance);

    const wallHit=traceRangeSegment(world,position,end,sample);
    const rayDistance=wallHit===null?distance:distance*wallHit;
    raycaster.set(position,direction);
    raycaster.far=rayDistance;
    targetHits.length=0;
    raycaster.intersectObjects(hitMeshes,false,targetHits);
    const targetHit=targetHits.find(hit=>hit.object.userData.rangeHit.target.health>0);
    const actualDistance=targetHit?.distance??rayDistance;
    position.addScaledVector(direction,actualDistance);
    tracer.traveled+=actualDistance;
    velocity.y-=tracer.gravity*dt;
    const visual=position.clone().addScaledVector(tracer.offset,Math.max(0,1-tracer.traveled/3));
    tracer.points.push({position:visual,distance:tracer.traveled});
    while(tracer.points.length>2&&(tracer.points.length>16||tracer.points[1].distance<tracer.traveled-TRAIL_LENGTH)){
      tracer.points.shift();
    }

    if(targetHit){
      const {target,zone}=targetHit.object.userData.rangeHit;
      const critical=zone==='head';
      const damage=critical?tracer.headDamage:tracer.bodyDamage;
      target.health=Math.max(0,target.health-damage);
      target.tint=.16;
      const killed=target.health===0;
      if(killed){
        target.group.visible=false;
        target.respawn=TARGET_RESPAWN;
      }
      onHit({damage,critical,killed});
      addImpact(position,direction,critical?0xff7665:0xffd080,true);
    }else if(wallHit!==null){
      addImpact(position,direction,0xffcd88,false);
    }
    tracer.stopped=!!targetHit||wallHit!==null||tracer.traveled>=tracer.range-.0001;
  }
  function drawTracer(tracer){
    const {points,line,pulse}=tracer;
    const position=line.geometry.attributes.position;
    const fade=tracer.linger/TRAIL_LINGER;
    for(let i=0;i<points.length;i++){
      let at=points[i].position;
      if(i===0&&points.length>1&&tracer.traveled-points[0].distance>TRAIL_LENGTH){
        const crossing=THREE.MathUtils.inverseLerp(points[0].distance,points[1].distance,tracer.traveled-TRAIL_LENGTH);
        at=trailStart.lerpVectors(points[0].position,points[1].position,crossing);
      }
      position.setXYZ(i,at.x,at.y,at.z);
    }
    position.needsUpdate=true;
    line.geometry.setDrawRange(0,points.length);
    line.material.opacity=fade*.94;
    pulse.visible=!tracer.stopped;
    pulse.position.copy(points.at(-1).position);
    pulse.quaternion.setFromUnitVectors(Y_AXIS,axis.copy(tracer.velocity).normalize());
  }
  function update(dt,eyePosition=eye){
    if(!group.visible)return;
    time+=dt;
    eye.copy(eyePosition);
    for(const target of targets)poseRobot(target,time,dt,eye);

    for(let i=tracers.length-1;i>=0;i--){
      const tracer=tracers[i];
      if(tracer.stopped){
        tracer.linger-=dt;
        if(tracer.linger<=0){
          removeTracer(tracer);
          tracers.splice(i,1);
        }
      }
    }
    const substeps=Math.max(1,Math.ceil(dt*120));
    for(let step=0;step<substeps;step++)for(const tracer of tracers){
      if(!tracer.stopped)stepTracer(tracer,dt/substeps);
    }
    for(const tracer of tracers)drawTracer(tracer);
    for(let i=impacts.length-1;i>=0;i--){
      const impact=impacts[i];
      impact.age+=dt;
      const progress=impact.age/(impact.robot?.24:.16);
      if(progress>=1){
        removeImpact(impact);
        impacts.splice(i,1);
      }else{
        impact.mesh.material.opacity=(1-progress)*.92;
        impact.mesh.scale.setScalar(.045+progress*(impact.robot?.34:.17));
      }
    }
  }
  function dispose(){
    clearEffects();
    group.removeFromParent();
    group.clear();
    targets.length=0;
    hitMeshes=[];
    Object.values(geometry).forEach(shape=>shape.dispose());
    for(const mat of [...materials.armor,materials.frame,materials.joint,materials.signal])mat.dispose();
  }

  return {reset,setVisible,fire,update,dispose,get targetCount(){return targets.length;}};
}
