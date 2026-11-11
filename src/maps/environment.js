import * as THREE from 'three';
export function buildEnvironment(map,mats,mobile){
  const group=new THREE.Group(),disposables=[],animate=[];
  const add=m=>{group.add(m);disposables.push(m);return m;};
  if(map.theme==='coastal'){
    const uniforms={time:{value:0},night:{value:0}};
    const ocean=new THREE.Mesh(new THREE.PlaneGeometry(1100,1100,mobile?100:180,mobile?100:180),new THREE.ShaderMaterial({uniforms,vertexShader:`uniform float time;varying vec3 vWorld;varying float vHeight;void main(){vec3 p=position;p.z+=sin(p.x*.11+time*.6)*.3+sin(p.y*.13-time*.45)*.25;vHeight=p.z;vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,fragmentShader:`uniform float time;uniform float night;varying vec3 vWorld;varying float vHeight;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}void main(){vec2 p=vWorld.xz;float a=sin(p.x*.8+p.y*.4+time),b=cos(p.y*1.4-p.x*.4-time*1.3);vec3 n=normalize(vec3(a*.16+b*.08,1.,b*.14));vec3 eye=normalize(cameraPosition-vWorld);float f=.03+.97*pow(1.-max(dot(n,eye),0.),4.);vec3 c=mix(vec3(.018,.09,.105),vec3(.27,.38,.42),f*.8);float edge=length(p/vec2(51.,62.));float shore=smoothstep(.8,1.,edge)*(1.-smoothstep(1.15,1.32,edge));float foam=smoothstep(.45,.73,noise(p*.7+time*.12)+sin(edge*60.-time*2.)*.13+vHeight*.1);c=mix(c,vec3(.52,.63,.63),shore*foam*.75);c*=mix(1.,.3,night);float fog=1.-exp(-length(cameraPosition-vWorld)*.0018);c=mix(c,mix(vec3(.28,.39,.44),vec3(.06,.12,.18),night),fog);gl_FragColor=vec4(c,1.);}`}));
    ocean.rotation.x=-Math.PI/2;ocean.position.y=-6.8;add(ocean);animate.push(t=>uniforms.time.value=t);
    const count=mobile?900:1800,positions=new Float32Array(count*6);for(let i=0;i<count;i++){const x=Math.random()*140-70,y=Math.random()*45,z=Math.random()*150-65;positions.set([x,y,z,x-.08,y-.6,z],i*6);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));const rain=add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xb9cbd1,transparent:true,opacity:.14,depthWrite:false})));
    let last=0;animate.push(t=>{const dt=Math.min(.1,t-last);last=t;const a=g.attributes.position.array;for(let i=0;i<count;i++){a[i*6+1]-=dt*13;a[i*6+4]-=dt*13;if(a[i*6+1]<-6){a[i*6+1]+=52;a[i*6+4]+=52;}}g.attributes.position.needsUpdate=true;});
    return{group,update(t,weather,night){rain.visible=weather;uniforms.night.value=night?1:0;animate.forEach(fn=>fn(t));},dispose};
  }
  if(map.theme==='sky'){
    const geo=new THREE.IcosahedronGeometry(1,2),mat=new THREE.MeshStandardMaterial({color:0xc8d9e3,roughness:1});const count=mobile?260:480;const clouds=new THREE.InstancedMesh(geo,mat,count);const matrix=new THREE.Matrix4();let seed=25;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<count;i++){const x=(rand()-.5)*360,z=(rand()-.5)*280,y=-21-rand()*28,s=7+rand()*16;matrix.compose(new THREE.Vector3(x,y,z),new THREE.Quaternion(),new THREE.Vector3(s,3+rand()*6,s));clouds.setMatrixAt(i,matrix);clouds.setColorAt(i,new THREE.Color().setHSL(.58,.12,.58+rand()*.28));}add(clouds);
    return{group,update(t){clouds.position.x=Math.sin(t*.006)*3;},dispose};
  }
  const outer=[[-120,-100],[120,-100],[120,100],[-120,100]],shape=new THREE.Shape();outer.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
  const hole=new THREE.Path();map.outer.forEach(([px,py],i)=>{const x=(px-map.origin[0])*.1,z=-(py-map.origin[1])*.1;i?hole.lineTo(x,z):hole.moveTo(x,z);});hole.closePath();shape.holes.push(hole);
  const rock=add(new THREE.Mesh(new THREE.ShapeGeometry(shape),mats.foundation));rock.rotation.x=-Math.PI/2;rock.position.y=-.7;
  return{group,update(){},dispose};
  function dispose(){for(const m of disposables){m.geometry?.dispose();m.material?.dispose();}}
}
