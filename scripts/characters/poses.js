// Art-review poses in model space (+Y up, +Z forward). They exercise the existing rig.
import { Quaternion, Vector3 } from 'three';

const poses = {
  stand: { lean: 0, legs: [[.10,-1,.02],[.08,-1,-.05],[-.08,-1,-.14],[-.08,-1,.02]],
    arms: [[.29,-1,-.02],[.04,-1,.22],[-.30,-1,.03],[-.05,-1,.21]] },
  run: { lean: 12, legs: [[.09,-.46,.88],[.05,-.82,-.56],[-.12,-.70,-.72],[.02,-.34,-.94]],
    arms: [[.18,-.76,-.65],[-.17,-.22,.84],[-.18,-.60,.78],[.25,.46,.82]] },
  crouch: { lean: 21, legs: [[.29,-.38,.88],[.03,-.83,-.55],[-.38,-.54,.76],[-.04,-.93,-.36]],
    arms: [[.27,-.71,.64],[-.27,.03,.94],[-.38,-.68,.57],[.21,.04,.93]] },
  slide: { lean: -9, legs: [[.25,-.34,.91],[.12,-.27,.96],[-.50,-.27,.83],[-.31,-.49,-.81]],
    arms: [[.68,-.65,-.3],[.56,-.53,.62],[-.48,-.79,.41],[.33,.08,.94]] },
  wall: { lean: 11, legs: [[.51,-.1,.86],[.20,-.93,-.30],[-.12,-.89,-.43],[-.13,-.67,-.73]],
    arms: [[.82,.47,.24],[.53,.57,.62],[-.50,-.74,.45],[.23,.48,.85]] },
  aim: { lean: 6, legs: [[.21,-.96,.18],[.07,-.98,-.14],[-.15,-.94,-.30],[-.12,-.97,-.18]],
    arms: [[.33,-.48,.81],[-.44,.48,.76],[-.54,-.33,.77],[.58,.27,.77]] },
  reload: { lean: 4, legs: [[.17,-.98,.09],[.07,-1,-.08],[-.16,-.97,-.20],[-.07,-.99,-.12]],
    arms: [[.26,-.83,.49],[-.47,.20,.86],[-.38,-.54,.75],[.50,.77,.40]] },
};

const worldPosition = (node) => node.getWorldPosition(new Vector3());
const worldRotation = (node) => node.getWorldQuaternion(new Quaternion());

export function prepareRig(model) {
  const bones = new Map();
  const rest = [];
  model.traverse((node) => {
    if (!node.isBone) return;
    bones.set(node.userData.name || node.name, node);
    rest.push([node, node.position.clone(), node.quaternion.clone(), node.scale.clone()]);
  });
  function bone(name) {
    const result = bones.get(name) || bones.get(name.replaceAll('.', ''));
    if (!result) throw new Error('Rig is missing ' + name);
    return result;
  }
  function rotateWorld(node, delta) {
    const desired = delta.multiply(worldRotation(node));
    node.quaternion.copy(worldRotation(node.parent).invert().multiply(desired));
    node.updateWorldMatrix(false, true);
  }
  function direct(start, end, vector) {
    const node = bone(start);
    const line = worldPosition(bone(end)).sub(worldPosition(node)).normalize();
    rotateWorld(node, new Quaternion().setFromUnitVectors(line, new Vector3(...vector).normalize()));
  }
  function reset() {
    for (const [node, p, q, s] of rest) {
      node.position.copy(p);
      node.quaternion.copy(q);
      node.scale.copy(s);
    }
    model.updateMatrixWorld(true);
  }
  const headRest = worldRotation(bone('head')).invert();
  function expression(name) {
    if (!['smile','focus'].includes(name)) return;
    const headTurn = worldRotation(bone('head')).multiply(headRest);
    function move(name, offset) {
      const node = bone(name);
      const delta = new Vector3(...offset).applyQuaternion(headTurn).applyQuaternion(worldRotation(node.parent).invert());
      node.position.add(delta);
      node.updateWorldMatrix(false, true);
    }
    for (const [side,sign] of [['.L',1],['.R',-1]]) {
      if (name === 'smile') {
        move('levator05'+side,[sign*.0025,.0040,-.0008]);
        move('oris03'+side,[sign*.0014,.0018,0]);
        move('risorius03'+side,[sign*.0018,.0026,.0013]);
      } else {
        move('oculi01'+side,[-sign*.0020,-.0028,.0008]);
        move('levator05'+side,[-sign*.0006,-.0007,0]);
      }
    }
  }
  function pose(name) {
    reset();
    if (!poses[name]) return;
    const config = poses[name];
    const pitch = new Quaternion().setFromAxisAngle(new Vector3(1,0,0), config.lean * Math.PI / 180);
    rotateWorld(bone('spine04'), pitch);
    for (const [i, side] of ['.L','.R'].entries()) {
      const forward = worldPosition(bone('toe3-1'+side)).sub(worldPosition(bone('foot'+side))).normalize();
      direct('upperleg01'+side, 'lowerleg01'+side, config.legs[i*2]);
      direct('lowerleg01'+side, 'foot'+side, config.legs[i*2+1]);
      direct('foot'+side,'toe3-1'+side,forward.toArray());
      direct('upperarm01'+side,'lowerarm01'+side, config.arms[i*2]);
      direct('lowerarm01'+side,'wrist'+side, config.arms[i*2+1]);
    }
  }
  return { bone, pose, expression };
}
