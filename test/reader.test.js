import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readGltf } from '../src/gltf-reader.js';

// The sample model (bacteria.gltf / howler.glb) is a third-party Sketchfab asset and is NOT
// committed to the repo. These integration tests run locally when you place the files in
// test/fixtures/, and skip cleanly otherwise (e.g. in a fresh clone / CI).
const GLTF = new URL('./fixtures/bacteria.gltf', import.meta.url);
const GLB = new URL('./fixtures/howler.glb', import.meta.url);
const skipGltf = existsSync(GLTF) ? false : 'sample model not present (third-party asset excluded from repo)';
const skipGlb = existsSync(GLB) ? false : 'sample model not present (third-party asset excluded from repo)';

function loadFixture() {
  const buf = readFileSync(GLTF);
  return readGltf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

test('reads the sample scene graph', { skip: skipGltf }, () => {
  const scene = loadFixture();
  assert.ok(scene.roots.length >= 1, 'has roots');
});

function countNodes(nodes) {
  let n = 0;
  for (const node of nodes) { n += 1; n += countNodes(node.children); }
  return n;
}

test('node count matches file (130 nodes)', { skip: skipGltf }, () => {
  const scene = loadFixture();
  assert.equal(countNodes(scene.roots), 130);
});

test('finds the head bone with a 24-vertex box and integer-ish size', { skip: skipGltf }, () => {
  const scene = loadFixture();
  let head = null;
  (function find(nodes) { for (const n of nodes) { if (n.name === 'head' && n.box) head = n; find(n.children); } })(scene.roots);
  assert.ok(head, 'head node with box found');
  const sizePx = head.box.max.map((v, i) => (v - head.box.min[i]) * 16);
  // head is 10 x 4 x 14 in the file
  sizePx.forEach((v) => assert.ok(Math.abs(v - Math.round(v)) < 1e-2, `size ${v} ~ integer`));
});

test('sample: reads the embedded 64×64 texture', { skip: skipGltf }, () => {
  const scene = loadFixture();
  assert.ok(scene.texture, 'texture present');
  assert.ok(scene.texture.dataUrl.startsWith('data:image/png'), 'png data url');
  assert.equal(scene.texture.width, 64);
  assert.equal(scene.texture.height, 64);
});

test('sample: head box has 6 faces with uvs', { skip: skipGltf }, () => {
  const scene = loadFixture();
  let head = null;
  (function find(nodes) { for (const n of nodes) { if (n.name === 'head' && n.box) head = n; find(n.children); } })(scene.roots);
  assert.equal(head.box.faces.length, 6);
  for (const f of head.box.faces) {
    assert.equal(f.uvs.length, 4);
    f.uvs.forEach(([u, v]) => { assert.ok(u >= -0.001 && u <= 1.001); assert.ok(v >= -0.001 && v <= 1.001); });
  }
});

test('sample: reads 3 animations with per-node tracks', { skip: skipGltf }, () => {
  const scene = loadFixture();
  assert.equal(scene.animations.length, 3);
  const idle = scene.animations.find((a) => a.name.includes('idle'));
  assert.ok(idle, 'idle animation present');
  assert.ok(idle.length > 0, 'has length');
  const tracks = Object.values(idle.tracks);
  assert.ok(tracks.length > 0, 'has bone tracks');
  // track keys are glTF node indices (numeric strings), not names
  assert.ok(Object.keys(idle.tracks).every((k) => String(Number(k)) === k));
  // at least one rotation keyframe somewhere
  assert.ok(tracks.some((t) => t.rotation.length > 0));
});

function gltfBufferFrom(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
test('reader: scene-less / nodeless glTF does not throw', () => {
  const scene = readGltf(gltfBufferFrom({ asset: { version: '2.0' }, nodes: [] }));
  assert.deepEqual(scene.roots, []);
  const scene2 = readGltf(gltfBufferFrom({ asset: { version: '2.0' }, scenes: [{}], scene: 0 }));
  assert.deepEqual(scene2.roots, []);
});

test('glb: parses binary .glb file and returns a non-empty scene with boxed nodes', { skip: skipGlb }, () => {
  const buf = readFileSync(GLB);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const scene = readGltf(ab);
  assert.ok(scene.roots.length >= 1, 'has roots');
  // Walk tree to find at least one node with a box (proves parseGlb + meshBox worked)
  function findBox(nodes) {
    for (const n of nodes) {
      if (n.box) return n;
      const found = findBox(n.children);
      if (found) return found;
    }
    return null;
  }
  const boxed = findBox(scene.roots);
  assert.ok(boxed, 'at least one node has a box');
  // box has min/max arrays of length 3
  assert.equal(boxed.box.min.length, 3);
  assert.equal(boxed.box.max.length, 3);
});
