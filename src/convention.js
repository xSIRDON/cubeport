import { quatToEuler } from './math.js';

// Calibrated against the sample in Task 6. Start neutral; adjust flip/eulerOrder/eulerSign there.
export const CONVENTION = {
  scale: 16,            // 1 glTF unit = 16 px
  flip: [1, 1, 1],      // per-axis sign for positions
  eulerOrder: 'XYZ',    // 'XYZ' | 'ZYX'
  eulerSign: [1, 1, 1], // per-axis sign for rotation degrees
};

export function applyPos([x, y, z]) {
  const { scale: s, flip: f } = CONVENTION;
  return [x * s * f[0], y * s * f[1], z * s * f[2]];
}

export function quatToBBEuler(q) {
  const e = quatToEuler(q, CONVENTION.eulerOrder); // radians
  const s = CONVENTION.eulerSign;
  return [e[0] * 180 / Math.PI * s[0], e[1] * 180 / Math.PI * s[1], e[2] * 180 / Math.PI * s[2]];
}
