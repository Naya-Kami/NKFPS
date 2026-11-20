import * as THREE from 'three';
import {floorAt,levelSurfaces,surfaceContains} from './atlas.js';

// Decorative geometry only. The traced floors, portals, stairs and colliders
// remain the source of truth; no part of this pass creates a walking obstacle.
const FLIGHTS=[
  ['21:35','NX 214','LONDON HEATHROW','A02','BOARDING'],
  ['21:50','NX 608','OSLO','B04','GATE OPEN'],
  ['22:10','NX 432','AMSTERDAM','A06','ON TIME'],
  ['22:25','NX 118','STOCKHOLM','B02','ON TIME'],
  ['22:40','NX 705','REYKJAVIK','A04','ON TIME'],
  ['23:05','NX 352','BERLIN','B06','ON TIME']
];

function signageAtlas(mobile){
  const logicalWidth=2048,logicalHeight=1024,canvas=document.createElement('canvas');
  canvas.width=mobile?1024:logicalWidth;canvas.height=mobile?512:logicalHeight;
  const ctx=canvas.getContext('2d'),scale=canvas.width/logicalWidth;
  ctx.scale(scale,scale);
  const regions={board:[0,0,2048,560]};
  ctx.fillStyle='#091820';ctx.fillRect(0,0,2048,560);
  ctx.fillStyle='#112b38';ctx.fillRect(16,16,2016,105);
  // A vector pictogram stays monochrome and avoids platform-dependent emoji.
  ctx.save();ctx.translate(60,38);ctx.fillStyle='#e3e9df';ctx.beginPath();
  for(const [i,[x,y]]of[[0,21],[28,21],[43,0],[50,0],[45,21],[78,28],[78,35],[45,31],[47,53],[39,53],[28,31],[0,31]].entries())i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  ctx.closePath();ctx.fill();ctx.restore();
  ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle='#e7ece3';ctx.font='600 66px Arial';ctx.fillText('DEPARTURES',166,69);
  ctx.textAlign='right';ctx.font='28px monospace';ctx.fillStyle='#abc2c9';ctx.fillText('NEXUS  /  TERMINAL 01',1984,54);ctx.fillStyle='#e3e9df';ctx.fillText('21:27 UTC',1984,91);
  ctx.textAlign='left';ctx.font='23px Arial';ctx.fillStyle='#8ca6ae';
  for(const[label,x]of[['TIME',55],['FLIGHT',290],['DESTINATION',540],['GATE',1370],['REMARKS',1575]])ctx.fillText(label,x,151);
  for(let i=0;i<FLIGHTS.length;i++){
    const rowY=185+i*53;
    ctx.fillStyle=i%2?'#10242e':'#0c1e28';ctx.fillRect(24,rowY-22,2000,49);
    const[time,flight,destination,gate,status]=FLIGHTS[i];
    ctx.textAlign='left';ctx.font='32px monospace';ctx.fillStyle='#dbe3dc';ctx.fillText(time,55,rowY);ctx.fillStyle='#a8c0ca';ctx.fillText(flight,290,rowY);
    ctx.font='500 34px Arial';ctx.fillStyle='#e2e7df';ctx.fillText(destination,540,rowY);
    ctx.font='600 34px monospace';ctx.fillStyle='#e5cf8b';ctx.fillText(gate,1370,rowY);
    ctx.font='26px Arial';ctx.fillStyle=status==='BOARDING'?'#e2c66e':status==='GATE OPEN'?'#9dc8b6':'#a3babd';ctx.fillText(status,1575,rowY);
  }
  ctx.strokeStyle='#36505b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(40,516);ctx.lineTo(2008,516);ctx.stroke();
  ctx.fillStyle='#8faab2';ctx.font='22px Arial';ctx.fillText('Please have your boarding pass ready',55,540);ctx.textAlign='right';ctx.fillText('GATES A · WEST       GATES B · EAST',1984,540);
  // Subtle screen rows preserve a lit LCD appearance without a bloom rectangle.
  ctx.fillStyle='rgba(0,0,0,.045)';for(let y=20;y<548;y+=4)ctx.fillRect(20,y,2008,1);
  const notices=[
    ['gateA','GATE A','WEST CONCOURSE','up'],['gateB','GATE B','EAST CONCOURSE','up'],
    ['bridgeA','BOARDING A','A01 · A08','left'],['bridgeB','BOARDING B','B01 · B08','right'],
    ['security','SECURITY','BOARDING PASS CHECK','up'],['baggage','BAGGAGE','AUTHORIZED STAFF','left'],
    ['service','MAINTENANCE','AUTHORIZED STAFF','right'],['arrivals','ARRIVALS','TERMINAL ATRIUM','up']
  ];
  for(let i=0;i<notices.length;i++){
    const[key,heading,sub,arrow]=notices[i],x=(i%4)*512,y=584+Math.floor(i/4)*116;
    regions[key]=[x,y,512,96];ctx.fillStyle='#112631';ctx.fillRect(x,y,512,96);ctx.fillStyle='#bccdc9';ctx.fillRect(x+12,y+10,3,76);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#edf0e6';ctx.font='600 38px Arial';ctx.fillText(heading,x+36,y+36,405);
    ctx.font='16px Arial';ctx.fillStyle='#a6bdc4';ctx.fillText(sub,x+38,y+73,396);
    ctx.save();ctx.translate(x+474,y+45);ctx.rotate(arrow==='left'?-Math.PI/2:arrow==='right'?Math.PI/2:0);ctx.strokeStyle='#ebd496';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,20);ctx.lineTo(0,-15);ctx.moveTo(-11,-4);ctx.lineTo(0,-15);ctx.lineTo(11,-4);ctx.stroke();ctx.restore();
  }
  let noise=1943;const random=()=>{noise=(noise*1664525+1013904223)>>>0;return noise/4294967296;};
  for(const[key,label,x]of[['standWest','STAND W-01  /  MAX 12 t',0],['standEast','STAND E-01  /  MAX 12 t',1024]]){
    const y=840;regions[key]=[x,y,1024,84];ctx.textAlign='center';ctx.fillStyle='#c5bd9d';ctx.font='600 58px monospace';ctx.fillText(label,x+512,y+43,990);
    ctx.save();ctx.globalCompositeOperation='destination-out';for(let i=0;i<95;i++)ctx.fillRect(x+random()*1024,y+random()*84,1+random()*7,1+random()*3);ctx.restore();
  }
  regions.keepClear=[0,944,2048,80];ctx.textAlign='center';ctx.fillStyle='#c7bd96';ctx.font='600 57px monospace';ctx.fillText('KEEP CLEAR  /  GROUND CREW ACCESS',1024,986,1990);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return{texture,regions,width:logicalWidth,height:logicalHeight};
}

export function buildSkyportDetails(map,mats,{geo,box,beam,p,withFloor,ownedMaterials,mobile=false}){
  if(map.id!=='skyport')return null;
  const atlas=signageAtlas(mobile),surfaces=levelSurfaces(map),pixelScale=map.scale||.1;
  const own=material=>{ownedMaterials.add(material);return material;};
  const display=own(new THREE.MeshStandardMaterial({name:'Skyport LCD and wayfinding atlas',map:atlas.texture,roughness:.57,metalness:0,emissive:0xffffff,emissiveMap:atlas.texture,emissiveIntensity:.2,shadowSide:THREE.BackSide}));
  const stencil=own(new THREE.MeshStandardMaterial({name:'Skyport painted stand stencils',map:atlas.texture,roughness:.96,metalness:0,transparent:true,alphaTest:.12,opacity:.82,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,shadowSide:THREE.BackSide}));
  const paintYellow=own(new THREE.MeshStandardMaterial({name:'Skyport apron yellow paint',color:0xb7a45f,roughness:.96,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,shadowSide:THREE.BackSide}));
  const paintWhite=own(new THREE.MeshStandardMaterial({name:'Skyport apron white paint',color:0xc0c4b5,roughness:.94,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,shadowSide:THREE.BackSide}));
  const offset=(at,x,z,angle=0)=>[at[0]+(Math.cos(angle)*x+Math.sin(angle)*z)/pixelScale,at[1]+(-Math.sin(angle)*x+Math.cos(angle)*z)/pixelScale];
  let paintedSegments=0,panelCount=0;
  function atlasPlane(region,at,y,w,h,mat=display,angle=0,floor=false){
    const g=new THREE.PlaneGeometry(w,h),uv=g.attributes.uv,[rx,ry,rw,rh]=atlas.regions[region];
    for(let i=0;i<uv.count;i++)uv.setXY(i,(rx+2+uv.getX(i)*(rw-4))/atlas.width,1-(ry+2+(1-uv.getY(i))*(rh-4))/atlas.height);
    geo(g,mat,p(at,y),floor?[-Math.PI/2,0,angle]:[0,angle,0]);panelCount++;
  }
  function framedNotice(key,at,w=3.15,angle=0,height=2.95){
    withFloor(at,()=>{
      const body=offset(at,0,.405,angle);
      box(body,height,w+.13,.68,.12,mats.trainMetal,angle,false,'base',.025);
      box(offset(body,0,.066,angle),height,w+.045,.585,.022,mats.rubber,angle);
      atlasPlane(key,offset(body,0,.081,angle),height,w,.55,display,angle);
      for(const side of[-1,1])box(offset(body,side*(w/2+.025),.071,angle),height,.024,.48,.016,mats.metal,angle);
    });
  }
  // The old single-line board is replaced at exactly the same traced location
  // and envelope. Screen, gaskets and a wall-supported gantry add credible scale.
  const board=map.props.flightBoard.center;
  box(board,4.9,10.5,3,.35,mats.dark,0,false,'base',.055);
  box([board[0],board[1]+1.9],4.9,10.22,2.79,.035,mats.rubber,0,false,'base',.025);
  atlasPlane('board',[board[0],board[1]+2.2],4.91,10.05,2.65);
  for(const side of[-1,1]){
    box(offset(board,side*5.1,.19),4.9,.075,2.84,.035,mats.trainMetal);
    beam(p(offset(board,side*4.45,0),6.34),p(offset(board,side*4.45,0),7.4),.035,mats.metal,'roof');
  }
  for(const px of[484,780])box([px,board[1]],3.7,.26,7.4,.32,mats.trainMetal,0,false,'roof');
  for(const y of[7.35,7.65])box(board,y,29.6,.065,.38,mats.trainMetal,0,false,'roof');
  box(board,7.5,29.6,.3,.075,mats.dark,0,false,'roof');
  framedNotice('gateA',[392,412]);framedNotice('gateB',[872,412]);
  framedNotice('security',[632,334],3.65);
  framedNotice('baggage',[484,715],2.5,Math.PI/2);
  framedNotice('service',[780,715],2.5,-Math.PI/2);
  // Bridge uprights are on existing guardrail footprints, leaving the original
  // bridge walking envelope and its collision intact.
  for(const bridge of map.boardingBridges){
    const west=bridge.id==='boarding-a',at=bridge.terminalDoor,angle=west?Math.PI/2:-Math.PI/2;
    framedNotice(west?'bridgeA':'bridgeB',at,2.18,angle,4.1);
    withFloor(at,()=>{
      for(const side of[-1,1])box(offset(at,side*1.27,0,angle),2.22,.075,4.44,.075,mats.trainMetal,angle);
      box(at,4.48,2.7,.11,.13,mats.trainMetal,angle);
      for(const side of[-1,1])beam(p(offset(at,side*.89,.405,angle),4.42),p(offset(at,side*.89,0,angle),4.48),.025,mats.metal);
    });
  }
  // Paint is split into one-meter pieces and clipped to the actual lower deck,
  // including ramp cuts. No colored guide can float over a void or stairwell.
  function floorLine(a,b,width,material,surface){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)return;
    const steps=Math.max(1,Math.ceil(length*pixelScale)),nx=-dz/length*width/pixelScale*.55,nz=dx/length*width/pixelScale*.55;
    for(let i=0;i<steps;i++){
      const lo=i/steps,hi=(i+1)/steps,aa=[a[0]+dx*lo,a[1]+dz*lo],bb=[a[0]+dx*hi,a[1]+dz*hi];
      if(![aa,bb].every(v=>surfaceContains(surface,[v[0]+nx,v[1]+nz])&&surfaceContains(surface,[v[0]-nx,v[1]-nz])))continue;
      const center=[(aa[0]+bb[0])/2,(aa[1]+bb[1])/2],g=new THREE.PlaneGeometry(length/steps*pixelScale,width);
      geo(g,material,p(center,.027),[-Math.PI/2,0,-Math.atan2(dz,dx)]);paintedSegments++;
    }
  }
  for(const pad of map.dockingPads){
    const surface=surfaces.find(s=>s.id===pad.id);if(!surface)continue;
    withFloor(pad.center,()=>{
      const inset=pad.polygon.map(v=>[pad.center[0]+(v[0]-pad.center[0])*.9,pad.center[1]+(v[1]-pad.center[1])*.9]);
      for(let i=0;i<inset.length;i++)floorLine(inset[i],inset[(i+1)%inset.length],.065,paintYellow,surface);
      const at=pad.aircraft,halfX=67,halfZ=31;
      for(const sx of[-1,1])for(const sz of[-1,1]){
        const corner=[at[0]+sx*halfX,at[1]+sz*halfZ];
        floorLine(corner,[corner[0]-sx*17,corner[1]],.11,paintYellow,surface);
        floorLine(corner,[corner[0],corner[1]-sz*13],.11,paintYellow,surface);
      }
      const west=pad.id==='dock-west',approach=west?1:-1;
      floorLine(pad.access,[at[0]+approach*70,at[1]-25],.07,paintYellow,surface);
      floorLine([at[0]+approach*70,at[1]-25],[at[0]+approach*40,at[1]],.07,paintYellow,surface);
      floorLine([at[0]+approach*43,at[1]-11],[at[0]+approach*43,at[1]+11],.16,paintWhite,surface);
      for(let i=0;i<7;i++){
        const x=pad.center[0]-approach*87+i*4,z=pad.center[1]-47;
        floorLine([x,z],[x-15,z+31],.105,paintYellow,surface);
      }
      const label=[at[0],at[1]+22];
      if([[-27,-3],[27,-3],[27,3],[-27,3]].every(v=>surfaceContains(surface,[label[0]+v[0],label[1]+v[1]])))atlasPlane(west?'standWest':'standEast',label,.031,5.4,.44,stencil,0,true);
      // Edge lights and a folded steel fascia tie the painted apron to the
      // suspended platform. All additions remain inside/under its traced edge.
      for(let i=0;i<pad.polygon.length;i++){
        const a=pad.polygon[i],b=pad.polygon[(i+1)%pad.polygon.length],d=Math.hypot(b[0]-a[0],b[1]-a[1])*pixelScale;
        if(d<.35)continue;
        const center=[(a[0]+b[0])/2,(a[1]+b[1])/2],insetCenter=[pad.center[0]+(center[0]-pad.center[0])*.965,pad.center[1]+(center[1]-pad.center[1])*.965],angle=-Math.atan2(b[1]-a[1],b[0]-a[0]);
        box(insetCenter,-.34,d*.96,.48,.11,mats.dark,angle);
        box(insetCenter,-.09,d*.96,.075,.18,mats.trainMetal,angle);
        if(i%2===0){const at=[pad.center[0]+(center[0]-pad.center[0])*.9,pad.center[1]+(center[1]-pad.center[1])*.9];if(surfaceContains(surface,at)){box(at,.045,.23,.06,.15,mats.rubber,angle,false,'base',.018);box(at,.081,.11,.016,.055,mats.lampWarm,angle);}}
      }
    });
  }
  // Steel splice plates sit on existing dome rib intersections; the glazing
  // footprint, roof height and entrance clearances are unchanged.
  const dome=map.props.dome,rx=dome.radiusX*pixelScale,rz=dome.radiusZ*pixelScale;
  for(const y of[1.8,3.7,5.6,7.1])for(let i=0;i<24;i+=mobile?2:1){
    const angle=i/24*Math.PI*2,ratio=Math.sqrt(Math.max(0,1-((y-.25)/dome.height)**2)),at=[dome.floorCenter[0]+Math.cos(angle)*dome.radiusX*ratio,dome.floorCenter[1]+Math.sin(angle)*dome.radiusZ*ratio];
    const normal=new THREE.Vector3(Math.cos(angle)*ratio/rx,(y-.25)/(dome.height*dome.height),Math.sin(angle)*ratio/rz).normalize();
    const rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
    geo(new THREE.BoxGeometry(.16,.035,.16),mats.trainMetal,p(at,y+.015),[rotation.x,rotation.y,rotation.z]);
  }
  const island=map.props.ringSculpture.center,count=mobile?12:20;
  for(let i=0;i<count;i++){
    const a=i/count*Math.PI*2,at=[island[0]+Math.cos(a)*44.65,island[1]+Math.sin(a)*44.65],angle=Math.PI/2-a;
    box(at,.69,Math.PI*8.93/count*.78,.34,.035,mats.dark,angle);
    for(const x of[-.38,.38])box(offset(at,x,.026,angle),.69,.025,.28,.026,mats.trainMetal,angle);
    box(offset(at,0,.025,angle),1.14,.54,.025,.025,mats.lampWhite,angle);
  }
  return{paintedSegments,panelCount,materialsAdded:4,atlasSize:[atlas.texture.image.width,atlas.texture.image.height]};
}
