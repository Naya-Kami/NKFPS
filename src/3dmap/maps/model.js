import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {toWorld,wallSegments,rectPoly,pointInPolygon,segmentPointDistance,floorAt,levelSurfaces,railSegments,surfaceContains} from './atlas.js';
import {floorGeometry,slabGeometry,stairsPolygon} from './geometry.js';
import {worldMapped} from '../materials.js';
import {createBlossomCanopy} from './vegetation.js';

export function createMaterials(scans,theme){
  const material=(name,color,roughness=.8,metalness=0,scale=.5,weather=.25)=>{const mat=worldMapped(new THREE.MeshPhysicalMaterial({...scans[name],color,roughness,metalness,normalScale:new THREE.Vector2(.48,.48)}),scale,weather);mat.userData.surface=name;return mat;};
  const m={
    wall:material('wall',theme==='sky'?0xe3e7df:theme==='metro'?0x9caaa5:0xbdc7bd,.93,0,.4,.4),
    cap:material('wall',0xe0e4d9,.85,0,.5,.12),dark:material('steel',0x34454d,.75,.75),metal:material('steel',0x9caaa9,.65,.84),
    floor:material('concrete',theme==='sky'?0xe4dfcf:0xa3b0ad,.9,.04,.4,.08),foundation:material('rock',0x647171,.97,0,.25,.3),
    yellow:material('steel',0xccaa52,.72,.08,.7,.1),red:material('metal',0xb65c43,.75,.12,.55,.3),
    cargo:material('metal',0x879999,.78,.12,.4,.4),rock:material('rock',0x949e96,1,0,.25,.4),
    moss:material('rock',0x4b6350,.95,0,.4,.3),black:new THREE.MeshStandardMaterial({color:0x101c21,roughness:.5,metalness:.5}),
    white:new THREE.MeshPhysicalMaterial({color:0xe6e9e1,roughness:.38,metalness:.08}),
    warm:new THREE.MeshStandardMaterial({color:0xffdfad,emissive:0xffbc68,emissiveIntensity:3.3,toneMapped:false}),
    cool:new THREE.MeshStandardMaterial({color:0x9be9ee,emissive:0x61cae4,emissiveIntensity:2.4,toneMapped:false}),
    danger:new THREE.MeshStandardMaterial({color:0xe84936,emissive:0xea3424,emissiveIntensity:2.3,toneMapped:false}),
    glass:new THREE.MeshPhysicalMaterial({color:theme==='sky'?0xb2d8dc:0x7fb8ba,metalness:0,roughness:.055,ior:1.48,clearcoat:1,clearcoatRoughness:.035,reflectivity:.7,transparent:true,opacity:theme==='sky'?.25:.23,depthWrite:false,side:THREE.DoubleSide}),
    bark:new THREE.MeshStandardMaterial({color:0x645143,roughness:1}),pink:new THREE.MeshStandardMaterial({color:0xdba5bb,roughness:.9}),pinkLight:new THREE.MeshStandardMaterial({color:0xf0c3d1,roughness:.9})
  };
  worldMapped(m.floor,.4,.08,theme==='sky'?.55:.18,theme==='sky'?.8:theme==='metro'?.6:0);
  m.floor.clearcoat=theme==='sky'?.78:theme==='coastal'?.66:.38;m.floor.clearcoatRoughness=theme==='sky'?.16:.27;
  for(const mat of[m.yellow,m.red,m.cargo]){mat.clearcoat=.22;mat.clearcoatRoughness=.4;}
  m.white.clearcoat=.55;m.white.clearcoatRoughness=.12;
  return m;
}

export function buildMap(map,mats,{mobile=false}={}){
  const group=new THREE.Group(),roofs=new THREE.Group(),routes=new THREE.Group();group.add(roofs,routes);
  const batches=new Map(),lights=[],colliders=[],ownedMaterials=new Set(),dynamic=[];
  let propOffset=0;const withFloor=(at,fn)=>{const previous=propOffset,[x,,z]=toWorld(map,at);propOffset=floorAt(map,x,z,100)??0;try{return fn();}finally{propOffset=previous;}};
  let seed=1847;const rand=(a=0,b=1)=>{seed=(seed*1664525+1013904223)>>>0;return a+(b-a)*seed/4294967296;};
  function geo(g,mat,pos=[0,0,0],rotation=[0,0,0],layer='base'){
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1)));
    const key=mat.uuid+layer;if(!batches.has(key))batches.set(key,{mat,layer,geos:[]});batches.get(key).geos.push(g);
  }
  const p=(at,y=0)=>toWorld(map,at,y+propOffset);
  const box=(at,y,w,h,d,mat=mats.metal,angle=0,solid=false,layer='base',round=0)=>{const pos=p(at,y);geo(round?new RoundedBoxGeometry(w,h,d,2,round):new THREE.BoxGeometry(w,h,d),mat,pos,[0,angle,0],layer);if(solid)colliders.push({kind:'box',x:pos[0],z:pos[2],w,d,angle,bottom:y+propOffset-h/2,top:y+propOffset+h/2});};
  const cyl=(at,y,r,h,mat=mats.metal,segments=20,rTop=r,layer='base')=>geo(new THREE.CylinderGeometry(rTop,r,h,segments),mat,p(at,y),[0,0,0],layer);
  const beam=(a,b,r,mat=mats.metal,layer='base')=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),v=vb.clone().sub(va),g=new THREE.CylinderGeometry(r,r,v.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));geo(g,mat,va.add(vb).multiplyScalar(.5).toArray(),[0,0,0],layer);};
  const pxBeam=(a,b,y,r,mat=mats.metal,layer='base')=>beam(p(a,y),p(b,y),r,mat,layer);
  function text(text,at,y,w=4,h=.8,fg='#d3dfd8',bg='#203138',floor=false,angle=0){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.max(96,Math.floor(768*h/w));const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fg;ctx.font=`600 ${canvas.height*.48}px Arial`;ctx.fillText(text,384,canvas.height*.52,730);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;const mat=new THREE.MeshStandardMaterial({map:texture,roughness:.75,emissive:0xffffff,emissiveMap:texture,emissiveIntensity:.15});ownedMaterials.add(mat);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);mesh.position.set(...p(at,y));mesh.rotation.set(floor?-Math.PI/2:0,floor?0:angle,floor?angle:0);group.add(mesh);return mesh;
  }
  function point(at,y,color=0xffbd79,intensity=12,distance=10){const l=new THREE.PointLight(color,intensity,distance,2);l.position.set(...p(at,y));l.userData.roomId=map.rooms.find(r=>pointInPolygon(...at,r.polygon))?.id;group.add(l);lights.push(l);return l;}
  function practical(at,y=2.6,cool=false,real=false,angle=0){const nx=Math.sin(angle),nz=Math.cos(angle);box(at,y,.56,.2,.26,mats.dark,angle);box([at[0]+nx*1.6,at[1]+nz*1.6],y-.04,.43,.1,.13,cool?mats.cool:mats.warm,angle);if(real)point([at[0]+nx*2.5,at[1]+nz*2.5],y-.22,cool?0x9edce9:0xffbc79,10,9);}
  function fixtureDetails(at,y,angle,length){
    const nx=Math.sin(angle),nz=Math.cos(angle),tx=Math.cos(angle),tz=-Math.sin(angle),offset=(x,z)=>[at[0]+(tx*x+nx*z)*10,at[1]+(tz*x+nz*z)*10];
    box(offset(0,-.14),y,.36,.4,.055,mats.dark,angle,false,'base',.015);
    for(const x of[-.13,.13])for(const dy of(mobile?[0]:[-.15,.15]))geo(new THREE.CylinderGeometry(.023,.023,.025,6).rotateX(Math.PI/2),mats.metal,p(offset(x,-.1),y+dy),[0,angle,0]);
    if(length>11){const atVent=offset(Math.min(2.2,length*.22),-.05);box(atVent,y-.45,1.12,.5,.065,mats.metal,angle,false,'base',.025);box([atVent[0]+nx*.4,atVent[1]+nz*.4],y-.45,.98,.36,.025,mats.black,angle);for(let i=0;i<6;i++)box([atVent[0]+nx*.6,atVent[1]+nz*.6],y-.6+i*.06,1.01,.025,.03,mats.metal,angle);}
  }
  function wall(a,b,h=3.6,t=.55,base=0,collision=true){
    const pa=p(a),pb=p(b),length=Math.hypot(pb[0]-pa[0],pb[2]-pa[2]);if(length<.06)return;
    const center=[(a[0]+b[0])/2,(a[1]+b[1])/2],angle=-Math.atan2(pb[2]-pa[2],pb[0]-pa[0]);
    box(center,base+h/2,length,h,t,mats.wall,angle);
    box(center,base+h+.07,length+.08,.14,t+.13,mats.cap,angle,false,'base',.035);
    box(center,base+.22,length,.32,t+.025,mats.dark,angle);
    if(collision)colliders.push({kind:'wall',a:[pa[0],pa[2]],b:[pb[0],pb[2]],thickness:t,bottom:base,top:base+h});
    for(let offset=1.8;offset<length;offset+=2.8){const f=offset/length,at=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];box(at,base+h/2,.022,h-.35,t+.035,mats.dark,angle);}
    if(length>6){let side=1;const room=map.rooms.find(r=>r.polygon.some((v,i)=>segmentPointDistance(...center,v,r.polygon[(i+1)%r.polygon.length]).distance<5));if(room){const dot=(room.center[0]-center[0])*Math.sin(angle)+(room.center[1]-center[1])*Math.cos(angle);side=dot>=0?1:-1;}const facing=angle+(side<0?Math.PI:0),nx=Math.sin(facing),nz=Math.cos(facing),at=[center[0]+nx*(t*5+1.4),center[1]+nz*(t*5+1.4)];practical(at,base+Math.min(2.65,h-.3),map.theme==='metro',length>9,facing);fixtureDetails(at,base+Math.min(2.65,h-.3),facing,length);if(h>3){const u=[a[0]+nx*(t*5+.7),a[1]+nz*(t*5+.7)],v=[b[0]+nx*(t*5+.7),b[1]+nz*(t*5+.7)];pxBeam(u,v,base+h-.3,.045,mats.metal);}}
  }
  function rail(poly,y=0,closed=true){for(const[a,b]of railSegments(map,poly,y,closed)){
    const len=Math.hypot(b[0]-a[0],b[1]-a[1])*.1;if(len<.12)continue;
    for(let k=0;k<=Math.ceil(len/1.5);k++){const f=k/Math.ceil(len/1.5),at=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];box(at,y+.62,.07,1.24,.07,mats.yellow);}
    pxBeam(a,b,y+1.24,.04,mats.yellow);pxBeam(a,b,y+.65,.035,mats.metal);pxBeam(a,b,y+.12,.065,mats.dark);
    const pa=p(a),pb=p(b);colliders.push({kind:'rail',a:[pa[0],pa[2]],b:[pb[0],pb[2]],thickness:.12,bottom:y,top:y+1.28});
  }}
  const surfaces=levelSurfaces(map),surface=id=>surfaces.find(s=>s.id===id);
  const deck=(f,mat,topMat=mats.floor)=>{geo(slabGeometry(map,f.polygon,f.top-f.bottom,f.holes,f.cuts),mat,[0,f.top,0]);geo(floorGeometry(map,f.polygon,f.holes,f.cuts),topMat,[0,f.top+.012,0]);};
  deck(surface('ground'),map.theme==='coastal'?mats.foundation:mats.dark);
  for(const f of map.additionalFloors){deck(surface(f.id),mats.dark,f.id.includes('track')?mats.dark:mats.floor);if(f.rail)rail(f.polygon,f.floorY||0);if(f.id==='flight-board-deck')for(const at of f.polygon)box(at,(f.floorY-.55)/2,.22,f.floorY-.55,.22,mats.metal,0,true);}
  function ceiling(polygon,y,depth=.22){const cuts=map.stairs.filter(s=>Math.max(s.fromY,s.toY)+1.95>y-depth&&Math.min(s.fromY,s.toY)<y).map(stairsPolygon);geo(slabGeometry(map,polygon,depth,[],cuts),mats.dark,[0,y,0],[0,0,0],'roof');colliders.push({kind:'slab',id:'ceiling',polygon,holes:[],cuts,bottom:y-depth,top:y});}
  for(const r of map.rooms){
    if(r.floorY)deck(surface(r.id),mats.wall);
    if(!r.openEdges)ceiling(r.polygon,(r.floorY||0)+(r.wallHeight||3.6)+.15);
  }
  const walls=wallSegments(map);for(const w of walls)wall(w.a,w.b,w.height,w.thickness,w.base);
  for(const b of map.bridges){deck(surface(b.id),mats.dark,mats.metal);
    if(map.id==='terminal'){rail([[472,610],[799,610]],b.floorY,false);rail([[472,655],[799,655]],b.floorY,false);}else rail(b.polygon,b.floorY);
    // Steel supports are kept at the deck edge and clear of stair mouths.
    for(let i=0;i<b.polygon.length;i++){const a=b.polygon[i],c=b.polygon[(i+1)%b.polygon.length],n=Math.max(1,Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/55));for(let k=0;k<n;k++){const at=[a[0]+(c[0]-a[0])*k/n,a[1]+(c[1]-a[1])*k/n];if(map.stairs.some(s=>segmentPointDistance(...at,s.from,s.to).distance<s.width/2+9))continue;const supports=surfaces.filter(f=>f.top<b.floorY-.5&&surfaceContains(f,at)).map(f=>f.top),base=supports.length?Math.max(...supports):map.theme==='coastal'?-4.2:0,h=b.floorY-.25-base;if(h>.1)box(at,base+h/2,.22,h,.22,mats.metal,0,true);}}
  }
  for(const st of map.stairs){
    const a=p(st.from),b=p(st.to),length=Math.hypot(b[0]-a[0],b[2]-a[2]),rise=st.toY-st.fromY,n=Math.max(3,Math.ceil(Math.abs(rise)/.17)),angle=-Math.atan2(b[2]-a[2],b[0]-a[0]);
    for(let i=0;i<n;i++){const f=(i+.5)/n,y=st.fromY+rise*(i+.5)/n,at=[st.from[0]+(st.to[0]-st.from[0])*f,st.from[1]+(st.to[1]-st.from[1])*f];box(at,y-.09,length/n+.015,.18,st.width*.1,mats.metal,angle);}
    const dx=b[0]-a[0],dz=b[2]-a[2];for(const sign of[-1,1]){const nx=-dz/length*st.width*.05*sign,nz=dx/length*st.width*.05*sign,aa=[a[0]+nx,a[2]+nz],bb=[b[0]+nx,b[2]+nz];
      beam([aa[0],st.fromY-.18,aa[1]],[bb[0],st.toY-.18,bb[1]],.11,mats.dark);
      beam([aa[0],st.fromY+1.18,aa[1]],[bb[0],st.toY+1.18,bb[1]],.038,mats.yellow);
      beam([aa[0],st.fromY+.6,aa[1]],[bb[0],st.toY+.6,bb[1]],.03,mats.metal);
      for(let k=0;k<=Math.ceil(length/1.25);k++){const f=k/Math.ceil(length/1.25),x=aa[0]+(bb[0]-aa[0])*f,z=aa[1]+(bb[1]-aa[1])*f,y=st.fromY+rise*f;beam([x,y-.18,z],[x,y+1.18,z],.035,mats.metal);}
      colliders.push({kind:'rail',a:aa,b:bb,thickness:.09,bottom:Math.min(st.fromY,st.toY),top:Math.max(st.fromY,st.toY)+1.25,yA:st.fromY,yB:st.toY});
    }
  }
  // Real lintels, jambs and room identifiers make door gaps legible in first person.
  const seenPortals=new Set();for(const door of map.doors){if(door.frame===false)continue;const nearest=walls.filter(w=>{const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1];return w.height>=2.8&&Math.abs((door.at[0]-w.a[0])*dz-(door.at[1]-w.a[1])*dx)/Math.hypot(dx,dz)<3;}).sort((a,b)=>segmentPointDistance(...door.at,a.a,a.b).distance-segmentPointDistance(...door.at,b.a,b.b).distance)[0];if(!nearest||segmentPointDistance(...door.at,nearest.a,nearest.b).distance>(door.widthPx||30)/2+7)continue;const key=door.at.map(v=>Math.round(v/5)).join(',');if(seenPortals.has(key))continue;seenPortals.add(key);
    const dx=nearest.b[0]-nearest.a[0],dz=nearest.b[1]-nearest.a[1],len=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx),width=(door.widthPx||30)*.1,[x,,z]=p(door.at),y=floorAt(map,x,z,100)??0;
    box(door.at,y+2.95,width+.24,.3,.7,mats.metal,angle,true);
    for(const sign of[-1,1])box([door.at[0]+sign*dx/len*width*5,door.at[1]+sign*dz/len*width*5],y+1.4,.13,2.8,.7,mats.metal,angle,true);
    const nearby=map.rooms.filter(r=>r.polygon.some((v,i)=>segmentPointDistance(...door.at,v,r.polygon[(i+1)%r.polygon.length]).distance<12));
    if(nearby.length)text(nearby[0].label.replaceAll(' / ',' · '),[door.at[0]+dz/len*4,door.at[1]-dx/len*4],y+2.94,Math.min(width*.9,5),.22,'#d4ded0','#1d3339',false,angle);
  }
  // Thin floor joints use meter coordinates, and never bridge a traced floor opening.
  const [minX,minY,maxX,maxY]=map.frame;
  for(let px=Math.ceil(minX/40)*40;px<maxX;px+=40)for(let py=Math.ceil(minY/40)*40;py<maxY;py+=40){if([-20,0,20].every(dx=>pointInPolygon(px+dx,py,map.outer)&&!map.floorHoles.some(h=>pointInPolygon(px+dx,py,h))))box([px,py],.03,3.95,.012,.016,mats.dark);}
  function routeLine(r){const positions=[];for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=0;d<len;d+=26){const f=d/len,e=Math.min(d+15,len)/len;positions.push(...p([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],.085),...p([a[0]+(b[0]-a[0])*e,a[1]+(b[1]-a[1])*e],.085));}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const mat=new THREE.LineBasicMaterial({color:r.color,transparent:true,opacity:.9,depthTest:false});ownedMaterials.add(mat);const line=new THREE.LineSegments(g,mat);line.renderOrder=7;routes.add(line);
  }
  map.routes.forEach(routeLine);
  for(const [id,team] of[['attacker','ATTACKER'],['defender','DEFENDER']]){const room=map.rooms.find(r=>r.id===id),at=map.anchors[id],y=room?.floorY||0;
    text(team+' SPAWN',at,y+.045,Math.min(12,id==='attacker'?14:11),3,id==='attacker'?'#e1c4b8':'#b4e6f5',id==='attacker'?'#6c3430':'#224d64',true);
  }
  for(const id of['site-a','site-b']){const r=map.rooms.find(r=>r.id===id||r.id===(id==='site-a'?'gate-a':'gate-b')||r.id===(id==='site-a'?'a-site':'b-site'));const at=map.anchors[id],letter=id.endsWith('a')?'A':'B';if(at)text(letter,at,(r?.floorY||0)+.05,3,3,'#f0d6cb','#833d35',true);}

  const localAt=(at,x,z,angle=0)=>[at[0]+(Math.cos(angle)*x+Math.sin(angle)*z)*10,at[1]+(-Math.sin(angle)*x+Math.cos(angle)*z)*10];
  function crate(at,size=[1.6,1.5,1.5],color=mats.cargo,angle=0){const[w,h,d]=size;box(at,h/2,w,h,d,color,angle,true,'base',.045);for(const sign of[-1,1]){box(localAt(at,sign*w*.39,d*.51,angle),h/2,.065,h-.1,.1,mats.metal,angle);box(localAt(at,0,d*.52,angle),sign===1?h-.05:.15,w,.1,.1,mats.metal,angle);}text('ECHO / 04',localAt(at,0,d*.53,angle),h*.58,Math.min(w*.7,2),.2,'#c7d0c3','#34464a',false,angle);}
  function container(at,w=6,d=2.5,angle=0,color=mats.red){crate(at,[w,2.6,d],color,angle);for(let i=-w/2+.2;i<w/2;i+=.32)box(localAt(at,i,d*.5+.01,angle),1.3,.045,2.4,.08,mats.dark,angle);}
  function barrel(at,y=0){const cp=p(at);colliders.push({kind:'circle',x:cp[0],z:cp[2],radius:.37,bottom:y+propOffset,top:y+propOffset+1.24});cyl(at,y+.62,.34,1.24,mats.metal,16);for(const h of[.14,1.08])cyl(at,y+h,.37,.07,mats.dark,16);}
  function consoleAt(at,w=2,d=.7){box(at,.65,w,1.3,d,mats.dark,0,true);box([at[0],at[1]+d*5+.2],1,.75,.4,.04,mats.cool);}
  function planter(at,w=2.2,d=1.8,pink=false){box(at,.35,w,.7,d,mats.cap,0,true);box(at,.73,w-.25,.08,d-.25,mats.moss);if(pink){tree(at);return;}for(let i=0;i<8;i++){const p0=[at[0]+rand(-w*3.7,w*3.7),at[1]+rand(-d*3.7,d*3.7)];geo(new THREE.IcosahedronGeometry(rand(.22,.42),1),mats.moss,p(p0,1+rand(0,.4)));}}
  function tree(at){cyl(at,2.1,.16,3.6,mats.bark,12,.08);const tips=[];for(let i=0;i<9;i++){const a=i/9*Math.PI*2,r=rand(.8,1.7),to=[at[0]+Math.cos(a)*r*10,at[1]+Math.sin(a)*r*10],height=rand(3.45,4.35);beam(p(at,1.7+rand(0,.6)),p(to,height),.052,mats.bark);for(let j=0;j<3;j++){const end=[to[0]+rand(-5,5),to[1]+rand(-5,5)],y=height+rand(0,.5);beam(p(to,height),p(end,y),.019,mats.bark);}tips.push(p(to,height+.25));}const canopy=createBlossomCanopy(tips,mobile,Math.round(at[0]*97+at[1]*31));ownedMaterials.add(canopy.material);group.add(canopy);}
  const rockBase=new THREE.IcosahedronGeometry(1,mobile?1:2);rockBase.deleteAttribute('uv');rockBase.deleteAttribute('normal');const smooth=mergeVertices(rockBase);smooth.computeVertexNormals();smooth.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(smooth.attributes.position.count*2),2));
  function rock(at,sx=3,sy=4,sz=3,y=-3){const g=smooth.clone(),a=g.attributes.position,phase=rand(0,20);for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),k=1+.12*Math.sin(x*7+z*4+phase)+.07*Math.sin(y*12+x*3+phase);a.setXYZ(i,x*sx*k,y*sy*k,z*sz*k);}g.computeVertexNormals();geo(g,mats.rock,p(at,y),[rand(0,.4),rand(0,6),0]);}
  function radar(at){cyl(at,1.1,.6,2.2,mats.metal);const dish=new THREE.Mesh(new THREE.SphereGeometry(3.3,32,18,0,Math.PI*2,0,1.1),mats.white);dish.position.set(...p(at,4.8));dish.rotation.set(2.1,0,.2);group.add(dish);beam(p(at,2),p([at[0]-8,at[1]-12],6.2),.075,mats.metal);}
  function boat(at){const vessel=new THREE.Group();vessel.position.set(...toWorld(map,at,-6.45));const hull=new THREE.Mesh(new THREE.CapsuleGeometry(.8,4.5,5,16),mats.dark);hull.rotation.x=Math.PI/2;hull.scale.set(1.3,.6,1);vessel.add(hull);for(const[y,w,h,d,mat]of[[.9,1.5,1.2,2,mats.white],[1.15,1.52,.45,2.03,mats.glass],[1.56,1.7,.12,2.2,mats.cap]]){const cabin=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);cabin.position.set(0,y,-.3);vessel.add(cabin);}group.add(vessel);dynamic.push({type:'boat',mesh:vessel,baseY:-6.45});}
  function prop(o){const at=o.at||(o.rect?[o.rect[0]+o.rect[2]/2,o.rect[1]+o.rect[3]/2]:null);if(!at)return;const w=o.rect?o.rect[2]*.1:1.6,d=o.rect?o.rect[3]*.1:1.5;
    withFloor(at,()=>{if(o.kind==='crate')crate(at,o.rect?[w,Math.min(2,(w+d)*.4),d]:undefined);else if(o.kind==='crate-stack'){crate(at,[w,2.5,d]);box(at,2.57,w*.94,.13,d*.94,mats.dark);}else if(o.kind==='container')container(at,w,d,o.angle||0,o.color==='red'?mats.red:mats.cargo);
    else if(o.kind==='barrel'||o.kind==='barrels'){for(let i=0;i<(o.kind==='barrels'?5:1);i++)barrel([at[0]+i%2*8,at[1]+Math.floor(i/2)*8]);}
    else if(o.kind==='tank'){const cp=p(at);colliders.push({kind:'circle',x:cp[0],z:cp[2],radius:1.85,bottom:propOffset,top:propOffset+2.8});cyl(at,1.4,1.8,2.8,mats.yellow);for(const y of[.3,2.4])cyl(at,y,1.85,.14,mats.metal);}
    else if(o.kind==='console'||o.kind==='utility-box')consoleAt(at,w,d);
    else if(o.kind==='planter')planter(at,w,d);
    else if(o.kind==='generator'){box(at,1,w,2,d,mats.metal,0,true);for(const offset of[-w*.22,w*.22]){const a=[at[0]+offset*10,at[1]];cyl(a,2.1,Math.min(w/4,d/2)*.8,.12,mats.dark,24);for(let n=0;n<6;n++)box(a,2.19,.07,.05,d*.65,mats.metal,n*Math.PI/6);}}
    else if(o.kind==='radar')radar(at);else if(o.kind==='boat')boat(at);else if(o.kind==='rock'){const size=o.size||[3,4,3],cp=p(at);colliders.push({kind:'circle',x:cp[0],z:cp[2],radius:Math.min(size[0],size[2])*.75,bottom:propOffset-3-size[1],top:propOffset-3+size[1]});rock(at,...size);}
    else if(o.kind==='turnstile-row'){for(let i=0;i<o.count;i++){const a=[at[0]+(i-(o.count-1)/2)*o.spacingPx,at[1]];box(a,.8,.45,1.6,1.2,mats.metal);box([a[0]+4,a[1]],1,.75,.05,.07,mats.yellow);}}
    else if(o.kind==='workbench'){box(at,.9,w,.14,d,mats.metal);for(const side of[-1,1])box([at[0]+side*w*3.8,at[1]],.43,.14,.8,d*.7,mats.dark);}
    else if(o.kind==='server-bank'||o.kind==='substation-equipment'){box(at,1.2,w,2.4,d,mats.metal,0,true);for(let x=at[0]-w*4;x<at[0]+w*4;x+=12){box([x,at[1]+d*5+.2],1.45,.8,1.3,.04,mats.black);box([x,at[1]+d*5+.5],1.8,.16,.08,.02,mats.cool);}}
    else if(o.kind==='control-console')consoleAt(at,w,d);
    else if(o.kind==='red-pipe-bank'){for(let i=0;i<5;i++)cyl([at[0]+(i-2)*6,at[1]],1.75,.18,3.5,mats.red);}
    else if(o.kind==='maintenance-locomotive'){box(at,1.1,w,2.2,d,mats.yellow,0,true,'base',.12);box(at,2.4,w*.5,.6,d*.75,mats.dark);for(const side of[-1,1])for(const xx of[-w*3,w*3])cyl([at[0]+xx,at[1]+side*d*3.4],.22,.32,.24,mats.black,12);}
    else if(o.kind==='hvac-duct-bank'||o.kind==='hvac-duct'){box(at,1.1,w,2.2,d,mats.metal,0,true);for(let z=at[1]-d*4.5;z<at[1]+d*4.5;z+=5)box([at[0],z],2.22,w,.05,.035,mats.dark);}
    else if(o.kind==='hvac-tank'){const cp=p(at);colliders.push({kind:'circle',x:cp[0],z:cp[2],radius:(o.radiusPx||13)*.1,bottom:propOffset,top:propOffset+3.1});cyl(at,1.5,(o.radiusPx||13)*.1,3,mats.metal);cyl(at,3.03,(o.radiusPx||13)*.1,.12,mats.dark);}
    else if(o.kind==='bench')box(at,.5,w,1,d,mats.metal,0,true);else if(o.kind==='pipe-bank'){for(let i=0;i<4;i++)cyl([at[0]+i*8,at[1]],1.7,.18,3.4,mats.red);}
    else if(o.kind==='column')box(at,2,.55,4,.55,mats.wall,0,true);else consoleAt(at,w,d);});
  }
  if(map.id==='blacksite'){
    map.props.forEach(prop);
    const core=map.core,at=core.center;const cp=p(at);colliders.push({kind:'circle',x:cp[0],z:cp[2],radius:3.1,bottom:0,top:8.4});
    // Core gallery slab, openings and handrails are shared with navigation.
    cyl(at,4.1,3.1,7.7,mats.glass,48);cyl(at,4.1,.9,7.5,mats.cool,32);
    const coreSkin=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.6,7.5,48,1,true),new THREE.MeshStandardMaterial({color:0x63cbbb,emissive:0x56dfcb,emissiveIntensity:.9,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));ownedMaterials.add(coreSkin.material);coreSkin.position.set(...p(at,4.2));group.add(coreSkin);dynamic.push({type:'core',mesh:coreSkin});
    for(const y of[.45,2.5,4.7,7.9]){cyl(at,y,3.4,.2,mats.metal,32);cyl(at,y+.12,3.3,.06,mats.cool,32);}
    for(let i=0;i<8;i++){const a=i*Math.PI/4,x=at[0]+Math.cos(a)*49,z=at[1]+Math.sin(a)*49;box([x,z],4.1,.16,8.2,.16,mats.metal);pxBeam([x,z],[at[0]+Math.cos(a)*29,at[1]+Math.sin(a)*29],8.3,.09,mats.metal);}
    point(at,4,0x64e6d3,110,25);point(map.pit.center,-2,0xe5482f,72,18);
    const pit=map.pit;geo(floorGeometry(map,pit.polygon),mats.dark,[0,pit.floorY+.02,0]);
    for(let i=0;i<pit.polygon.length;i++){const a=pit.polygon[i],b=pit.polygon[(i+1)%pit.polygon.length];wall(a,b,4.2,.25,-4.2,false);}
    const rp=p(pit.center);colliders.push({kind:'circle',x:rp[0],z:rp[2],radius:1.8,bottom:-4.2,top:-2.5});cyl(pit.center,-3.4,1.7,1.6,mats.dark,24);for(const y of[-4,-3.5,-3,-2.5]){cyl(pit.center,y,1.8,.1,mats.metal);cyl(pit.center,y+.07,1.76,.055,mats.danger);}
    // Perimeter rocks follow the traced outline instead of a rectangular island.
    for(let i=0;i<map.outer.length;i++){const a=map.outer[i],b=map.outer[(i+1)%map.outer.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=0;d<len;d+=40){const f=d/len,x=a[0]+(b[0]-a[0])*f,z=a[1]+(b[1]-a[1])*f;let nx=-(b[1]-a[1])/len,nz=(b[0]-a[0])/len;if(pointInPolygon(x+nx*8,z+nz*8,map.outer)){nx=-nx;nz=-nz;}rock([x+nx*rand(20,45),z+nz*rand(20,45)],rand(2.5,5.5),rand(3,7),rand(2.5,5.5),rand(-5,-3));}}
    // Distant facility on the northern cliff, as in the concept's background.
    for(let i=0;i<12;i++)rock([740+i*50,-30-i*5],rand(6,13),rand(10,18),rand(5,10),-1);
    box([930,-60],12,20,7,10,mats.wall);cyl([945,-70],18,2,3,mats.cap,24);geo(new THREE.SphereGeometry(3.3,32,20),mats.cap,p([945,-70],21));
  }
  if(map.id==='skyport'){
    const props=map.props;
    for(const at of props.cherryTrees)withFloor(at,()=>planter(at,3.2,2.5,true));
    for(const at of [...props.westCover,...props.eastCover])withFloor(at,()=>crate(at,[2.4,1.15,1.2],mats.metal));
    for(const at of props.securityBollards)withFloor(at,()=>{const cp=p(at);colliders.push({kind:'circle',x:cp[0],z:cp[2],radius:.29,bottom:propOffset,top:propOffset+1.46});cyl(at,.7,.28,1.4,mats.metal);cyl(at,1.42,.29,.08,mats.cool);});
    for(const at of props.turnstiles)prop({kind:'turnstile-row',at,count:1,spacingPx:1});
    for(const at of props.blueWayfindingMonoliths){box(at,3,.65,6,.4,mats.dark);box([at[0],at[1]+2.2],3,.55,5.6,.03,mats.cool);text('↑ NEXUS',[at[0],at[1]+2.5],3,.48,2.5,'#b9edfa','#245986');}
    const c=props.ringSculpture.center,cp=p(c);colliders.push({kind:'circle',x:cp[0],z:cp[2],radius:4.4,bottom:0,top:1.3});cyl(c,.6,4.5,1.2,mats.cap,48);cyl(c,1.25,4.2,.1,mats.moss,48);
    for(const [angle,color]of[[.75,mats.cool],[-.75,mats.warm]]){const r=new THREE.Mesh(new THREE.TorusGeometry(3.2,.11,10,64),color);r.position.set(...p(c,4));r.rotation.set(.65,angle,.4);group.add(r);}
    const dome=props.dome;const shell=new THREE.Mesh(new THREE.SphereGeometry(1,48,24,0,Math.PI*2,0,Math.PI/2),mats.glass);shell.scale.set(dome.radiusX*.1,dome.height,dome.radiusZ*.1);shell.position.set(...p(dome.floorCenter,.25));group.add(shell);
    for(let i=0;i<13;i++){const theta=i/12*Math.PI,points=[];for(let j=0;j<=24;j++){const a=j/24*Math.PI;points.push(new THREE.Vector3(...p([dome.floorCenter[0]+Math.cos(a)*Math.cos(theta)*dome.radiusX,dome.floorCenter[1]+Math.cos(a)*Math.sin(theta)*dome.radiusZ],.3+Math.sin(a)*dome.height)));}const curve=new THREE.CatmullRomCurve3(points);geo(new THREE.TubeGeometry(curve,32,.055,6,false),mats.metal);}
    for(const yy of[.28,.55]){const ellipse=new THREE.EllipseCurve(0,0,dome.radiusX*.1,dome.radiusZ*.1);const points=ellipse.getPoints(64).map(q=>new THREE.Vector3(q.x,0,q.y));const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),64,.08,6,true);geo(g,mats.metal,p(dome.floorCenter,yy));}
    for(const height of[1.8,3.7,5.6,7.1]){const ratio=Math.sqrt(Math.max(0,1-((height-.25)/dome.height)**2)),ellipse=new THREE.EllipseCurve(0,0,dome.radiusX*.1*ratio,dome.radiusZ*.1*ratio),points=ellipse.getPoints(80).map(q=>new THREE.Vector3(q.x,0,q.y));geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),80,.038,5,true),mats.metal,p(dome.floorCenter,height));}
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2,at=[dome.floorCenter[0]+Math.cos(a)*dome.radiusX,dome.floorCenter[1]+Math.sin(a)*dome.radiusZ];box(at,.28,.42,.12,.42,mats.metal,0,false,'base',.025);}
    text('DEPARTURES  /  NEXUS',[props.flightBoard.center[0],props.flightBoard.center[1]+2],4.9,10,2.7,'#a7dfed','#142c41');box(props.flightBoard.center,4.9,10.5,3,.35,mats.dark);
    jet([35,507],8.4,1.52,false,0);jet([1230,430],8.8,-1.8,false,0);jet([191,801],3.9,1.55,true,-2.5);jet([1073,801],3.9,1.55,true,-2.5);
    // Dense underside braces distinguish a suspended platform from a ground slab.
    for(let i=0;i<map.outer.length;i+=3){const at=map.outer[i];box(at,-3,.3,5,.3,mats.metal);box([at[0],at[1]],-5,.75,.3,.75,mats.yellow);}
  }
  if(map.id==='terminal'){
    for(const o of map.props)prop(o);
    for(const t of map.tracks){const [x,z,w,d]=t.rect;for(let py=z;py<z+d;py+=12)box([x+w/2,py],-1.08,w*.1-.3,.14,.24,mats.metal);for(const railX of t.railsX){pxBeam([railX,z],[railX,z+d],-.91,.06,mats.metal);} }
    for(const tr of map.trains){const [x,z,w,d]=tr.rect,carLength=d*.1/tr.cars;for(let car=0;car<tr.cars;car++){
      const at=[x+w/2,z+(car+.5)*d/tr.cars],y=tr.y+tr.height/2;
      box(at,y,w*.1,tr.height,carLength-.25,mats.metal,0,true,'base',.22);
      box(at,tr.y+1,w*.1+.035,.48,carLength-.32,mats.red);
      box(at,tr.y+3.1,w*.1+.04,.1,carLength-.3,mats.white);
      for(let py=at[1]-carLength*5+12;py<at[1]+carLength*5-5;py+=22){for(const side of[-1,1])box([at[0]+side*(w/2+.3),py],tr.y+2.35,.035,.95,1.35,mats.black,0,false,'base',.04);}
      const track=map.tracks.find(t=>at[0]>=t.rect[0]&&at[0]<=t.rect[0]+t.rect[2]);for(const py of[at[1]-carLength*3,at[1]+carLength*3]){for(const railX of track?.railsX||[at[0]-w*.28,at[0]+w*.28])geo(new THREE.CylinderGeometry(.24,.24,.14,16).rotateZ(Math.PI/2),mats.black,p([railX,py],-.61));box([at[0],py],-.43,w*.07,.18,.5,mats.dark);}
      for(const dy of[-carLength*5+.1,carLength*5-.1])box([at[0],at[1]+dy],tr.y+1.9,w*.08,2.5,.16,mats.dark,0,false,'base',.12);
    }const nose=[x+w/2,tr.frontPixelY];box(nose,tr.y+2.3,w*.075,.95,.055,mats.black);for(const side of[-1,1]){box([nose[0]+side*w*.28,nose[1]],tr.y+1.05,.18,.18,.08,mats.warm);} }
    // Overhead structure remains in first-person and is cut away in plan mode.
    ceiling(map.outer,6.5);
    for(let py=320;py<840;py+=55){for(const px of[510,750]){box([px,py],3,.6,6,.6,mats.wall,0,true);box([px,py],5.8,5.5,.22,.25,mats.metal);box([px,py],5.6,3.7,.08,.18,mats.cool);point([px,py],4.7,0xb3d7e3,10,11);}pxBeam([495,py],[776,py],6.1,.1,mats.metal,'roof');}
    for(const px of[499,773])pxBeam([px,310],[px,838],4.8,.14,mats.red,'roof');
    for(const at of[[638,225],[638,890]]){text('TERMINAL / DEPARTURES',at,3.15,8,.9,'#e4d4a8','#1b303b');}
    text('A / PLATFORM OPS',[418,450],2.9,6,.8,'#e5cfbd','#5b3430');text('B / SERVICE DEPOT',[895,470],2.9,6,.8,'#e5cfbd','#5b3430');
  }
  function jet(at,size,angle,vtol=false,floor=0){
    const aircraft=new THREE.Group();aircraft.position.set(...p(at,floor+1.5));aircraft.rotation.y=angle;
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(size*.11,size*2.5,6,20),mats.white);body.rotation.x=Math.PI/2;aircraft.add(body);
    const wingShape=new THREE.Shape();wingShape.moveTo(0,size*.45);wingShape.lineTo(size*1.7,-size*.35);wingShape.lineTo(size*1.75,-size*.65);wingShape.lineTo(0,-size*.2);wingShape.lineTo(-size*1.75,-size*.65);wingShape.lineTo(-size*1.7,-size*.35);wingShape.closePath();
    const wing=new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape,{depth:.09,bevelEnabled:false}),mats.white);wing.rotation.x=-Math.PI/2;aircraft.add(wing);
    const tail=wing.clone();tail.scale.set(.37,.37,.6);tail.position.z=-size*1.15;aircraft.add(tail);
    const fin=new THREE.Mesh(new THREE.BoxGeometry(.1,size*.65,size*.55),mats.white);fin.position.set(0,size*.31,-size*1.18);aircraft.add(fin);
    for(const side of[-1,1]){const engine=new THREE.Mesh(new THREE.CylinderGeometry(size*.13,size*.15,size*.45,16),mats.metal);engine.rotation.x=Math.PI/2;engine.position.set(side*size*.65,-size*.12,-size*.1);aircraft.add(engine);const dark=new THREE.Mesh(new THREE.CircleGeometry(size*.12,16),mats.black);dark.position.set(side*size*.65,-size*.12,size*.13);aircraft.add(dark);}
    for(let z=-size;z<size;z+=size*.12)for(const side of[-1,1]){const win=new THREE.Mesh(new THREE.PlaneGeometry(.13,.18),mats.black);win.rotation.y=side*Math.PI/2;win.position.set(side*size*.112,size*.03,z);aircraft.add(win);}
    if(vtol){for(const[x,z]of[[-size*.36,-size*.7],[size*.36,-size*.7],[0,size*.7]]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,2,8),mats.metal);leg.position.set(x,-1,z);aircraft.add(leg);const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.16,12),mats.black);wheel.rotation.z=Math.PI/2;wheel.position.set(x,-2.12,z);aircraft.add(wheel);}aircraft.scale.set(1,.65,.7);for(const side of[-1,1]){const fan=new THREE.Mesh(new THREE.TorusGeometry(size*.32,.1,8,24),mats.dark);fan.rotation.x=Math.PI/2;fan.position.x=side*size*.83;aircraft.add(fan);}}
    aircraft.updateMatrixWorld(true);aircraft.traverse(child=>{if(child.isMesh){geo(child.geometry.clone().applyMatrix4(child.matrixWorld),child.material);child.geometry.dispose();}});
  }
  // Floor-level contact patches under cover complement high-tier SSAO.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,3,32,32,32);gradient.addColorStop(0,'rgba(0,0,0,.45)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const tex=new THREE.CanvasTexture(shadowCanvas);const shadowMat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,opacity:.65});ownedMaterials.add(shadowMat);
  for(const c of colliders.filter(c=>c.kind==='box'&&Math.abs(c.bottom-(floorAt(map,c.x,c.z,c.bottom+.02)??c.bottom))<.15).slice(0,90)){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(c.w*1.8,c.d*1.8),shadowMat);mesh.rotation.x=-Math.PI/2;mesh.position.set(c.x,(floorAt(map,c.x,c.z,c.bottom+.02)??c.bottom)+.035,c.z);group.add(mesh);}
  for(const {mat,layer,geos} of batches.values()){
    const nonIndexed=geos.some(g=>!g.index),prepared=nonIndexed?geos.map(g=>g.index?g.toNonIndexed():g):geos;const merged=mergeGeometries(prepared,false);if(!merged)throw new Error('Map geometry merge failed');const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=![mats.cool,mats.warm,mats.danger,mats.glass].includes(mat);mesh.receiveShadow=true;(layer==='roof'?roofs:group).add(mesh);for(const g of prepared)g.dispose();for(const g of geos)g.dispose();
  }
  roofs.visible=false;
  return{group,roofs,routes,lights,colliders,dynamic,materials:mats,dispose(){group.traverse(o=>{o.geometry?.dispose();});for(const mat of ownedMaterials){mat.map?.dispose();mat.dispose();}}};
}
