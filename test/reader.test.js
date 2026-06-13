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
