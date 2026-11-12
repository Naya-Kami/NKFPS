export const QUALITY_IDS=['performance','balanced','high','ultra'];

// Budgets apply to the offscreen render target, including Retina iPads.
// Texture upgrades are selective on mobile to avoid exhausting WebGL memory.
export function qualityProfile(id,mobile=false){
  const profiles={
    performance:{dpr:.9,maxPixels:1.3e6,shadow:1024,ao:0,samples:0,reflection:512,reflectionInterval:5,lights:6,bloom:false,hi:[]},
    balanced:{dpr:mobile?1.15:1.4,maxPixels:mobile?1.7e6:3e6,shadow:2048,ao:mobile?0:.5,samples:mobile?0:2,reflection:mobile?512:768,reflectionInterval:3,lights:12,bloom:true,hi:[]},
    high:{dpr:mobile?1.4:1.8,maxPixels:mobile?2e6:5e6,shadow:mobile?2048:4096,ao:mobile?.5:.75,samples:2,reflection:mobile?768:1024,reflectionInterval:mobile?2:1,lights:mobile?14:22,bloom:true,hi:mobile?['concrete']:['wall','concrete','rock','steel']},
    ultra:{dpr:mobile?1.7:2,maxPixels:mobile?2.6e6:8.3e6,shadow:mobile?2048:4096,ao:mobile?.65:1,samples:mobile?2:4,reflection:mobile?1024:2048,reflectionInterval:1,lights:mobile?18:32,bloom:true,hi:mobile?['concrete','wall']:['wall','concrete','rock','steel']}
  };
  return {...profiles[QUALITY_IDS.includes(id)?id:'balanced']};
}

export function renderPixelRatio(profile,width,height,deviceRatio=1){
  return Math.min(deviceRatio,profile.dpr,Math.sqrt(profile.maxPixels/Math.max(1,width*height)));
}
