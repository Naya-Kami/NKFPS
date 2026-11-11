import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MAPS,toWorld} from '../src/maps/atlas.js';
import {headingDegrees,mapViewport,playerTransform,tacticalSVG} from '../src/ui/minimap.js';
import {qualityProfile,renderPixelRatio,QUALITY_IDS} from '../src/rendering/quality.js';

test('compass and map arrow agree with the FPS camera, including west and wraparound',()=>{
  assert.equal(headingDegrees(0),0);assert.equal(headingDegrees(Math.PI/2),270);assert.equal(headingDegrees(-Math.PI/2),90);assert.equal(headingDegrees(3*Math.PI),180);
});
for(const map of Object.values(MAPS)){
  test(`${map.id}: minimap follows actual world positions and retains the reference frame`,()=>{
    for(const anchor of Object.values(map.anchors)){
      const[x,,z]=toWorld(map,anchor),box=mapViewport(map,x,z,'local');
      assert.ok(Math.abs(box[0]+box[2]/2-anchor[0])<1e-8);assert.ok(Math.abs(box[1]+box[3]/2-anchor[1])<1e-8);assert.equal(box[2]*map.scale,40);
      const transform=playerTransform(map,x,z,Math.PI/2,box);assert.match(transform,/rotate\(270\)/);assert.doesNotMatch(transform,/NaN|undefined/);
    }
    const[l,t,w,h]=mapViewport(map,0,0,'full');for(const p of map.outer)assert.ok(p[0]>=l&&p[0]<=l+w&&p[1]>=t&&p[1]<=t+h);
    const svg=tacticalSVG(map,{detailed:true});assert.ok(svg.includes('data-map-player'));assert.doesNotMatch(svg,/NaN|undefined/);
    for(const p of map.poi.filter(p=>['site-a','site-b','attacker','defender'].includes(p.id)))assert.ok(svg.includes(`translate(${p.at.join(' ')})`));
  });
}
test('Retina rendering obeys the pixel budget at phone, iPad and desktop sizes',()=>{
  for(const mobile of[false,true])for(const q of QUALITY_IDS){const p=qualityProfile(q,mobile);
    for(const[w,h,dpr]of[[390,844,3],[1024,1366,2],[1366,1024,2],[3840,2160,2]]){const r=renderPixelRatio(p,w,h,dpr);assert.ok(w*h*r*r<=p.maxPixels+1);assert.ok(r<=dpr&&r<=p.dpr);}
  }
  const mobileHigh=qualityProfile('high',true),mobileUltra=qualityProfile('ultra',true),desktopUltra=qualityProfile('ultra');
  assert.ok(mobileUltra.maxPixels>mobileHigh.maxPixels);assert.ok(mobileUltra.reflection>mobileHigh.reflection);assert.ok(mobileUltra.ao>mobileHigh.ao);
  assert.deepEqual(mobileHigh.hi,['concrete']);assert.deepEqual(mobileUltra.hi,['concrete','wall']);assert.equal(desktopUltra.hi.length,4);assert.equal(qualityProfile('performance').ao,0);
});
test('all selected 2K maps are bundled and match recorded CC0 source hashes',()=>{
  const root=new URL('../public/assets/pbr/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('sources.json',root)));
  for(const name of qualityProfile('ultra').hi)for(const channel of['color','normal','roughness']){
    const file=`hi/${name}-${channel}.webp`,entry=manifest.files[file],bytes=readFileSync(new URL(file,root));
    assert.equal(entry.license,'CC0-1.0');assert.equal(Math.max(entry.width,entry.height),2048);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(bytes.toString('ascii',8,12),'WEBP');
  }
});
