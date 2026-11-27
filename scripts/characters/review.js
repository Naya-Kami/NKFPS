import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { prepareRig } from './poses.js';

const canvas = document.querySelector('canvas');
const status = document.querySelector('#status');
const [character, variant, pose, view, expression] = document.querySelectorAll('select');
const assets = '/assets/characters/variants/';
const loader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,24);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.minZoom = .6;
controls.maxZoom = 4;
const generator = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = generator.fromScene(room,.04).texture;
scene.environmentIntensity = .4;
generator.dispose();
room.dispose();
scene.add(new THREE.HemisphereLight(0xf9f6ef, 0xaeacb4,.85));
for (const [x,y,z,color,power] of [[-2,3,4,0xfff0dc,2.5],[2,1,2,0xe3edff,1.05],[1.7,2,-3,0xfff7df,2.1]]) {
  const light = new THREE.DirectionalLight(color,power);
  light.position.set(x,y,z);
  scene.add(light);
}

let subject, rig, mixer, idle, footMeshes, span = 1.88, request = 0, dirty = true;
function invalidate() { dirty = true; }
const renderSize = new THREE.Vector2();
function resize() {
  const { width, height } = canvas.parentElement.getBoundingClientRect();
  if (!height || !width) return;
  renderer.getSize(renderSize);
  if (renderSize.x !== Math.round(width) || renderSize.y !== Math.round(height)) {
    renderer.setSize(Math.round(width),Math.round(height),false);
  }
  camera.top = span/2;
  camera.bottom = -camera.top;
  camera.right = span * width/height/2;
  camera.left = -camera.right;
  camera.updateProjectionMatrix();
  invalidate();
}
new ResizeObserver(resize).observe(canvas.parentElement);
controls.addEventListener('change', invalidate);
function frame() {
  if (!rig) return;
  const head = rig.bone('head').getWorldPosition(new THREE.Vector3());
  const face = ['face','portrait','profile'].includes(view.value);
  const degrees = { front:0, three:28, side:90, rear:145, face:0, portrait:28, profile:90 };
  const angle = THREE.MathUtils.degToRad(degrees[view.value]);
  span = face ? .35 : 1.89;
  controls.target.set(face ? head.x : 0, face ? head.y+.027 : (head.y+.15)/2, face ? head.z+.01 : .045);
  camera.position.copy(controls.target).add(new THREE.Vector3(4*Math.sin(angle),face?.03:.10,4*Math.cos(angle)));
  camera.zoom = 1;
  controls.update();
  resize();
}
function applyPose() {
  if (!subject) return;
  mixer.stopAllAction();
  subject.position.y = 0;
  rig.pose(pose.value);
  expression.disabled = pose.value === 'idle';
  if (expression.disabled) idle.play();
  else rig.expression(expression.value);
  let floor = Infinity;
  for (const shoe of footMeshes) {
    shoe.computeBoundingBox();
    floor = Math.min(floor,shoe.boundingBox.min.y);
  }
  if (Number.isFinite(floor)) subject.position.y = -floor;
  subject.updateMatrixWorld(true);
  frame();
}
function dispose(model) {
  const geometry = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    geometry.add(o.geometry);
    if (o.skeleton) skeletons.add(o.skeleton);
    for (const m of [].concat(o.material)) {
      materials.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  for (const object of [...skeletons,...geometry,...materials,...textures]) object.dispose();
  for (const texture of textures) texture.source.data?.close?.();
}
async function load() {
  const ticket = ++request;
  status.textContent = '読み込み中…';
  try {
    const gltf = await loader.loadAsync(assets+variant.value+'/'+character.value);
    if (ticket !== request) { dispose(gltf.scene); return; }
    if (subject) {
      mixer.stopAllAction();
      mixer.uncacheRoot(subject);
      scene.remove(subject);
      dispose(subject);
    }
    subject = gltf.scene;
    scene.add(subject);
    rig = prepareRig(subject);
    footMeshes = [];
    subject.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        if (/footwear|boot|sneaker|pump|loafer/i.test(o.name)) footMeshes.push(o);
      }
    });
    mixer = new THREE.AnimationMixer(subject);
    idle = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations,'Idle'));
    applyPose();
    status.textContent = '';
  } catch (error) {
    if (ticket === request) status.textContent = '読み込みに失敗しました。ページを再読み込みしてください。';
    console.error(error);
  }
}
pose.addEventListener('change',applyPose);
expression.addEventListener('change',applyPose);
view.addEventListener('change',frame);
variant.addEventListener('change',load);
character.addEventListener('change',load);
let previous = performance.now();
renderer.setAnimationLoop((now) => {
  if (mixer && pose.value === 'idle') {
    mixer.update(Math.min((now-previous)/1000,.1));
    invalidate();
  }
  if (dirty) {
    renderer.render(scene,camera);
    dirty = false;
  }
  previous = now;
});

try {
  const response = await fetch(assets+'female_field/models.json');
  if (!response.ok) throw new Error('Model manifest '+response.status);
  const { models } = await response.json();
  for (const model of models) character.add(new Option(model.character,model.file));
  await load();
} catch (error) {
  status.textContent = 'モデル一覧を読み込めませんでした。';
  console.error(error);
}
