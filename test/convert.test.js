import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../src/convert.js';

const closeArr = (a, b, eps = 1e-3) => { assert.equal(a.length, b.length); a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= eps, `${a} !~ ${b}`)); };

function node(over = {}) {
  return { name: 'n', translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], box: null, children: [], ...over };
}

test('single cube: size/pivot/from-to in BB units', () => {
  const scene = {
    roots: [node({
      name: 'c', translation: [1, 0.5, 0],
      box: { min: [-0.0625, 0, 0], max: [0.0625, 0.25, 0.0625], faces: [] },
    })],
    texture: null, animations: [],
  };
  const m = convert(scene);
  assert.equal(m.groups.length, 1);
  assert.equal(m.cubes.length, 1);
  closeArr(m.groups[0].origin, [16, 8, 0]);         // pivot = translation × 16
  const cube = m.cubes[0];
  closeArr(cube.from, [16 - 1, 8 + 0, 0]);          // (pivot + min) × 16
  closeArr(cube.to, [16 + 1, 8 + 4, 1]);            // (pivot + max) × 16
  closeArr(cube.origin, [16, 8, 0]);
});

test('child pivot uses translation-only accumulation', () => {
  const scene = {
    roots: [node({
      name: 'parent', translation: [1, 0, 0],
      children: [node({ name: 'child', translation: [0, 2, 0], box: { min: [0, 0, 0], max: [0.0625, 0.0625, 0.0625], faces: [] } })],
    })],
    texture: null, animations: [],
  };
  const m = convert(scene);
  const child = m.groups.find((g) => g.name === 'child');
  closeArr(child.origin, [16, 32, 0]);              // (1+0, 0+2, 0) × 16
});

test('bone rotation is the node LOCAL rotation in degrees', () => {
  // 90° about Y
  const s = Math.sin(Math.PI / 4);
  const scene = { roots: [node({ name: 'r', rotation: [0, s, 0, s], box: { min: [0, 0, 0], max: [0.0625, 0.0625, 0.0625], faces: [] } })], texture: null, animations: [] };
  const m = convert(scene);
  assert.ok(Math.abs(Math.abs(m.groups[0].rotation[1]) - 90) < 1e-2);
});

import { readFileSync } from 'node:fs';
import { readGltf } from '../src/gltf-reader.js';

test('sample: every cube has positive integer-ish size', () => {
  const buf = readFileSync(new URL('./fixtures/bacteria.gltf', import.meta.url));
  const scene = readGltf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const m = convert(scene);
  assert.ok(m.cubes.length >= 90, `got ${m.cubes.length} cubes`);
  for (const c of m.cubes) {
    for (let i = 0; i < 3; i++) {
      const size = c.to[i] - c.from[i];
      assert.ok(size > 0, `size>0 (${c.name})`);
      assert.ok(Math.abs(size - Math.round(size)) < 1e-2, `integer size ${size} (${c.name})`);
    }
  }
});
