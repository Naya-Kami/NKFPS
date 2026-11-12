import * as THREE from 'three';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createSkyLighting,lightingPreset} from './rendering/lighting.js';
import {createLightBudget} from './rendering/lightBudget.js';
import {qualityProfile,renderPixelRatio,QUALITY_IDS} from './rendering/quality.js';
import {loadScannedSurfaces} from './materials.js';
import {getMap,toWorld, floorAt,segmentPointDistance,roomAt} from './maps/atlas.js';
import {buildMap,createMaterials} from './maps/model.js';
import {loadPropAssets} from './maps/propAssets.js';
import {buildEnvironment} from './maps/environment.js';
import {mapReflections} from './maps/reflections.js';
import {canOccupy,spawnPosition} from './maps/navigation.js';
import {createPhysicsWorld,stepPlayer,PLAYER} from './maps/physics.js';

const V=THREE.Vector3,clamp=THREE.MathUtils.clamp;
export async function createWorld(container,onProgress=()=>{}){
  const mobile=navigator.maxTouchPoints>1||matchMedia('(pointer:coarse)').matches;
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.05:1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.info.autoReset=false;container.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),perspective=new THREE.PerspectiveCamera(62,1,.12,700),planCamera=new THREE.OrthographicCamera(-60,60,60,-60,.1,600);let camera=planCamera;
  const hemi=new THREE.HemisphereLight(0xb9d2e3,0x2d403a,1.5);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffe0bd,2.5);sun.position.set(-60,100,60);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-95;sun.shadow.camera.right=95;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;sun.shadow.camera.far=260;sun.shadow.normalBias=.045;sun.shadow.bias=-.0001;sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
  const rim=new THREE.DirectionalLight(0xa5c4df,.7);rim.position.set(45,70,-70);scene.add(rim);
  onProgress('Loading photographed material maps');const scans=await loadScannedSurfaces(renderer);let propLibrary=null;try{onProgress('Loading real-world PBR props');propLibrary=await loadPropAssets(renderer);}catch(error){console.warn('Detailed props unavailable; using geometry fallback',error);}
  let hdr=null,env=null,envTarget=null;try{hdr=await new RGBELoader().loadAsync('/assets/pbr/sky.hdr');hdr.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(renderer);envTarget=pmrem.fromEquirectangular(hdr);env=envTarget.texture;pmrem.dispose();}catch(e){console.warn('HDR unavailable; direct lighting remains active',e);}
  const room=new RoomEnvironment(),roomPmrem=new THREE.PMREMGenerator(renderer),indoorTarget=roomPmrem.fromScene(room,.045),indoorEnv=indoorTarget.texture;room.dispose();roomPmrem.dispose();
  let skyLighting=null;sun.shadow.autoUpdate=false;
  const flashlight=new THREE.SpotLight(0xe1f1df,0,50,Math.PI/6,.5,1.5);flashlight.shadow.mapSize.set(mobile?512:1024,mobile?512:1024);flashlight.shadow.bias=-.0002;flashlight.shadow.normalBias=.025;scene.add(flashlight,flashlight.target);
  const composer=new EffectComposer(renderer),renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
  const ssao=new SSAOPass(scene,camera,800,600,32);ssao.kernelRadius=2.2;ssao.minDistance=.0004;ssao.maxDistance=.025;composer.addPass(ssao);
  const baseVisibility=ssao._overrideVisibility.bind(ssao);ssao._overrideVisibility=()=>{baseVisibility();scene.traverse(o=>{if(o.isMesh&&o.visible&&(o.isReflector||o.material?.transparent||o.material?.alphaTest>0)){o.visible=false;ssao._visibilityCache.push(o);}});};
  const bloom=new UnrealBloomPass(new THREE.Vector2(800,600),.14,.45,1.3);composer.addPass(bloom);const smaa=new SMAAPass();composer.addPass(smaa);composer.addPass(new OutputPass());
  const state={mode:'overview',view:'plan',mapId:'blacksite',paused:false,position:new V(),yaw:0,pitch:0,sprint:100,verticalVelocity:0,onGround:true,moving:false,quality:mobile?'balanced':'high',weather:true,night:false,flashlight:false,viewMove:new THREE.Vector2(),orbitYaw:0,orbitPitch:1.1,zoom:1,labels:true,routes:true,elapsed:0};
  const keys={},highScans={},highLoads=new Map(),shadowFocus=new V(Infinity,0,Infinity);let profile=qualityProfile(state.quality,mobile),surfaceEpoch=0;
  let map=getMap('blacksite'),model,environment,reflection,materials,physicsWorld,lightBudget,disposed=false,latestFps=0,frames=0,frameTime=0,lastLight=-1,renderSize={width:800,height:600};
  function refreshCamera(){camera=state.mode==='playing'||state.view==='orbit'?perspective:planCamera;renderPass.camera=camera;ssao.camera=camera;const flag=camera.isPerspectiveCamera?1:0;
    for(const mat of[ssao.ssaoMaterial,ssao.depthRenderMaterial]){if(mat.defines.PERSPECTIVE_CAMERA!==flag){mat.defines.PERSPECTIVE_CAMERA=flag;mat.needsUpdate=true;}mat.uniforms.cameraNear.value=camera.near;mat.uniforms.cameraFar.value=camera.far;}
    ssao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);ssao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
  }
  function resize(){const r=container.getBoundingClientRect();renderSize={width:Math.max(1,r.width),height:Math.max(1,r.height)};const aspect=renderSize.width/renderSize.height;perspective.aspect=aspect;perspective.updateProjectionMatrix();
    const frame=map.frame,w=(frame[2]-frame[0])*.1,h=(frame[3]-frame[1])*.1,span=Math.max(h+9,(w+12)/aspect)*state.zoom;
    planCamera.left=-span*aspect/2;planCamera.right=span*aspect/2;planCamera.top=span/2;planCamera.bottom=-span/2;planCamera.updateProjectionMatrix();renderer.setPixelRatio(renderPixelRatio(profile,renderSize.width,renderSize.height,devicePixelRatio));renderer.setSize(renderSize.width,renderSize.height);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(renderSize.width,renderSize.height);if(profile.ao){const ratio=renderer.getPixelRatio()*profile.ao;ssao.setSize(Math.max(1,Math.round(renderSize.width*ratio)),Math.max(1,Math.round(renderSize.height*ratio)));}refreshCamera();
  }
  function updateShadow(force=false){const center=state.mode==='playing'?state.position:new V(...toWorld(map,map.focus,0));if(!force&&shadowFocus.distanceToSquared(center)<16)return;shadowFocus.copy(center);const radius=state.mode==='playing'?30:Math.max((map.frame[2]-map.frame[0])*.058,(map.frame[3]-map.frame[1])*.058),snap=radius*2/profile.shadow;sun.target.position.set(Math.round(center.x/snap)*snap,0,Math.round(center.z/snap)*snap);sun.position.copy(sun.target.position).add(new V(...lightingPreset(map.theme,state.night).sunDirection).multiplyScalar(130));Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius});sun.shadow.camera.updateProjectionMatrix();sun.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;}
  function applyLighting(){const p=lightingPreset(map.theme,state.night,state.mode==='playing'),sky=map.theme==='sky',atmosphere=skyLighting?(state.night?skyLighting.night:skyLighting.day):null;
    scene.environment=map.theme==='metro'?indoorEnv:sky?atmosphere.environment:env;scene.environmentIntensity=p.environmentIntensity;
    scene.background=sky?atmosphere.background:map.theme==='coastal'&&hdr?hdr:new THREE.Color(p.background);scene.backgroundIntensity=p.backgroundIntensity;
    scene.fog=new THREE.FogExp2(p.fog,p.fogDensity);hemi.intensity=p.hemi;sun.intensity=p.sun;sun.color.setHex(p.sunColor);rim.intensity=p.rim;renderer.toneMappingExposure=p.exposure;updateShadow(true);
  }
  async function setMap(id){
    const next=getMap(id);if(model){scene.remove(model.group,environment.group,reflection.mesh);lightBudget?.dispose();model.dispose();environment.dispose();reflection.dispose();for(const m of Object.values(materials))m.dispose();}
    map=next;if(map.theme==='sky'&&!skyLighting){onProgress('Preparing atmospheric sky and reflections');skyLighting=createSkyLighting(renderer,mobile);}state.mapId=map.id;state.mode='overview';state.view='plan';state.zoom=1;state.orbitYaw=0;state.paused=false;state.viewMove.set(0,0);Object.keys(keys).forEach(k=>keys[k]=false);
    materials=createMaterials(scans,map.theme);model=buildMap(map,materials,{mobile,assets:propLibrary});environment=buildEnvironment(map,materials,mobile,{skyHDR:hdr});reflection=mapReflections(map,scans.concrete.normalMap,mobile);scene.add(environment.group,model.group,reflection.mesh);
    lightBudget=createLightBudget(scene,model.lights,map,model.colliders.filter(c=>c.kind==='wall'));physicsWorld=createPhysicsWorld(map,model.colliders);state.position.set(...spawnPosition(map,'attacker',model.colliders));state.onGround=true;state.verticalVelocity=0;state.jumpHeld=false;state.jumpQueued=false;state.safePosition={x:state.position.x,y:state.position.y,z:state.position.z};applyLighting();setQuality(state.quality);resize();renderer.shadowMap.needsUpdate=true;lastLight=-1;return map;
  }
  async function upgradeSurfaces(){const epoch=++surfaceEpoch;state.textureStatus=profile.hi.length?'loading':'ready';try{await Promise.all(profile.hi.map(name=>{if(!highLoads.has(name))highLoads.set(name,loadScannedSurfaces(renderer,{names:[name],resolution:'hi'}).then(sets=>{highScans[name]=sets[name];}).catch(e=>{highLoads.delete(name);throw e;}));return highLoads.get(name);}));if(epoch!==surfaceEpoch)return;for(const mat of Object.values(materials||{})){const name=mat.userData.surface;if(!name)continue;const set=profile.hi.includes(name)?highScans[name]:scans[name];Object.assign(mat,set);mat.needsUpdate=true;}reflection?.setNormalMap((profile.hi.includes('concrete')?highScans.concrete:scans.concrete).normalMap);state.textureStatus='ready';}catch(e){if(epoch===surfaceEpoch)state.textureStatus='fallback';console.warn('High-resolution surfaces unavailable; bundled base maps remain active',e);}}
  function setQuality(q){state.quality=QUALITY_IDS.includes(q)?q:'balanced';profile=qualityProfile(state.quality,mobile);ssao.enabled=profile.ao>0;bloom.enabled=profile.bloom;smaa.enabled=state.quality!=='performance';reflection?.setQuality(state.quality);environment?.setQuality(state.quality);lightBudget?.setBudget(profile.lights);if(materials){const transmission=!mobile&&['high','ultra'].includes(state.quality);materials.glass.transmission=transmission?.82:0;materials.glass.thickness=.035;materials.glass.opacity=transmission?1:map.theme==='sky'?.25:.23;materials.glass.needsUpdate=true;renderer.transmissionResolutionScale=state.quality==='ultra'?1:.65;}for(const rt of[composer.renderTarget1,composer.renderTarget2]){const samples=Math.min(profile.samples,renderer.capabilities.maxSamples);if(rt.samples!==samples){rt.samples=samples;rt.dispose();}}if(sun.shadow.mapSize.x!==profile.shadow){sun.shadow.mapSize.setScalar(profile.shadow);sun.shadow.map?.dispose();sun.shadow.map=null;}flashlight.castShadow=state.flashlight&&['high','ultra'].includes(state.quality);updateShadow(true);lastLight=-1;resize();upgradeSurfaces();}
  function setView(view){state.mode='overview';state.view=view;state.paused=false;model.roofs.visible=false;applyLighting();resize();}
  function orbit(dx,dy,zoom=0){if(state.mode==='playing')return;if(dx||dy){state.view='orbit';state.orbitYaw-=dx*.006;state.orbitPitch=clamp(state.orbitPitch+dy*.004,.3,1.48);}state.zoom=clamp(state.zoom+zoom,.52,1.9);resize();}
  function enter(poiId='attacker'){
    state.position.set(...spawnPosition(map,poiId,model.colliders));state.safePosition={x:state.position.x,y:state.position.y,z:state.position.z};state.onGround=true;state.jumpHeld=false;state.jumpQueued=false;state.yaw=0;state.pitch=0;state.verticalVelocity=0;state.mode='playing';state.paused=false;model.roofs.visible=true;model.routes.visible=false;applyLighting();refreshCamera();
  }
  const home=()=>setView('plan');
  function look(dx,dy,sensitivity=1){state.yaw-=dx*.002*sensitivity;state.pitch=clamp(state.pitch-dy*.002*sensitivity,-1.35,1.35);}
  function blocked(x,z){return !canOccupy(map,model.colliders,x,z,state.position.y-1.7);}
  function setNight(value){state.night=value;applyLighting();}function setFlashlight(value){state.flashlight=value;flashlight.intensity=value?36:0;flashlight.castShadow=value&&['high','ultra'].includes(state.quality);renderer.shadowMap.needsUpdate=true;}
  const clock=new THREE.Clock();let previous=0;
  function update(){if(disposed)return;const raw=clock.getDelta(),dt=Math.min(raw,.04),t=clock.elapsedTime;state.elapsed=t;renderer.info.reset();
    environment.update(t,state.weather,state.night,camera);reflection.update(t,state.weather);model.routes.visible=state.routes&&state.mode!=='playing';reflection.mesh.visible=state.quality!=='performance'&&(state.mode==='playing'||state.view==='orbit');
    if(state.mode!=='playing'){
      const [l,top,r,bottom]=map.frame,center=toWorld(map,[(l+r)/2,(top+bottom)/2]);
      planCamera.position.set(center[0],180,center[2]+.001);planCamera.up.set(0,0,-1);planCamera.lookAt(center[0],0,center[2]);
      if(state.view==='orbit'){const aspect=renderSize.width/renderSize.height,extent=Math.max((r-l)*.1/aspect,(bottom-top)*.1),radius=extent*1.55*state.zoom;perspective.fov=42;perspective.position.set(center[0]+Math.sin(state.orbitYaw)*Math.cos(state.orbitPitch)*radius,Math.sin(state.orbitPitch)*radius,center[2]+Math.cos(state.orbitYaw)*Math.cos(state.orbitPitch)*radius);perspective.up.set(0,1,0);perspective.lookAt(center[0],0,center[2]);perspective.updateProjectionMatrix();}
      refreshCamera();
    }else if(!state.paused){
      let pad;try{pad=navigator.getGamepads?.()[0];}catch{}
      const dz=v=>Math.abs(v||0)>.15?v:0;let x=(keys.KeyD?1:0)-(keys.KeyA?1:0)+state.viewMove.x+dz(pad?.axes[0]),z=(keys.KeyS?1:0)-(keys.KeyW?1:0)+state.viewMove.y+dz(pad?.axes[1]);const len=Math.hypot(x,z);if(len>1){x/=len;z/=len;}
      if(pad){state.yaw-=dz(pad.axes[2])*dt*2;state.pitch=clamp(state.pitch-dz(pad.axes[3])*dt*1.5,-1.35,1.35);}
      const sprint=(keys.ShiftLeft||keys.ShiftRight||pad?.buttons[10]?.pressed)&&len>.1&&state.sprint>1,speed=sprint?6.6:4.1;state.sprint=clamp(state.sprint+dt*(sprint?-19:13),0,100);
      const co=Math.cos(state.yaw),si=Math.sin(state.yaw);stepPlayer(state,physicsWorld,{x:(x*co+z*si)*speed,z:(z*co-x*si)*speed,jump:keys.Space||pad?.buttons[0]?.pressed||state.jumpQueued},dt);state.jumpQueued=false;
      perspective.position.copy(state.position);perspective.position.y+=len>.1&&state.onGround?Math.sin(t*(sprint?12:9))*.028:0;perspective.rotation.set(state.pitch,state.yaw,0,'YXZ');perspective.fov=THREE.MathUtils.lerp(perspective.fov,sprint?76:68,dt*6);perspective.updateProjectionMatrix();state.moving=len>.1;refreshCamera();
    }
    if(t-lastLight>.35){lastLight=t;lightBudget.select(state.mode==='playing'?state.position:new V(...toWorld(map,map.focus,2)));}lightBudget.update(dt);
    flashlight.position.copy(camera.position);flashlight.target.position.copy(camera.position).add(new V(0,0,-20).applyQuaternion(camera.quaternion));
    for(const d of model.dynamic){if(d.type==='core')d.mesh.material.emissiveIntensity=.9+Math.sin(t*.7)*.08;if(d.type==='boat'){d.mesh.rotation.z=Math.sin(t*.7)*.025;d.mesh.position.y=d.baseY+Math.sin(t*.6)*.13;}}
    updateShadow();if(flashlight.castShadow&&state.mode==='playing')renderer.shadowMap.needsUpdate=true;
    composer.render();frames++;if(t-frameTime>1){latestFps=Math.round(frames/(t-frameTime));frames=0;frameTime=t;}requestAnimationFrame(update);
  }
  onProgress('Building the traced Blacksite Echo layout');await setMap('blacksite');resize();requestAnimationFrame(update);
  function dispose(){if(disposed)return;disposed=true;surfaceEpoch++;lightBudget?.dispose();model?.dispose();environment?.dispose();reflection?.dispose();Object.values(materials||{}).forEach(m=>m.dispose());for(const set of new Set([...Object.values(scans),...Object.values(highScans)]))Object.values(set).forEach(t=>t.dispose());for(const pass of composer.passes)pass.dispose?.();composer.dispose();envTarget?.dispose();indoorTarget.dispose();hdr?.dispose();propLibrary?.dispose();skyLighting?.dispose();sun.shadow.dispose();flashlight.shadow.dispose();renderer.dispose();renderer.domElement.remove();}
  return{scene,renderer,state,keys,get camera(){return camera;},get map(){return map;},get model(){return model;},setMap,setView,enter,home,teleport:enter,orbit,look,resize,setQuality,setNight,setFlashlight,blocked,dispose,
    get fps(){return latestFps;},get zone(){return roomAt(map,state.position.x,state.position.z,state.position.y-PLAYER.eye);},get stats(){return{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,walls:wallSegmentsCount(),rooms:map.rooms.length};}};
  function wallSegmentsCount(){return model.colliders.filter(c=>c.kind==='wall').length;}
}
