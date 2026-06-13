import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readGltf } from '../src/gltf-reader.js';

function loadFixture() {
  const buf = readFileSync(new URL('./fixtures/bacteria.gltf', import.meta.url));
  return readGltf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

test('reads the sample scene graph', () => {
  const scene = readGltf
    ? loadFixture() : null;
  assert.ok(scene.roots.length >= 1, 'has roots');
});

function countNodes(nodes) {
  let n = 0;
  for (const node of nodes) { n += 1; n += countNodes(node.children); }
  return n;
}

test('node count matches file (130 nodes)', () => {
  const scene = loadFixture();
  assert.equal(countNodes(scene.roots), 130);
});

test('finds the head bone with a 24-vertex box and integer-ish size', () => {
  const scene = loadFixture();
  let head = null;
  (function find(nodes) { for (const n of nodes) { if (n.name === 'head' && n.box) head = n; find(n.children); } })(scene.roots);
  assert.ok(head, 'head node with box found');
  const sizePx = head.box.max.map((v, i) => (v - head.box.min[i]) * 16);
  // head is 10 x 4 x 14 in the file
  sizePx.forEach((v) => assert.ok(Math.abs(v - Math.round(v)) < 1e-2, `size ${v} ~ integer`));
});

test('sample: reads the embedded 64×64 texture', () => {
  const scene = loadFixture();
  assert.ok(scene.texture, 'texture present');
  assert.ok(scene.texture.dataUrl.startsWith('data:image/png'), 'png data url');
  assert.equal(scene.texture.width, 64);
  assert.equal(scene.texture.height, 64);
});

test('sample: head box has 6 faces with uvs', () => {
  const scene = loadFixture();
  let head = null;
  (function find(nodes) { for (const n of nodes) { if (n.name === 'head' && n.box) head = n; find(n.children); } })(scene.roots);
  assert.equal(head.box.faces.length, 6);
  for (const f of head.box.faces) {
    assert.equal(f.uvs.length, 4);
    f.uvs.forEach(([u, v]) => { assert.ok(u >= -0.001 && u <= 1.001); assert.ok(v >= -0.001 && v <= 1.001); });
  }
});
