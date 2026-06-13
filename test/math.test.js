import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quatToEuler, quatMul, axisAngleQuat, deg } from '../src/math.js';

const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
const closeArr = (a, b, eps = 1e-3) => a.forEach((v, i) => close(v, b[i], eps));

test('identity quaternion → zero euler', () => {
  closeArr(quatToEuler([0, 0, 0, 1], 'XYZ'), [0, 0, 0]);
});

test('90° about Y → euler [0,90,0] (XYZ, degrees)', () => {
  const q = axisAngleQuat([0, 1, 0], deg(90));
  closeArr(quatToEuler(q, 'XYZ').map(r => r * 180 / Math.PI), [0, 90, 0]);
});

test('90° about X → euler [90,0,0]', () => {
  const q = axisAngleQuat([1, 0, 0], deg(90));
  closeArr(quatToEuler(q, 'XYZ').map(r => r * 180 / Math.PI), [90, 0, 0]);
});

test('quatMul composes rotations', () => {
  const qx = axisAngleQuat([1, 0, 0], deg(90));
  const out = quatMul(qx, [0, 0, 0, 1]);
  closeArr(out, qx);
});
