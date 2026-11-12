import * as THREE from 'three';
import {createShoreField} from '../rendering/naturalFields.js';

export function createOcean(map,mobile=false,skyHDR=null){
  const field=createShoreField(map,mobile?128:256),shore=new THREE.DataTexture(field.data,field.size,field.size,THREE.RedFormat);shore.minFilter=shore.magFilter=THREE.LinearFilter;shore.unpackAlignment=1;shore.needsUpdate=true;
  const uniforms={...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time:{value:0},night:{value:0},shoreField:{value:shore},shoreMin:{value:new THREE.Vector2(...field.min)},shoreSpan:{value:new THREE.Vector2(...field.span)},skyHDR:{value:skyHDR},hasSky:{value:!!skyHDR}};
  const material=new THREE.ShaderMaterial({uniforms,fog:true,vertexShader:`#include <fog_pars_vertex>
    uniform float time;varying vec3 waterWorld;varying vec3 waterNormal;void main(){vec3 p=position;vec2 q=vec2(p.x,-p.y);vec2 k1=vec2(.094,.036),k2=vec2(-.12,.135);float a=dot(q,k1)+time*.7,b=dot(q,k2)-time*.6;p.z=.28*sin(a)+.2*sin(b);vec2 derivative=.28*cos(a)*k1+.2*cos(b)*k2;waterNormal=normalize(vec3(-derivative.x,1.,-derivative.y));waterWorld=(modelMatrix*vec4(p,1.)).xyz;vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,fragmentShader:`#include <fog_pars_fragment>
    uniform float time;uniform float night;uniform sampler2D shoreField;uniform vec2 shoreMin;uniform vec2 shoreSpan;uniform sampler2D skyHDR;uniform bool hasSky;varying vec3 waterWorld;varying vec3 waterNormal;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
    void main(){vec2 p=waterWorld.xz;vec3 n=normalize(waterNormal+vec3(sin(p.x*2.1+p.y*.8+time)*.055,0.,cos(p.y*2.3-p.x*.7-time*.8)*.05));vec3 eye=normalize(cameraPosition-waterWorld),r=reflect(-eye,n);float fresnel=.025+.975*pow(1.-max(dot(n,eye),0.),5.);vec3 reflected=vec3(.27,.4,.51);if(hasSky){vec2 uv=vec2(atan(r.z,r.x)*.15915494+.5,asin(clamp(r.y,-1.,1.))*.31830989+.5);reflected=texture2D(skyHDR,uv).rgb*.7;}reflected*=mix(1.,.17,night);vec2 uv=(p-shoreMin)/shoreSpan;float distance=(texture2D(shoreField,clamp(uv,0.,1.)).r-.5)*40.;float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);vec3 deep=mix(vec3(.012,.075,.09),vec3(.009,.024,.043),night),shallow=mix(vec3(.055,.19,.18),deep,night);vec3 color=mix(mix(shallow,deep,smoothstep(2.,16.,distance)),reflected,fresnel*.78);float band=exp(-pow((distance-4.1)/2.4,2.))*inside;float breaking=smoothstep(.38,.78,noise(p*.9+time*.08)+sin(distance*3.-time*1.5)*.15);color=mix(color,mix(vec3(.63,.74,.73),vec3(.13,.23,.3),night),band*breaking*.82);gl_FragColor=vec4(color,1.);
    #include <fog_fragment>
    }`});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1100,1100,mobile?100:180,mobile?100:180),material);mesh.rotation.x=-Math.PI/2;mesh.position.y=-6.8;mesh.name='Coastline-aware ocean';
  return{mesh,update(t,night){uniforms.time.value=t;uniforms.night.value=night?1:0;},dispose(){mesh.geometry.dispose();material.dispose();shore.dispose();}};
}
