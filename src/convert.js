import { applyPos, quatToBBEuler, CONVENTION } from './convention.js';

// glTF normal (dominant axis + sign) → Blockbench face name, honoring the position flip convention.
function bbFaceName(normal) {
  const f = CONVENTION.flip;
  const n = [normal[0] * f[0], normal[1] * f[1], normal[2] * f[2]];
  const ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
  const d = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : (ax[1] >= ax[2] ? 1 : 2);
  const s = Math.sign(n[d]);
  if (d === 0) return s >= 0 ? 'east' : 'west';
  if (d === 1) return s >= 0 ? 'up' : 'down';
  return s >= 0 ? 'south' : 'north';
}

function faceToUv(face, tex) {
  const us = face.uvs.map((p) => p[0] * tex.width);
  const vs = face.uvs.map((p) => p[1] * tex.height);
  return {
    uv: [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)],
    rotation: 0, // refined in calibration if a texture looks rotated
  };
}

export function buildFaces(box, tex) {
  if (!tex || !box.faces || !box.faces.length) return null;
  const out = {};
  for (const face of box.faces) out[bbFaceName(face.normal)] = faceToUv(face, tex);
  return out;
}

// ParsedScene → IMModel (groups + cubes). Phase 1: geometry only.
export function convert(scene) {
  const groups = [];
  const cubes = [];

  // walk: parentAccum = translation-only accumulated origin (raw glTF units), parentIndex
  function walk(node, parentAccum, parentIndex) {
    const accum = [
      parentAccum[0] + node.translation[0],
      parentAccum[1] + node.translation[1],
      parentAccum[2] + node.translation[2],
    ];
    const origin = applyPos(accum);
    const groupIndex = groups.length;
    groups.push({
      name: node.name,
      origin,
      rotation: quatToBBEuler(node.rotation),
      parent: parentIndex,
    });

    if (node.box) {
      // from/to = (accum + boxCorner) × 16, axis-aligned (translation-only space)
      const lo = applyPos([accum[0] + node.box.min[0], accum[1] + node.box.min[1], accum[2] + node.box.min[2]]);
      const hi = applyPos([accum[0] + node.box.max[0], accum[1] + node.box.max[1], accum[2] + node.box.max[2]]);
      const from = [Math.min(lo[0], hi[0]), Math.min(lo[1], hi[1]), Math.min(lo[2], hi[2])];
      const to = [Math.max(lo[0], hi[0]), Math.max(lo[1], hi[1]), Math.max(lo[2], hi[2])];
      cubes.push({ name: node.name, from, to, origin, rotation: [0, 0, 0], group: groupIndex, faces: buildFaces(node.box, scene.texture) });
    }

    for (const child of node.children) walk(child, accum, groupIndex);
  }

  for (const root of scene.roots) walk(root, [0, 0, 0], null);
  return { groups, cubes, texture: scene.texture, animations: [] };
}
