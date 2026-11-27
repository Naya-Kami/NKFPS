import blacksite from './data/blacksite.json' with { type:'json' };
import skyport from './data/skyport.json' with { type:'json' };
import terminal from './data/terminal.json' with { type:'json' };
import {publicAsset} from '../publicAsset.js';

export const MAP_IDS=['blacksite','skyport','terminal'];
const rectPoly=([x,z,w,d])=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
const mean=poly=>poly.reduce((v,p)=>[v[0]+p[0]/poly.length,v[1]+p[1]/poly.length],[0,0]);
function normalize(raw){
  const id=raw.id,origin=raw.origin||(id==='skyport'?[630,470]:[500,620]);
  const rooms=raw.rooms.map(r=>({...r,center:r.center||raw.anchors?.[r.id]||mean(r.polygon),floorY:r.floorY||0,openEdges:!!r.openEdges}));
  const map={...raw,id,title:raw.title||raw.name,origin,scale:.1,reference:publicAsset(`references/${id}.jpg`),rooms,additionalFloors:raw.additionalFloors||[],bridges:raw.bridges||[],stairs:raw.stairs||[],doors:raw.doors||[],anchors:{...(raw.anchors||{})}};
  map.theme=id==='blacksite'?'coastal':id==='skyport'?'sky':'metro';
  map.subtitle={blacksite:'COASTAL RESEARCH FACILITY / CONTAINMENT LAB',skyport:'FLOATING AIRPORT TERMINAL / DOCKING PLATFORMS',terminal:'UNDERGROUND METRO / MAINTENANCE NETWORK'}[id];
  map.accent={blacksite:'#e3aa69',skyport:'#80ccf2',terminal:'#d48167'}[id];
  map.routes=(raw.routes||[]).map(r=>({...r,color:r.color||(r.kind==='main'?'#5ebcf0':r.kind==='rotation'?'#9edb58':'#6fc5e3')}));
  map.wallRuns=(raw.wallRuns||[]).map(r=>Array.isArray(r)?{points:r,height:id==='skyport'?3.6:3.5,thickness:.55}:r);
  for(const room of rooms){for(const d of room.doors||[])map.doors.push({at:d.center,widthPx:d.width||30});map.anchors[room.id]??=room.center;}
  if(id==='blacksite'){
    map.floorHoles=[raw.pit.polygon];map.focus=raw.core.center;map.frame=[25,115,960,1210];
    map.additionalFloors.push({...raw.pit,id:'pit',floorY:-4.2});
    map.additionalFloors.push({id:'radar-link',polygon:rectPoly([772,295,42,30]),floorY:0});map.doors.push({at:[505,1124],widthPx:85});
    map.anchors.core=raw.core.center;map.anchors.pit=raw.pit.center;
    map.additionalFloors.push({id:'core-gallery',polygon:raw.core.polygon,floorY:.35,rail:true});map.stairs.push({id:'core-north-threshold',from:[505,288],to:[505,306],width:34,fromY:0,toY:.35},{id:'core-south-threshold',from:[505,453],to:[505,433],width:34,fromY:0,toY:.35});
    map.doors.push({at:[665,575],widthPx:36,frame:false},{at:[641,553],widthPx:36,frame:false});
    map.anchors['caves-flank']=[885,625];map.anchors['cliff-walk']=[99,280];map.anchors.radar=[866,276];
    map.labels=[...rooms.filter(r=>!['service-tunnel','attacker','defender'].includes(r.id)).map(r=>({id:r.id,text:r.label,at:r.center,y:1})),{id:'core',text:'CONTAINMENT CORE',at:raw.core.center,y:8.6},{id:'pit',text:'REACTOR PIT / LOWER',at:raw.pit.center,y:-1.8},{id:'catwalk',text:'CATWALK / UPPER',at:[505,511],y:5.2},{id:'cliff-walk',text:'CLIFF WALK',at:[99,280],y:.8},{id:'radar',text:'RADAR PLATFORM',at:[866,276],y:1},{id:'caves-flank',text:'CAVES FLANK',at:[886,626],y:1},{id:'service-tunnel',text:'SERVICE TUNNEL',at:[154,590],y:1}];
  }else if(id==='skyport'){
    map.frame=[20,0,1240,965];map.focus=[633,538];map.floorHoles=[];
    // Preserve the visible terraces: raised security deck and higher north spawn.
    rooms.find(r=>r.id==='defender').floorY=4.2;rooms.find(r=>r.id==='security').floorY=2;
    for(const r of rooms.filter(r=>r.id.includes('service')))r.floorY=2;
    for(const s of map.stairs){s.fromY=0;s.toY=s.rise;if(s.label.startsWith('north-')){s.fromY=2;s.toY=4.2;}if(s.label.startsWith('departures-'))s.toY=2.5;}
    map.floorHoles=raw.dockingPads.map(p=>p.polygon.map(v=>{let q=[...v];for(let k=0;k<80&&!pointInPolygon(...q,map.outer);k++)q=[q[0]+(p.center[0]-q[0])*.025,q[1]+(p.center[1]-q[1])*.025];return[q[0]+(p.center[0]-q[0])*.025,q[1]+(p.center[1]-q[1])*.025];}));
    map.additionalFloors.push(...raw.dockingPads.map(p=>({...p,floorY:-2.5,rail:true})),...raw.boardingBridges.map(p=>({...p,floorY:0,rail:true})),{id:'flight-board-deck',polygon:rectPoly([523,720,221,40]),floorY:2.5});
    // Compact access ramps retain the lower docking level without adding buildings.
    map.stairs.push({id:'west-dock-ramp',from:[346,737],to:[305,737],width:36,fromY:0,toY:-2.5},{id:'east-dock-ramp',from:[918,737],to:[959,737],width:36,fromY:0,toY:-2.5});
    map.doors.push({at:[575,331],widthPx:27},{at:[691,331],widthPx:27});
    const flankWalk=[[268,400],[290,400],[290,260],[326,223],[350,218],[344,196],[315,207],[268,251]],securityLink=[[476,210],[513,230],[527,260],[532,260],[532,282],[512,282],[497,250],[476,233]];
    for(const side of['west','east']){const mirror=p=>side==='west'?p:[1264-p[0],p[1]];map.additionalFloors.push({id:side+'-service-walk',polygon:flankWalk.map(mirror),floorY:1.2,rail:true},{id:side+'-security-link',polygon:securityLink.map(mirror),floorY:2,rail:true});map.stairs.push({id:side+'-service-entry',from:mirror([344,213]),to:mirror([367,204]),width:20,fromY:1.2,toY:2});}
    map.doors.push({at:[247,505],widthPx:35},{at:[1015,505],widthPx:35});
    map.anchors={...map.anchors,attacker:[634,896],defender:[631,118],'site-a':[397,324],'site-b':[867,324],atrium:[633,538],security:[632,252],departures:[632,685],'dock-west':[196,790],'dock-east':[1068,790]};
    map.labels=rooms.filter(r=>!['defender','attacker'].includes(r.id)).map(r=>({id:r.id,text:r.label,at:r.center,y:r.floorY+1}));
    map.labels.push(...raw.dockingPads.map(p=>({id:p.id,text:p.label,at:p.center,y:-1.5})),{id:'boarding-a',text:'BOARDING BRIDGE A',at:[192,488],y:1},{id:'boarding-b',text:'BOARDING BRIDGE B',at:[1098,488],y:1});
  }else{
    map.anchors['site-a']=raw.anchors['a-site'];map.anchors['site-b']=raw.anchors['b-site'];
    map.frame=[235,0,1060,1185];map.focus=[636,605];map.floorHoles=[rectPoly([570,300,134,546])];
    map.additionalFloors.push(...raw.tracks.map(t=>({id:t.id,polygon:rectPoly(t.rect),floorY:t.floorY})),{id:'center-lane',polygon:rectPoly(raw.centerLane.rect),floorY:-.8});
    // Keep the thin bridge footprint from the picture. Height is inferred, not surveyed.
    map.bridges=[{id:'platform-bridge',polygon:rectPoly(raw.bridge.rect),floorY:3.4,rail:true}];
    rooms.find(r=>r.id==='defender').floorY=.8;
    map.stairs=raw.stairs.map(s=>({...s,from:[s.rect[0]+s.rect[2]/2,s.rect[1]],to:[s.rect[0]+s.rect[2]/2,s.rect[1]+s.rect[3]],width:s.rect[2]}));
    for(const s of map.stairs){const x=s.id==='north-ticket-west'?622:s.id==='north-ticket-east'?650:null;if(x){s.from[0]=x;s.to[0]=x;}}
    map.stairs.push({id:'bridge-west-step',from:[532,574],to:[532,628],width:22,fromY:0,toY:3.4},{id:'bridge-east-step',from:[735,574],to:[735,628],width:22,fromY:0,toY:3.4},{id:'center-north-ramp',from:[637,322],to:[637,287],width:32,fromY:-.8,toY:0},{id:'center-south-ramp',from:[637,824],to:[637,856],width:32,fromY:-.8,toY:0});
    map.labels=rooms.filter(r=>!['attacker','defender'].includes(r.id)).map(r=>({id:r.id==='a-site'?'site-a':r.id==='b-site'?'site-b':r.id,text:r.label,at:r.center,y:1}));
    for(const [id,text]of[['platform-west','PLATFORM / WEST'],['platform-east','PLATFORM / EAST'],['bridge','PLATFORM BRIDGE']])map.labels.push({id,text,at:map.anchors[id],y:id==='bridge'?1.5:1});
  }
  map.labels.push({id:'attacker',text:'ATTACKER SPAWN',at:map.anchors.attacker,y:1.4,team:'attacker'},{id:'defender',text:'DEFENDER SPAWN',at:map.anchors.defender,y:(rooms.find(r=>r.id==='defender')?.floorY||0)+1.4,team:'defender'});
  map.poi=[['attacker','ATTACKER SPAWN'],['defender','DEFENDER SPAWN'],['site-a','SITE A'],['site-b','SITE B'],[id==='blacksite'?'core':id==='skyport'?'atrium':'bridge',id==='blacksite'?'CONTAINMENT CORE':id==='skyport'?'TERMINAL ATRIUM':'PLATFORM BRIDGE']].map(([id,label])=>({id,label,at:map.anchors[id],y:0}));
  for(const poi of map.poi){const room=rooms.find(r=>r.id===poi.id);poi.y=room?.floorY||0;}
  return map;
}
export const MAPS=Object.fromEntries([blacksite,skyport,terminal].map(r=>{const m=normalize(structuredClone(r));return[m.id,m];}));
export function getMap(id){return MAPS[id]||MAPS.blacksite;}
export const toWorld=(map,[px,py],y=0)=>[(px-map.origin[0])*map.scale,y,(py-map.origin[1])*map.scale];
export const toPixel=(map,x,z)=>[x/map.scale+map.origin[0],z/map.scale+map.origin[1]];
export function pointInPolygon(x,y,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function segmentPointDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz;const t=len?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/len)):0;return{distance:Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t),t};}
export function floorAt(map,x,z,currentFeet=0){
  const p=toPixel(map,x,z),heights=levelSurfaces(map).filter(s=>surfaceContains(s,p,.27/map.scale)&&s.top<=currentFeet+.68).map(s=>s.top);
  for(const s of map.stairs){const t=stairProgress(s,p);if(t!==null){const y=s.fromY+(s.toY-s.fromY)*t;if(y<=currentFeet+.68)heights.push(y);}}
  return heights.length?Math.max(...heights):null;
}
export function stairProgress(s,p){const dx=s.to[0]-s.from[0],dz=s.to[1]-s.from[1],d2=dx*dx+dz*dz;if(!d2)return null;const t=((p[0]-s.from[0])*dx+(p[1]-s.from[1])*dz)/d2;if(t<-.00001||t>1.00001)return null;return Math.abs((p[0]-s.from[0])*dz-(p[1]-s.from[1])*dx)/Math.sqrt(d2)<=s.width/2?Math.max(0,Math.min(1,t)):null;}
export function stairOpening(s,level){
  const rise=s.toY-s.fromY;if(!rise||level<=Math.min(s.fromY,s.toY)+.04||level>Math.max(s.fromY,s.toY)+.01)return null;
  const t=Math.max(0,Math.min(1,(level-.035-s.fromY)/rise)),lo=rise>0?0:t,hi=rise>0?t:1;
  const dx=s.to[0]-s.from[0],dz=s.to[1]-s.from[1],n=Math.hypot(dx,dz),nx=-dz/n*(s.width/2+.5),nz=dx/n*(s.width/2+.5),a=[s.from[0]+dx*lo,s.from[1]+dz*lo],b=[s.from[0]+dx*hi,s.from[1]+dz*hi];
  return[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]];
}
const surfaceCache=new WeakMap();
export function levelSurfaces(map){
  if(surfaceCache.has(map))return surfaceCache.get(map);
  const make=(id,polygon,top,depth,holes=[])=>({id,polygon,top,bottom:top-depth,holes,cuts:map.stairs.map(s=>stairOpening(s,top)).filter(Boolean)});
  const list=[make('ground',map.outer,0,map.theme==='coastal'?7:1.6,map.floorHoles||[])];
  for(const f of map.additionalFloors||[])list.push(make(f.id,f.polygon,f.floorY||0,/-service-walk|-security-link/.test(f.id)?f.floorY:.55));
  for(const f of map.rooms||[])if(f.floorY)list.push(make(f.id,f.polygon,f.floorY,f.floorY));
  for(const b of map.bridges||[])list.push(make(b.id,b.polygon,b.floorY,.25));
  surfaceCache.set(map,list);return list;
}
export function surfaceContains(surface,p,padding=0){const near=poly=>padding>0&&poly.some((v,i)=>segmentPointDistance(...p,v,poly[(i+1)%poly.length]).distance<padding);return(pointInPolygon(...p,surface.polygon)||near(surface.polygon))&&![...(surface.holes||[]),...(surface.cuts||[])].some(h=>pointInPolygon(...p,h)&&!near(h));}
export function railSegments(map,polygon,y,closed=true){
  const result=[],surfaces=levelSurfaces(map),cuts=[...map.doors.map(d=>({at:d.at,widthPx:d.widthPx})),...map.stairs.flatMap(s=>[{at:s.from,widthPx:s.width+9},{at:s.to,widthPx:s.width+9}])];
  const onFloor=(p)=>surfaces.some(s=>Math.abs(s.top-y)<.08&&surfaceContains(s,p));
  for(let i=0;i<(closed?polygon.length:polygon.length-1);i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1)continue;
    const openings=[...cuts];
    // The whole stair/deck intersection is a stairwell, including head clearance.
    for(const s of map.stairs){const dx=b[0]-a[0],dz=b[1]-a[1],sx=s.to[0]-s.from[0],sz=s.to[1]-s.from[1],den=dx*sz-dz*sx;if(Math.abs(den)<1e-6)continue;const ex=s.from[0]-a[0],ez=s.from[1]-a[1],t=(ex*sz-ez*sx)/den,u=(ex*dz-ez*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1&&y>=Math.min(s.fromY,s.toY)-.1&&y<=Math.max(s.fromY,s.toY)+.1)openings.push({at:[a[0]+dx*t,a[1]+dz*t],widthPx:s.width+12});}
    for(const [u,v]of splitSegment(a,b,openings)){
      const n=Math.max(1,Math.ceil(Math.hypot(v[0]-u[0],v[1]-u[1])/4)),nx=-(b[1]-a[1])/length*4,nz=(b[0]-a[0])/length*4;let start=null;
      for(let j=0;j<n;j++){const lo=j/n,hi=(j+1)/n,p=[u[0]+(v[0]-u[0])*(lo+hi)/2,u[1]+(v[1]-u[1])*(lo+hi)/2],connected=onFloor([p[0]+nx,p[1]+nz])&&onFloor([p[0]-nx,p[1]-nz]);if(!connected&&start===null)start=lo;if(start!==null&&(connected||j===n-1)){const end=connected?lo:hi;if(end-start>.001)result.push([[u[0]+(v[0]-u[0])*start,u[1]+(v[1]-u[1])*start],[u[0]+(v[0]-u[0])*end,u[1]+(v[1]-u[1])*end]]);start=null;}}
    }
  }return result;
}
export function roomAt(map,x,z,feet=0){const p=toPixel(map,x,z);for(const f of[...map.bridges,...map.additionalFloors])if(Math.abs((f.floorY||0)-feet)<.5&&pointInPolygon(...p,f.polygon)){const label=map.labels.find(l=>l.id===f.id);return f.label||label?.text||f.id.replaceAll('-',' ').toUpperCase();}for(const r of map.rooms)if(pointInPolygon(...p,r.polygon))return r.label;return map.theme==='metro'?'SERVICE NETWORK':map.theme==='sky'?'TERMINAL CONCOURSE':'FACILITY APPROACH';}
// The same split segments drive the visible walls and movement collision.
export function splitSegment(a,b,doors){
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);let intervals=[[0,1]];
  for(const door of doors){const d=segmentPointDistance(...door.at,a,b);if(d.distance>11)continue;const half=(door.widthPx||30)/(2*length);const lo=d.t-half,hi=d.t+half;
    intervals=intervals.flatMap(([s,e])=>hi<=s||lo>=e?[[s,e]]:[[s,Math.max(s,lo)],[Math.min(e,hi),e]].filter(([u,v])=>v-u>.003));
  }
  return intervals.filter(([s,e])=>(e-s)*length>2).map(([s,e])=>[[a[0]+(b[0]-a[0])*s,a[1]+(b[1]-a[1])*s],[a[0]+(b[0]-a[0])*e,a[1]+(b[1]-a[1])*e]]);
}
export function wallSegments(map){
  const segments=[],seen=new Set();
  const push=(a,b,height=3.6,thickness=.55,base=0)=>{const key=[a,b].map(p=>p.map(v=>Math.round(v)).join(',')).sort().join('|');if(!seen.has(key)){seen.add(key);segments.push({a,b,height,thickness,base});}};
  const run=(points,h=3.6,t=.55,y=0,split=true)=>{for(let i=1;i<points.length;i++)for(const [a,b] of split?splitSegment(points[i-1],points[i],map.doors):[[points[i-1],points[i]]])push(a,b,h,t,y);};
  run([...map.outer,map.outer[0]],map.id==='skyport'?1.3:map.id==='blacksite'?3:4.2,.62);
  if(map.id!=='terminal')for(const r of map.rooms)if(!r.openEdges)run([...r.polygon,r.polygon[0]],r.wallHeight||3.6,.55,r.floorY||0);
  for(const r of map.wallRuns)run(r.points,r.height||3.6,r.thickness||.55,r.floorY||0,map.id!=='terminal');
  return segments;
}
export {rectPoly};
