// Check each delivery against its source rig and unmodified animation keyframes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const variants = new URL('../../assets/characters/variants/', import.meta.url);
const read = (version,name) => readFileSync(new URL(version+'/'+name,variants));
const manifest = (version) => JSON.parse(read(version,'models.json')).models;
const source = manifest('female_everyday');
const field = manifest('female_field');

function parse(bytes) {
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const end = 20 + bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.toString('utf8',20,end)), bin: bytes.subarray(end+8) };
}
function values(file, i) {
  const a = file.json.accessors[i];
  const view = file.json.bufferViews[a.bufferView];
  const n = { SCALAR:1,VEC3:3,VEC4:4,MAT4:16 }[a.type];
  assert.equal(a.componentType,5126);
  const stride = view.byteStride || n*4;
  const offset = (view.byteOffset || 0)+(a.byteOffset || 0);
  if (stride === n*4) return file.bin.subarray(offset,offset+a.count*n*4);
  return Buffer.concat(Array.from({length:a.count},(_,j) => file.bin.subarray(offset+j*stride,offset+j*stride+n*4)));
}
function compareRig(a,b) {
  assert.equal(b.json.skins.length,1);
  const joints = (f) => f.json.skins[0].joints.map(i => f.json.nodes[i].name);
  assert.deepEqual(joints(a),joints(b));
  assert.deepEqual(values(a,a.json.skins[0].inverseBindMatrices),values(b,b.json.skins[0].inverseBindMatrices));
  assert.deepEqual(a.json.animations.map(a => a.name),b.json.animations.map(a => a.name));
  for (const [i,anim] of a.json.animations.entries()) {
    const clip = b.json.animations[i];
    assert.equal(anim.channels.length,clip.channels.length);
    for (const [j,channel] of anim.channels.entries()) {
      const next = clip.channels[j];
      assert.equal(a.json.nodes[channel.target.node].name,b.json.nodes[next.target.node].name);
      assert.equal(channel.target.path,next.target.path);
      const old = anim.samplers[channel.sampler], updated = clip.samplers[next.sampler];
      assert.equal(old.interpolation,updated.interpolation);
      for (const k of ['input','output']) assert.deepEqual(values(a,old[k]),values(b,updated[k]));
    }
  }
}
assert.deepEqual(field.map(m => m.file).sort(),source.map(m => m.file).sort());
for (const model of field) {
  const bytes = read('female_field',model.file);
  assert.equal(bytes.length,model.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256);
  const before = parse(read('female_everyday',model.file)), after = parse(bytes);
  compareRig(before,after);
  assert.ok(after.json.images.every(im => im.uri === undefined && im.bufferView !== undefined));
  assert.ok(after.json.nodes.filter(n => n.mesh !== undefined).every(n => n.skin === 0));
  const triangles = after.json.meshes.flatMap(m => m.primitives).reduce((sum,p) => sum+after.json.accessors[p.indices].count/3,0);
  console.log(model.character,model.file,triangles.toLocaleString('en-US')+' triangles');
}
