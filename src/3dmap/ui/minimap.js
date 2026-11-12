import {toPixel,wallSegments,levelSurfaces} from '../maps/atlas.js';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const points=poly=>poly.map(p=>p.join(',')).join(' ');
export const headingDegrees=yaw=>((-yaw*180/Math.PI)%360+360)%360;
export function mapViewport(map,x,z,mode='local'){
  if(mode==='full'){const[l,t,r,b]=map.frame;return[l-12,t-12,r-l+24,b-t+24];}
  const[px,py]=toPixel(map,x,z);return[px-200,py-200,400,400];
}
export function playerTransform(map,x,z,yaw,viewBox){
  const[px,py]=toPixel(map,x,z),size=Math.max(viewBox[2],viewBox[3])/400;
  return `translate(${px} ${py}) rotate(${headingDegrees(yaw)}) scale(${size})`;
}
export function tacticalSVG(map,{detailed=false}={}){
  const[l,t,r,b]=map.frame,span=Math.max(r-l,b-t),marker=detailed?span/730:2.1;
  const polygon=(p,cls)=>`<polygon class="${cls}" points="${points(p)}"/>`;
  const floors=[...map.additionalFloors,...map.bridges];
  const sites=map.poi.filter(p=>['site-a','site-b','attacker','defender'].includes(p.id));
  return `<svg xmlns="http://www.w3.org/2000/svg" class="tactical-svg" viewBox="${l-12} ${t-12} ${r-l+24} ${b-t+24}" role="img" aria-label="${esc(map.title)}のマップと現在位置">
    <defs><pattern id="grid-${map.id}-${detailed?'large':'small'}" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#aac8ca" stroke-opacity=".07" stroke-width="1"/></pattern></defs>
    <rect x="${l-1500}" y="${t-1500}" width="${r-l+3000}" height="${b-t+3000}" fill="#0a1920"/>
    <rect x="${l-1500}" y="${t-1500}" width="${r-l+3000}" height="${b-t+3000}" fill="url(#grid-${map.id}-${detailed?'large':'small'})"/>
    ${polygon(map.outer,'tactical-floor')}${map.rooms.map(p=>polygon(p.polygon,'tactical-room')).join('')}
    ${[...map.floorHoles,...levelSurfaces(map)[0].cuts].map(p=>polygon(p,'tactical-hole')).join('')}
    ${(map.tracks||[]).map(p=>p.polygon?polygon(p.polygon,'tactical-track'):p.rect?`<rect class="tactical-track" x="${p.rect[0]}" y="${p.rect[1]}" width="${p.rect[2]}" height="${p.rect[3]}"/>`:'').join('')}
    ${(map.trains||[]).map(p=>`<rect class="tactical-train" x="${p.rect[0]}" y="${p.rect[1]}" width="${p.rect[2]}" height="${p.rect[3]}" rx="8"/>`).join('')}
    ${floors.map(p=>polygon(p.polygon,'tactical-elevated')).join('')}
    ${map.stairs.map(p=>`<path class="tactical-stair" d="M${p.from.join(' ')}L${p.to.join(' ')}" stroke-width="${p.width}"/>`).join('')}
    <g class="tactical-walls">${wallSegments(map).map(s=>`<path d="M${s.a.join(' ')}L${s.b.join(' ')}" stroke-width="${Math.max(3,s.thickness*10)}"/>`).join('')}</g>
    ${sites.map(p=>`<g transform="translate(${p.at.join(' ')}) scale(${marker})"><rect x="-10" y="-10" width="20" height="20" rx="3" fill="${p.id==='defender'?'#548eb3':p.id==='attacker'?'#b87566':'#bd8d54'}"/><text x="0" y="4" text-anchor="middle" font-size="12" font-family="sans-serif" font-weight="700" fill="#fff">${p.id==='site-a'?'A':p.id==='site-b'?'B':p.id==='defender'?'D':'S'}</text></g>`).join('')}
    ${detailed?map.labels.filter(p=>!sites.some(s=>s.id===p.id)).map(p=>`<text class="tactical-label" x="${p.at[0]}" y="${p.at[1]}" style="font-size:${span/85}px">${esc(p.text.replaceAll(' / ',' · '))}</text>`).join(''):''}
    <g data-map-player class="tactical-player"><path class="tactical-cone" d="M0 0L-47 -83A95 95 0 0 1 47 -83Z"/><circle r="12" fill="#0a2029" stroke="#e9f2dd" stroke-width="1.5"/><path d="M0 -10L7 7L0 3L-7 7Z" fill="#e9f2dd"/></g>
  </svg>`;
}

export function mountMiniMap(container,map,mode='local'){
  container.innerHTML=tacticalSVG(map);const svg=container.querySelector('svg'),player=svg.querySelector('[data-map-player]');
  return{update(x,z,yaw,nextMode=mode){const box=mapViewport(map,x,z,nextMode);svg.setAttribute('viewBox',box.join(' '));player.setAttribute('transform',playerTransform(map,x,z,yaw,box));},svg};
}
