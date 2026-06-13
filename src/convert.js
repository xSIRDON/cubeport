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
  if (!tex || !tex.width || !tex.height || !box.faces || !box.faces.length) return null;
  const out = {};
  for (const face of box.faces) out[bbFaceName(face.normal)] = faceToUv(face, tex);
  return out;
}

// Reuses applyPos / quatToBBEuler already imported at the top of convert.js (Task 4).
// Animation tracks are keyed by glTF node index (names are NOT unique). Three maps, all keyed
// by node index, are built during the walk:
//   indexToGroup[idx]  → the IM group index for that node
//   restRot[idx]       → the bone's rest rotation euler (= group.rotation we computed)
//   localTrans[idx]    → the node's OWN local translation (raw glTF units)
// Keyframes are deltas from rest because Blockbench adds them onto fix_rotation/fix_position.
// Object.entries keys are strings; the maps were set with numeric keys, so string lookup matches.
function convertAnimations(scene, indexToGroup, restRot, localTrans) {
  return scene.animations.map((anim) => {
    const tracks = {};
    for (const [nodeIndex, t] of Object.entries(anim.tracks)) {
      const gi = indexToGroup[nodeIndex];
      if (gi == null) continue;
      const rRot = restRot[nodeIndex] || [0, 0, 0];
      const lT = localTrans[nodeIndex] || [0, 0, 0];
      const out = { rotation: [], position: [], scale: [] };
      for (const k of t.rotation) {
        const abs = quatToBBEuler(k.q);
        out.rotation.push({ t: k.t, value: [abs[0] - rRot[0], abs[1] - rRot[1], abs[2] - rRot[2]] });
      }
      out.rotation.sort((a, b) => a.t - b.t);
      // Unwrap each euler component so consecutive keyframes take the short rotational path.
      // Adding ±360 to a keyframe leaves its orientation identical but avoids long-way interpolation.
      for (let comp = 0; comp < 3; comp++) {
        for (let i = 1; i < out.rotation.length; i++) {
          let d = out.rotation[i].value[comp] - out.rotation[i - 1].value[comp];
          while (d > 180) { out.rotation[i].value[comp] -= 360; d -= 360; }
          while (d < -180) { out.rotation[i].value[comp] += 360; d += 360; }
        }
      }
      for (const k of t.position) {
        // delta from the node's rest local translation, then to BB units (applyPos is linear)
        out.position.push({ t: k.t, value: applyPos([k.v[0] - lT[0], k.v[1] - lT[1], k.v[2] - lT[2]]) });
      }
      for (const k of t.scale) out.scale.push({ t: k.t, value: [k.v[0], k.v[1], k.v[2]] });
      tracks[gi] = out;
    }
    return { name: anim.name, length: anim.length, loop: 'loop', tracks };
  });
}

// ParsedScene → IMModel (groups + cubes). Phase 1: geometry only.
export function convert(scene) {
  const groups = [];
  const cubes = [];
  let skipped = 0;
  const indexToGroup = {};
  const restRot = {};
  const localTrans = {};

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

    if (node.gltfIndex != null) {
      indexToGroup[node.gltfIndex] = groupIndex;
      restRot[node.gltfIndex] = groups[groupIndex].rotation;
      localTrans[node.gltfIndex] = node.translation;
    }

    if (node.box) {
      // from/to = (accum + boxCorner) × 16, axis-aligned (translation-only space)
      const lo = applyPos([accum[0] + node.box.min[0], accum[1] + node.box.min[1], accum[2] + node.box.min[2]]);
      const hi = applyPos([accum[0] + node.box.max[0], accum[1] + node.box.max[1], accum[2] + node.box.max[2]]);
      const from = [Math.min(lo[0], hi[0]), Math.min(lo[1], hi[1]), Math.min(lo[2], hi[2])];
      const to = [Math.max(lo[0], hi[0]), Math.max(lo[1], hi[1]), Math.max(lo[2], hi[2])];
      // Skip degenerate cubes (zero size on any axis)
      const isDegenerate = (to[0] - from[0]) < 1e-6 || (to[1] - from[1]) < 1e-6 || (to[2] - from[2]) < 1e-6;
      if (isDegenerate) {
        skipped++;
      } else {
        cubes.push({ name: node.name, from, to, origin, rotation: [0, 0, 0], group: groupIndex, faces: buildFaces(node.box, scene.texture) });
      }
    }

    for (const child of node.children) walk(child, accum, groupIndex);
  }

  for (const root of scene.roots) walk(root, [0, 0, 0], null);
  return { groups, cubes, skipped, texture: scene.texture, animations: convertAnimations(scene, indexToGroup, restRot, localTrans) };
}
