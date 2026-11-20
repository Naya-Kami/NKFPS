// The geometry tests exercise CanvasTexture-backed models without a browser.
// These drawing operations are inert; no test treats this as a visual render.
export function createCanvasDocument(){
  return{createElement(){
    const noop=()=>{},context={
      fillRect:noop,fillText:noop,clearRect:noop,strokeRect:noop,
      save:noop,restore:noop,scale:noop,translate:noop,rotate:noop,
      beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,arc:noop,
      fill:noop,stroke:noop,
      createRadialGradient(){return{addColorStop:noop};}
    };
    return{width:0,height:0,getContext(){return context;}};
  }};
}
