// Pure math helpers. Quaternions are [x,y,z,w]. quatToEuler returns RADIANS.
export const deg = (d) => (d * Math.PI) / 180;

export function axisAngleQuat([x, y, z], angle) {
  const h = angle / 2, s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
}

export function quatMul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// Row-major 3x3 from quaternion (m[r*3+c]), v' = M v.
export function quatToMat3([x, y, z, w]) {
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    1 - (yy + zz), xy - wz, xz + wy,
    xy + wz, 1 - (xx + zz), yz - wx,
    xz - wy, yz + wx, 1 - (xx + yy),
  ];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Quaternion → Euler RADIANS. order: 'XYZ' or 'ZYX' (matches three.js Euler.setFromRotationMatrix).
export function quatToEuler(q, order = 'XYZ') {
  const m = quatToMat3(q);
  const m11 = m[0], m12 = m[1], m13 = m[2];
  const m21 = m[3], m22 = m[4], m23 = m[5];
  const m31 = m[6], m32 = m[7], m33 = m[8];
  let x, y, z;
  if (order === 'XYZ') {
    y = Math.asin(clamp(m13, -1, 1));
    if (Math.abs(m13) < 0.9999999) { x = Math.atan2(-m23, m33); z = Math.atan2(-m12, m11); }
    else { x = Math.atan2(m32, m22); z = 0; }
  } else if (order === 'ZYX') {
    y = Math.asin(-clamp(m31, -1, 1));
    if (Math.abs(m31) < 0.9999999) { x = Math.atan2(m32, m33); z = Math.atan2(m21, m11); }
    else { x = 0; z = Math.atan2(-m12, m22); }
  } else {
    throw new Error(`Unsupported euler order: ${order}`);
  }
  return [x, y, z];
}
