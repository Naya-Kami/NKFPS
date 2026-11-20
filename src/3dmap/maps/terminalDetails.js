import * as THREE from 'three';
import {levelSurfaces,surfaceContains,toWorld} from './atlas.js';

// These details use the existing platform floor and traced tracks. They never
// register collision or add an obstacle to a route. All dimensions are meters.
export function terminalPlatformEdges(map){
  if(map.id!=='terminal'||map.tracks.length<2)return[];
  const ordered=[...map.tracks].sort((a,b)=>a.rect[0]-b.rect[0]);
  return ordered.map((track,i)=>({
    id:i?'east':'west',number:String(i+1),side:i?1:-1,
    x:i?track.rect[0]+track.rect[2]:track.rect[0],
    start:track.rect[1]+1,end:track.rect[1]+track.rect[3]-1,
    centerX:i?735:532
  }));
}

function raisedStudGeometry(map,centers,y,radius=.022,height=.0045){
  const positions=[],segments=6;
  for(const at of centers){const [x,,z]=toWorld(map,at);
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      // Clockwise winding in X/Z keeps the little domed caps facing upward.
      positions.push(x,y+height,z,x+Math.cos(b)*radius,y,z+Math.sin(b)*radius,x+Math.cos(a)*radius,y,z+Math.sin(a)*radius);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));g.computeVertexNormals();return g;
}

export function addTerminalDetails(map,mats,h,{mobile=false}={}){
  if(map.id!=='terminal')return{studs:0,platforms:0};
  const {box,geo,p,beam,ownedMaterials}=h;
  const own=material=>{ownedMaterials?.add(material);return material;};
  const warning=own(new THREE.MeshStandardMaterial({color:0xc8ab5b,roughness:.88,metalness:0}));
  const warningAlt=own(new THREE.MeshStandardMaterial({color:0xbca25b,roughness:.9,metalness:0}));
  const panel=own(new THREE.MeshStandardMaterial({color:0x19272c,roughness:.7,metalness:.16}));
  const ground=levelSurfaces(map).find(s=>s.id==='ground'),edges=terminalPlatformEdges(map),studs=[];
  const onPlatform=at=>surfaceContains(ground,at);
  const roofBox=(at,y,w,height,d,mat=mats.metal)=>box(at,y,w,height,d,mat,0,false,'roof');
  const roofBeam=(a,b,r,mat=mats.metal)=>beam(p(a[0],a[1]),p(b[0],b[1]),r,mat,'roof');

  // Ceramic/rubber warning tiles and a narrow coping line are built beside the
  // passenger platforms, not on the train bed or the central maintenance lane.
  for(const edge of edges){
    const stripX=edge.x+edge.side*.4/map.scale;
    for(let start=edge.start,tile=0;start<edge.end;start+=.6/map.scale,tile++){
      const end=Math.min(start+.6/map.scale,edge.end),at=[stripX,(start+end)/2];
      const envelope=[at,[stripX-.225/map.scale,at[1]],[stripX+.225/map.scale,at[1]]];
      if(!envelope.every(onPlatform))continue;
      box(at,.0175,.45,.01,(end-start)*map.scale-.006,tile%7===0?warningAlt:warning);
      // The tile joints are real gaps, with no dark line suspended over a hole.
      box([edge.x+edge.side*.075/map.scale,at[1]],.022,.12,.02,(end-start)*map.scale-.003,mats.trainMetal);
      box([edge.x+edge.side*.16/map.scale,at[1]],.024,.055,.005,(end-start)*map.scale-.003,warning);
    }
    const rows=mobile?3:4,spacing=mobile?.22:.17;
    for(let py=edge.start+.04/map.scale;py<edge.end-.04/map.scale;py+=spacing/map.scale){
      for(let row=0;row<rows;row++){
        const x=stripX+((row-(rows-1)/2)*(mobile?.14:.105))/map.scale,at=[x,py];
        if(onPlatform(at))studs.push(at);
      }
    }
    // The vertical fascia is flush with the existing platform edge. Its shallow
    // seams make the platform thickness visible when looking from a train lane.
    const middle=(edge.start+edge.end)/2,run=(edge.end-edge.start)*map.scale;
    box([edge.x+edge.side*.015/map.scale,middle],-.22,.035,.44,run,mats.dark);
    for(let py=edge.start+1;py<edge.end;py+=1.2/map.scale){
      box([edge.x-edge.side*.006/map.scale,py],-.22,.015,.39,.018,mats.trainMetal);
    }
  }
  if(studs.length)geo(raisedStudGeometry(map,studs,.0225),warning);

  // Reusable printed sign faces are matte, unlit enamel. No giant floor card or
  // emissive billboard is introduced. Opposite faces give actual directions.
  const signFaces=new Map();
  function signMaterial(edge,direction){
    const key=edge.id+direction;if(signFaces.has(key))return signFaces.get(key);
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#17262b';ctx.fillRect(0,0,768,192);
    ctx.fillStyle='#c7af73';ctx.fillRect(0,0,96,192);ctx.fillStyle='#17262b';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 90px Arial';ctx.fillText(edge.number,48,99);
    ctx.textAlign='left';ctx.fillStyle='#e1e4db';ctx.font='bold 42px Arial';ctx.fillText(edge.id==='west'?'WEST PLATFORM':'EAST PLATFORM',122,64,617);
    ctx.fillStyle='#b7c6c4';ctx.font='24px Arial';ctx.fillText(direction==='north'?'NORTH TICKET HALL  ↑':'SOUTH TICKET HALL  ↑',123,119,615);
    ctx.fillStyle='#687c7f';ctx.fillRect(122,151,608,2);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const mat=own(new THREE.MeshStandardMaterial({map:texture,roughness:.75,metalness:.04}));signFaces.set(key,mat);return mat;
  }
  function signFace(at,y,w,height,material,back=false,numberOnly=false,layer='roof'){
    const plane=new THREE.PlaneGeometry(w,height);
    if(numberOnly){const uv=plane.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)*96/768);}
    geo(plane,material,p(at,y),[0,back?Math.PI:0,0],layer);
  }
  for(const edge of edges){
    for(const py of[390,758]){
      const at=[edge.centerX,py],y=4.05,w=2.95,height=.74;
      roofBox(at,y,w+.08,height+.07,.14,panel);
      roofBox(at,y-height/2-.045,w+.11,.045,.18,mats.trainMetal);
      signFace([at[0],at[1]+.8],y,w,height,signMaterial(edge,'north'));
      signFace([at[0],at[1]-.8],y,w,height,signMaterial(edge,'south'),true);
      for(const dx of[-w*.34,w*.34]){
        const anchor=[at[0]+dx/map.scale,at[1]];
        roofBeam([anchor,y+height/2],[anchor,6.22],.018,mats.trainMetal);
        roofBox(anchor,6.23,.18,.06,.18,mats.dark);
      }
    }
    // Matching plates give the existing columns a human-scale identity. Their
    // front/back placement stays inside the column's collision clearance.
    const columnX=edge.id==='west'?510:750;
    for(let py=320;py<840;py+=55){
      box([columnX,py],.16,.625,.22,.625,mats.trainMetal);
      for(const side of[-1,1]){
        const face=[columnX,py+side*3.1];
        signFace(face,1.55,.28,.46,signMaterial(edge,'north'),side<0,true,'base');
      }
    }
  }

  // The existing ticket-hall/site labels now have housings and supports. Their
  // text remains supplied by the map builder, so labels never duplicate here.
  for(const [at,y,w,height,ceiling]of[
    [[638,225],3.15,8,.9,4.2],[[638,890],3.15,8,.9,4.2],
    [[418,450],2.9,6,.8,4.1],[[895,470],2.9,6,.8,4.1]
  ]){
    roofBox([at[0],at[1]-.9],y,w+.16,height+.13,.14,panel);
    for(const dx of[-w*.39,w*.39]){
      const from=[at[0]+dx/map.scale,at[1]-.9];
      roofBeam([from,y+height/2],[from,ceiling],.016,mats.trainMetal);
    }
  }

  // Longitudinal girders, perforated cable trays and suspension hardware make a
  // believable closed station ceiling. Keeping them on 'roof' preserves the
  // source image's cutaway plan and leaves the traced platform bridge clear.
  for(const x of[498,554,712,772]){
    roofBox([x,574],6.16,.13,.24,54.2,mats.metal);
    for(let py=320;py<840;py+=55){
      roofBox([x,py],6.18,.3,.31,.12,mats.dark);
    }
  }
  for(const x of[550,718]){
    roofBox([x,574],5.94,.34,.055,53.6,mats.dark);
    for(const side of[-1,1])roofBox([x+side*1.7,574],5.99,.025,.13,53.6,mats.trainMetal);
    for(let py=313;py<839;py+=16){
      roofBox([x,py],5.925,.3,.025,.065,mats.trainMetal);
      if(Math.round((py-313)/16)%3===0){
        roofBeam([[x-2.3,py],5.96],[[x-2.3,py],6.26],.012,mats.trainMetal);
        roofBeam([[x+2.3,py],5.96],[[x+2.3,py],6.26],.012,mats.trainMetal);
        roofBox([x,py],5.92,.54,.04,.12,mats.metal);
      }
    }
    roofBeam([[x-.7,305],6.035],[[x-.7,842],6.035],.023,mats.rubber);
    roofBeam([[x+.6,305],6.035],[[x+.6,842],6.035],.017,mats.rubber);
    for(const py of[430,650,815])roofBox([x,py],5.89,.44,.18,.42,mats.metal);
  }
  for(let py=320;py<840;py+=55)for(const x of[510,750]){
    // End caps and a shallow reflector lip surround the existing 3.7 m opal
    // diffuser. They do not cover the light-emitting underside.
    roofBox([x,py],5.72,3.94,.14,.3,mats.trainMetal);
    for(const side of[-1,1])roofBox([x+side*19.1,py],5.59,.07,.17,.31,mats.dark);
    roofBox([x+12,py-1.2],5.76,.4,.18,.42,mats.dark);
    for(const dx of[-15,15])roofBeam([[x+dx,py],5.8],[[x+dx,py],6.27],.012,mats.trainMetal);
  }
  return{studs:studs.length,platforms:edges.length};
}
