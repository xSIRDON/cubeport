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

test('face UVs map to pixel rect within texture bounds', () => {
  const scene = {
    roots: [node({
      name: 'c', translation: [0, 0, 0],
      box: {
        min: [0, 0, 0], max: [0.0625, 0.0625, 0.0625],
        faces: [{
          normal: [0, 0, 1],
          corners: [[0, 0, 0.0625], [0.0625, 0, 0.0625], [0.0625, 0.0625, 0.0625], [0, 0.0625, 0.0625]],
          uvs: [[0, 0], [0.25, 0], [0.25, 0.25], [0, 0.25]],
        }],
      },
    })],
    texture: { name: 't', dataUrl: 'data:', width: 64, height: 64 }, animations: [],
  };
  const m = convert(scene);
  const faces = m.cubes[0].faces;
  assert.ok(faces, 'faces present');
  const f = Object.values(faces)[0];
  // u 0..0.25 × 64 = 0..16 ; v 0..0.25 × 64 = 0..16
  closeArr([f.uv[0], f.uv[2]].sort((a, b) => a - b), [0, 16]);
  closeArr([f.uv[1], f.uv[3]].sort((a, b) => a - b), [0, 16]);
});

// quaternion for `deg` degrees about +Y
const quatY = (degrees) => { const h = (degrees * Math.PI) / 360; return [0, Math.sin(h), 0, Math.cos(h)]; };

test('animation: rotation keyframes are DELTA from the bone rest rotation, in degrees', () => {
  // rest = 30° about Y; anim goes 30°→90°. Tracks keyed by glTF node index; node carries gltfIndex.
  const scene = {
    roots: [node({ name: 'bone', gltfIndex: 7, rotation: quatY(30), box: { min: [0, 0, 0], max: [0.0625, 0.0625, 0.0625], faces: [] } })],
    texture: null,
    animations: [{
      name: 'test', length: 0.5,
      tracks: { 7: { rotation: [{ t: 0, q: quatY(30) }, { t: 0.5, q: quatY(90) }], position: [], scale: [] } },
    }],
  };
  const m = convert(scene);
  assert.equal(m.animations.length, 1);
  const groupIndex = m.groups.findIndex((g) => g.name === 'bone');
  const track = m.animations[0].tracks[groupIndex];
  assert.ok(track, 'track for bone group');
  assert.equal(track.rotation.length, 2);
  assert.ok(Math.abs(track.rotation[0].value[1]) < 1e-2, 'delta ~0 at rest');     // 30 - 30
  assert.ok(Math.abs(track.rotation[1].value[1] - 60) < 1e-2, 'delta ~60');       // 90 - 30
});

test('animation: position keyframes are DELTA from rest local translation, scaled ×16', () => {
  const scene = {
    roots: [node({ name: 'b', gltfIndex: 3, translation: [1, 0, 0], box: { min: [0, 0, 0], max: [0.0625, 0.0625, 0.0625], faces: [] } })],
    texture: null,
    animations: [{
      name: 't', length: 1,
      tracks: { 3: { rotation: [], position: [{ t: 0, v: [1, 0, 0] }, { t: 1, v: [2, 0, 0] }], scale: [] } },
    }],
  };
  const m = convert(scene);
  const gi = m.groups.findIndex((g) => g.name === 'b');
  const track = m.animations[0].tracks[gi];
  assert.ok(Math.abs(track.position[0].value[0]) < 1e-2, 'delta ~0 at rest');     // (1-1)*16
  assert.ok(Math.abs(track.position[1].value[0] - 16) < 1e-2, 'delta ~16');       // (2-1)*16
});

test('degenerate cube (zero size on one axis) is skipped and counted', () => {
  const scene = {
    roots: [
      node({ name: 'flat', translation: [0, 0, 0], box: { min: [0, 0, 0], max: [0.0625, 0, 0.0625], faces: [] } }),
      node({ name: 'ok',   translation: [0, 0, 0], box: { min: [0, 0, 0], max: [0.0625, 0.0625, 0.0625], faces: [] } }),
    ],
    texture: null, animations: [],
  };
  const m = convert(scene);
  assert.equal(m.cubes.length, 1, 'only the non-degenerate cube included');
  assert.equal(m.cubes[0].name, 'ok');
  assert.equal(m.skipped, 1, 'skipped count is 1');
});

// Calibration lock (Task 6): the neutral CONVENTION (×16, no flip, XYZ Euler) was confirmed
// correct by visual check in Blockbench. Pin the head bone (via the head cube → its group,
// robust to the duplicate 'head' parent group) so a convention change can't silently regress it.
test('sample: head bone has expected calibrated transform', () => {
  const buf = readFileSync(new URL('./fixtures/bacteria.gltf', import.meta.url));
  const scene = readGltf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const m = convert(scene);
  const headCube = m.cubes.find((c) => c.name === 'head');
  assert.ok(headCube, 'head cube present');
  const bone = m.groups[headCube.group];
  closeArr(bone.origin, [0, 44, 0], 1e-2);
  closeArr(bone.rotation, [5, -5, 10], 1e-2);
  closeArr(headCube.to.map((v, i) => v - headCube.from[i]), [10, 4, 14], 1e-2);
});
