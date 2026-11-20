import {bundledPropLibrary} from './helpers/propLibrary.js';
import {createCanvasDocument} from './helpers/canvasDocument.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {MAPS,MAP_IDS,toWorld,toPixel,floorAt,wallSegments} from '../src/3dmap/maps/atlas.js';
import {floorGeometry} from '../src/3dmap/maps/geometry.js';
import {canOccupy,spawnPosition} from '../src/3dmap/maps/navigation.js';
import {buildMap,createMaterials} from '../src/3dmap/maps/model.js';
import {SCANNED_SURFACES} from '../src/3dmap/materials.js';
import {PROP_ASSETS,crateArrangement} from '../src/3dmap/maps/propAssets.js';
import {buildMetroTrain,metroRailPositions} from '../src/3dmap/maps/train.js';

// Exercise the actual geometry builder without requiring a browser's WebGL context.
const documentBefore=globalThis.document;
globalThis.document=createCanvasDocument();
const scans=Object.fromEntries(SCANNED_SURFACES.map(name=>[name,{map:new THREE.Texture(),normalMap:new THREE.Texture(),roughnessMap:new THREE.Texture()}]));
const propLibrary=await bundledPropLibrary();
const models=new Map();
const modelFor=map=>{if(!models.has(map.id))models.set(map.id,buildMap(map,createMaterials(scans,map.theme),{mobile:true,assets:propLibrary}));return models.get(map.id);};
const area=poly=>Math.abs(poly.reduce((s,a,i)=>{const b=poly[(i+1)%poly.length];return s+a[0]*b[1]-b[0]*a[1];},0))*.005;

test('three separate references retain their characteristic level topology',()=>{
  assert.deepEqual(MAP_IDS,['blacksite','skyport','terminal']);
  assert.ok(MAPS.blacksite.core&&MAPS.blacksite.pit);assert.equal(MAPS.skyport.dockingPads.length,2);assert.equal(MAPS.skyport.boardingBridges.length,2);assert.equal(MAPS.terminal.tracks.length,2);assert.equal(MAPS.terminal.trains.length,2);
  assert.notDeepEqual(MAPS.blacksite.outer,MAPS.terminal.outer);assert.notEqual(MAPS.skyport.theme,MAPS.blacksite.theme);
});
test('Blacksite key anchors preserve the supplied north/south and left/right relationships',()=>{
  const a=MAPS.blacksite.anchors;
  assert.deepEqual(a.core,[507,373]);assert.deepEqual(a['site-a'],[292,463]);assert.deepEqual(a['site-b'],[710,477]);
  assert.ok(a.defender[1]<a.core[1]&&a.core[1]<a.catwalk[1]&&a.catwalk[1]<a.pit[1]&&a.pit[1]<a.courtyard[1]&&a.courtyard[1]<a.attacker[1]);
  assert.ok(a['site-a'][0]<a.core[0]&&a.core[0]<a['site-b'][0]);assert.ok(a['generator-yard'][0]<a.courtyard[0]&&a['loading-dock'][0]>a.courtyard[0]);
});
test('Skyport retains the symmetric gates, central dome and two southern docking decks',()=>{
  const m=MAPS.skyport,a=m.anchors;assert.deepEqual(a.atrium,[633,538]);assert.ok(a.defender[1]<a.security[1]&&a.security[1]<a.atrium[1]&&a.atrium[1]<a.departures[1]&&a.departures[1]<a.attacker[1]);
  assert.ok(a['dock-west'][0]<a.atrium[0]&&a['dock-east'][0]>a.atrium[0]);assert.equal(m.props.cherryTrees.length,4);assert.ok(m.props.dome.radiusX>120);assert.equal(m.props.ringSculpture.center[0],634);
});
test('Terminal bridge clears both long trains and preserves the north/south ticket halls',()=>{
  const m=MAPS.terminal,a=m.anchors;for(const t of m.trains){assert.ok(t.rect[3]>450);assert.ok(m.bridges[0].floorY-.25>t.y+t.height);}
  assert.ok(a.defender[1]<a['ticket-north'][1]&&a['ticket-north'][1]<a.bridge[1]&&a.bridge[1]<a['ticket-south'][1]&&a['ticket-south'][1]<a.attacker[1]);assert.ok(a['site-a'][0]<a.bridge[0]&&a['site-b'][0]>a.bridge[0]);
});
for(const id of MAP_IDS){
  const map=MAPS[id];
  test(`${id}: generated floor triangles match the traced polygon minus openings`,()=>{
    const geometry=floorGeometry(map,map.outer,map.floorHoles),p=geometry.attributes.position,ix=geometry.index;let actual=0;
    for(let i=0;i<ix.count;i+=3){const a=ix.getX(i),b=ix.getX(i+1),c=ix.getX(i+2);actual+=Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a)))/2;}
    const expected=area(map.outer)-map.floorHoles.reduce((n,h)=>n+area(h),0);assert.ok(Math.abs(actual-expected)<.02);geometry.dispose();
    for(const poi of map.poi){assert.ok(poi.at,poi.id);const [x,,z]=toWorld(map,poi.at);const back=toPixel(map,x,z);assert.ok(Math.hypot(back[0]-poi.at[0],back[1]-poi.at[1])<1e-8);}
  });
  test(`${id}: actual model contains finite 3D geometry and source-aligned collision walls`,()=>{
    const model=modelFor(map);let meshes=0,triangles=0;model.group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);if(o.isInstancedMesh)for(const n of o.instanceMatrix.array)assert.ok(Number.isFinite(n));for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));}});
    assert.ok(meshes>20);assert.ok(triangles>15000&&triangles<250000);assert.equal(model.colliders.filter(c=>c.kind==='wall').length,wallSegments(map).length);assert.ok(existsSync(new URL(`../public${map.reference}`,import.meta.url)));
  });
  test(`${id}: attacker can reach A, B, defender and the central landmark through real door gaps`,()=>{
    const model=modelFor(map),step=.5,start=spawnPosition(map),q=[[Math.round(start[0]/step),Math.round(start[2]/step),start[1]-1.7]],seen=new Set();let at=0;
    const goals=map.poi.map(p=>({id:p.id,at:spawnPosition(map,p.id),found:false}));
    while(at<q.length&&q.length<250000){const[ix,iz,feet]=q[at++],x=ix*step,z=iz*step;
      for(const g of goals)if(Math.hypot(x-g.at[0],z-g.at[2])<1.1&&Math.abs(feet-(g.at[1]-1.7))<.8)g.found=true;
      if(goals.every(g=>g.found))break;
      for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=(ix+dx)*step,nz=(iz+dz)*step;if(!canOccupy(map,model.colliders,nx,nz,feet))continue;const f=floorAt(map,nx,nz,feet),key=`${ix+dx},${iz+dz},${Math.round(f*2)}`;if(seen.has(key))continue;seen.add(key);q.push([ix+dx,iz+dz,f]);}
    }
    assert.ok(goals.every(g=>g.found),JSON.stringify(goals.map(g=>[g.id,g.found])));
  });
}
test('all photographic runtime maps have bundled WebP content and recorded provenance',()=>{
  const sources=JSON.parse(readFileSync(new URL('../public/assets/pbr/sources.json',import.meta.url)));
  for(const name of SCANNED_SURFACES)for(const channel of['color','normal','roughness']){const file=`${name}-${channel}.webp`,data=readFileSync(new URL(`../public/assets/pbr/${file}`,import.meta.url));assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');assert.ok(sources.files[file]?.source_url);}
});

test('bundled PBR props have verified provenance and no external runtime dependencies',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/props/sources.json',import.meta.url)));let bytes=0;
  for(const id of PROP_ASSETS){
    const record=manifest.files[id],data=readFileSync(new URL(`../public/assets/props/${record.file}`,import.meta.url));bytes+=data.length;
    assert.equal(createHash('sha256').update(data).digest('hex'),record.sha256);assert.equal(record.license,'CC0-1.0');assert.ok(record.official_source.startsWith('https://polyhaven.com/a/'));
    assert.equal(data.toString('ascii',0,4),'glTF');assert.equal(data.readUInt32LE(4),2);assert.equal(data.readUInt32LE(8),data.length);
    const json=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));assert.ok(json.buffers.every(b=>!b.uri));assert.equal(json.images.length,3);
    for(const im of json.images){assert.equal(im.mimeType,'image/webp');assert.equal(im.uri,undefined);const view=json.bufferViews[im.bufferView],offset=28+data.readUInt32LE(12)+(view.byteOffset||0);assert.equal(data.toString('ascii',offset,offset+4),'RIFF');assert.equal(data.toString('ascii',offset+8,offset+12),'WEBP');}
    const asset=propLibrary.get(id);assert.ok(asset.material.map&&asset.material.normalMap&&asset.material.roughnessMap&&asset.material.metalnessMap);assert.ok(asset.geometry.attributes.uv);assert.ok(Math.abs(asset.geometry.boundingBox.min.y)<1e-6);
  }
  assert.ok(bytes<900000,'mobile prop payload must stay below 900 KB');
});
test('real crate stacks preserve proportions, fit their allocated space and have no vertical gaps',()=>{
  const size=propLibrary.get('crate').size,allocations=[[1.6,1.5,1.5],[.8,1.1,.9],[3.2,2.5,2.8]];
  for(const map of Object.values(MAPS))if(Array.isArray(map.props))for(const o of map.props.filter(o=>o.kind==='crate'||o.kind==='crate-stack'))if(o.rect){const w=o.rect[2]*.1,d=o.rect[3]*.1;allocations.push([w,o.kind==='crate-stack'?2.5:Math.min(2,(w+d)*.4),d]);}
  for(const[w,h,d]of allocations){
    const items=crateArrangement(size,w,h,d);assert.ok(items.length);
    const bounds=items.map(item=>{const turned=!!item.angle;return{...item,w:(turned?size.z:size.x)*item.scale,d:(turned?size.x:size.z)*item.scale,top:item.y+size.y*item.scale};});
    for(const item of bounds){assert.ok(item.scale>0);assert.ok(Math.abs(item.x)+item.w/2<=w/2+1e-6);assert.ok(Math.abs(item.z)+item.d/2<=d/2+1e-6);assert.ok(item.top<=h+1e-6);
      if(item.y>1e-6)assert.ok(bounds.some(other=>Math.abs(other.top-item.y)<1e-6&&Math.abs(item.x-other.x)<(item.w+other.w)/2&&Math.abs(item.z-other.z)<(item.d+other.d)/2),'every upper crate needs a touching support');
    }
  }
});
test('instanced real props retain individual collision shapes at their actual size and floor height',()=>{
  for(const map of Object.values(MAPS)){
    const model=modelFor(map);model.group.traverse(mesh=>{if(!mesh.name.startsWith('PBR prop / '))return;const id=mesh.name.split(' / ')[1],template=propLibrary.get(id),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
      for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);assert.ok(Math.abs(scale.x-scale.y)<1e-6&&Math.abs(scale.y-scale.z)<1e-6);
        const c=model.colliders.find(c=>Math.hypot(c.x-position.x,c.z-position.z)<1e-4&&Math.abs(c.bottom-position.y)<1e-4&&Math.abs(c.top-(position.y+template.size.y*scale.y))<1e-4);assert.ok(c,`${map.id}/${id}/${i}`);
        if(id==='barrel')assert.ok(Math.abs(c.radius-Math.max(template.size.x,template.size.z)*scale.x/2)<1e-4);else{assert.ok(Math.abs(c.w-template.size.x*scale.x)<1e-4);assert.ok(Math.abs(c.d-template.size.z*scale.z)<1e-4);}
      }
    });
  }
});
test('metro wheels touch their rails underneath each body and the curved roof clears the bridge',()=>{
  const map=MAPS.terminal,materials=createMaterials(scans,map.theme);
  for(const train of map.trains){
    const wheels=[],colliders=[],roofs=[],p=(at,y=0)=>toWorld(map,at,y);
    buildMetroTrain(map,train,materials,{box(){},beam(){},text(){},p,collider:c=>colliders.push(c),geo(g,mat,at){g.computeBoundingBox();if(g.type==='CylinderGeometry'&&g.parameters.radiusTop===.24)wheels.push({at,bounds:g.boundingBox.clone()});if(g.type==='ExtrudeGeometry')roofs.push(g.boundingBox.clone());g.dispose();}});
    assert.equal(wheels.length,train.cars*4);assert.equal(roofs.length,train.cars);const track=map.tracks.find(t=>train.rect[0]>t.rect[0]&&train.rect[0]<t.rect[0]+t.rect[2]),railX=metroRailPositions(track).map(x=>p([x,0])[0]);assert.ok(Math.abs(railX[1]-railX[0]-1.435)<1e-6);
    for(const wheel of wheels){assert.ok(railX.some(x=>Math.abs(x-wheel.at[0])<1e-6));assert.ok(Math.abs(wheel.at[1]+wheel.bounds.min.y-(-.85))<1e-6);assert.ok(colliders.some(c=>Math.abs(wheel.at[0]-c.x)+.08<c.w/2&&Math.abs(wheel.at[2]-c.z)<c.d/2));}
    for(const roof of roofs)assert.ok(roof.max.y<map.bridges[0].floorY-.25);for(const c of colliders)assert.ok(c.bottom>-.37,'body must not enclose the visible wheels');
  }
  Object.values(materials).forEach(m=>m.dispose());
});
