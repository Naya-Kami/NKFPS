import * as THREE from 'three';

// The illustration marks the edges of a broad track lane. Keep its centerline,
// but use a 1.435 m gauge so the wheels sit underneath a human-scale carriage.
export function metroRailPositions(track){const center=track.railsX.reduce((a,b)=>a+b,0)/track.railsX.length;return[center-7.175,center+7.175];}

export function roundedTrainRoof(width,length,edge=2.45,top=2.9){
  const half=width/2,shape=new THREE.Shape();shape.moveTo(-half,edge);shape.quadraticCurveTo(-half*.72,top,0,top);shape.quadraticCurveTo(half*.72,top,half,edge);shape.lineTo(half-.075,edge-.045);shape.quadraticCurveTo(half*.7,top-.085,0,top-.085);shape.quadraticCurveTo(-half*.7,top-.085,-half+.075,edge-.045);shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false,curveSegments:16}).translate(0,0,-length/2);
}
export function buildMetroTrain(map,tr,m,h){
  const {box,geo,p,beam,text}=h,[x,z,w,d]=tr.rect,width=w*.1,carLength=d*.1/tr.cars,top=tr.y+tr.height,bottom=-.05;
  const track=map.tracks.find(t=>x+w/2>=t.rect[0]&&x+w/2<=t.rect[0]+t.rect[2]);
  for(let car=0;car<tr.cars;car++){
    const at=[x+w/2,z+(car+.5)*d/tr.cars],length=carLength-.25;
    // Collision stays at the traced car footprint. Closed doors/windows bound
    // an interior that is visible through real side openings.
    h.collider({kind:'box',x:p(at)[0],z:p(at)[2],w:width,d:length,angle:0,bottom,top});
    box(at,.15,width,.4,length,m.trainMetal,0,false,'base',.045);
    box(at,.36,width-.16,.08,length-.12,m.rubber);
    geo(roundedTrainRoof(width,length,top-.45,top),m.trainPaint,p(at));
    const bays=Math.max(3,Math.round(length/1.65)),bayLength=length/bays;
    for(const side of[-1,1]){
      const sideX=at[0]+side*(width/2-.04)*10;
      box([sideX,at[1]],.8,.08,.84,length,m.trainMetal);
      box([sideX,at[1]],top-.58,.08,.24,length,m.trainPaint);
      box([sideX+side*.3,at[1]],.56,.035,.16,length,m.trainStripe);
      for(let i=0;i<bays;i++){
        const center=at[1]+((i+.5)*bayLength-length/2)*10,door=i===1||i===bays-2,span=bayLength-.1;
        if(door){
          for(const sign of[-1,1]){const py=center+sign*span*2.5;box([sideX,py],1.3,.085,2.12,span*.49,m.trainPaint,0,false,'base',.025);box([sideX+side*.65,py],1.83,.02,.6,Math.min(.36,span*.36),m.windowDark);}
          box([sideX+side*.6,center],1.28,.035,2.08,.026,m.rubber);
        }else{
          const windowBottom=1.24,windowTop=top-.72,windowHeight=windowTop-windowBottom;
          for(const yy of[windowBottom,windowTop])box([sideX+side*.4,center],yy,.09,.055,span,m.rubber);
          for(const py of[center-span*5,center+span*5])box([sideX+side*.4,py],(windowBottom+windowTop)/2,.09,windowHeight,.06,m.rubber);
          const pane=new THREE.PlaneGeometry(span-.1,windowHeight-.055);geo(pane,m.glass,p([sideX-side*.1,center],(windowBottom+windowTop)/2),[0,side*Math.PI/2,0]);
          box([sideX,center+bayLength*5],1.8,.1,1.55,.09,m.trainPaint);
        }
      }
      // Human-scale seats and grab poles make the glazing read as a window.
      box([at[0]+side*(width/2-.48)*10,at[1]],.76,.6,.15,length-.8,m.seat);
      box([at[0]+side*(width/2-.72)*10,at[1]],1.03,.08,.44,length-.8,m.seat);
    }
    for(let py=at[1]-length*4;py<at[1]+length*4;py+=24)beam(p([at[0]+width*2,py],.42),p([at[0]+width*2,py],top-.45),.022,m.trainMetal);
    box(at,top-.36,.12,.055,length-.7,m.lampWhite);
    for(const py of[at[1]-carLength*3,at[1]+carLength*3]){
      const rails=track?metroRailPositions(track):[at[0]-7.175,at[0]+7.175];
      for(const railX of rails)geo(new THREE.CylinderGeometry(.24,.24,.16,16).rotateZ(Math.PI/2),m.rubber,p([railX,py],-.61));
      beam(p([rails[0],py],-.61),p([rails[1],py],-.61),.055,m.trainMetal);
      box([at[0],py],-.32,width*.68,.36,.85,m.trainMetal,0,false,'base',.04);
      for(const side of[-1,1])box([at[0]+side*width*2.6,py],-.38,.16,.18,.72,m.rubber);
    }
    for(const py of[at[1]-length*5,at[1]+length*5]){box([at[0],py],1.25,width-.12,2.6,.07,m.trainPaint,0,false,'base',.03);box([at[0],py],.02,width*.65,.14,.17,m.rubber);}
    if(car<tr.cars-1){const py=at[1]+carLength*5;for(let i=0;i<5;i++)box([at[0],py+(i-2)*.42],1.35,width*.56,2.35,.025,m.rubber);}
  }
  const nose=[x+w/2,tr.frontPixelY],front=tr.frontPixelY>z+d/2?1:-1;
  box([nose[0],nose[1]+front*.8],2.01,width*.68,.74,.035,m.windowDark,0,false,'base',.05);
  box([nose[0],nose[1]+front*1.1],2.02,.045,.7,.02,m.trainMetal);
  for(const side of[-1,1]){box([nose[0]+side*w*.3,nose[1]+front],.8,.23,.18,.08,m.lampWarm,0,false,'base',.025);beam(p([nose[0]+side*w*.15,nose[1]+front*1.4],1.7),p([nose[0]+side*w*.06,nose[1]+front*1.4],2.05),.012,m.rubber);}
  text('04 / TERMINAL',[nose[0],nose[1]+front*1.4],2.58,width*.5,.2,'#d9d3b1','#1c2426',false,front<0?Math.PI:0);
}
