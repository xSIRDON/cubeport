// Minimal glTF 2.0 reader: enough for Minecraft box hierarchies.
// Handles .glb + .gltf, data-URI & external buffers, TRS or matrix nodes.
import { quatToMat3 } from './math.js';

const GLB_MAGIC = 0x46546c67; // 'glTF'

function parseGlb(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const length = dv.getUint32(8, true);
  let offset = 12, json = null, bin = null;
  while (offset < length) {
    const chunkLen = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (chunkType === 0x4e4f534a) { // JSON
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, start, chunkLen)));
    } else if (chunkType === 0x004e4942) { // BIN
      bin = arrayBuffer.slice(start, start + chunkLen);
    }
    offset = start + chunkLen + ((4 - (chunkLen % 4)) % 4);
  }
  return { json, bin };
}

function base64ToArrayBuffer(b64) {
  const bin = (typeof atob === 'function')
    ? atob(b64)
    : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function resolveBuffers(json, glbBin, externalLoader) {
  return (json.buffers || []).map((b) => {
    if (!b.uri) return glbBin;                       // glb embedded BIN
    if (b.uri.startsWith('data:')) {                 // data URI
      return base64ToArrayBuffer(b.uri.slice(b.uri.indexOf(',') + 1));
    }
    if (externalLoader) return externalLoader(b.uri); // external .bin
    throw new Error(`Cannot resolve external buffer: ${b.uri}`);
  });
}

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// Decode an accessor into a flat JS array of numbers (handles byteStride/interleaving).
function readAccessor(json, buffers, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const buffer = buffers[view.buffer];
  const Ctor = COMPONENT[acc.componentType];
  const ncomp = NUM_COMPONENTS[acc.type];
  const baseOffset = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Array(acc.count * ncomp);
  const stride = view.byteStride || ncomp * Ctor.BYTES_PER_ELEMENT;
  const dv = new DataView(buffer);
  const isFloat = acc.componentType === 5126;
  const read = (off) => isFloat
    ? dv['getFloat32'](off, true)
    : (Ctor === Uint16Array ? dv.getUint16(off, true)
      : Ctor === Uint32Array ? dv.getUint32(off, true)
        : Ctor === Int16Array ? dv.getInt16(off, true)
          : Ctor === Uint8Array ? dv.getUint8(off)
            : dv.getInt8(off));
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < ncomp; c++) {
      out[i * ncomp + c] = read(baseOffset + i * stride + c * Ctor.BYTES_PER_ELEMENT);
    }
  }
  return { data: out, count: acc.count, ncomp, min: acc.min, max: acc.max };
}

// Decompose a 4x4 column-major glTF matrix into translation/rotation(quat)/scale.
function decomposeMatrix(m) {
  const t = [m[12], m[13], m[14]];
  let sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  if (det < 0) sx = -sx;
  const r = [[m[0] / sx, m[4] / sy, m[8] / sz], [m[1] / sx, m[5] / sy, m[9] / sz], [m[2] / sx, m[6] / sy, m[10] / sz]];
  // matrix → quaternion
  const tr = r[0][0] + r[1][1] + r[2][2];
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(r[2][1] - r[1][2]) / s, (r[0][2] - r[2][0]) / s, (r[1][0] - r[0][1]) / s, 0.25 * s]; }
  else if (r[0][0] > r[1][1] && r[0][0] > r[2][2]) { const s = Math.sqrt(1 + r[0][0] - r[1][1] - r[2][2]) * 2; q = [0.25 * s, (r[0][1] + r[1][0]) / s, (r[0][2] + r[2][0]) / s, (r[2][1] - r[1][2]) / s]; }
  else if (r[1][1] > r[2][2]) { const s = Math.sqrt(1 + r[1][1] - r[0][0] - r[2][2]) * 2; q = [(r[0][1] + r[1][0]) / s, 0.25 * s, (r[1][2] + r[2][1]) / s, (r[0][2] - r[2][0]) / s]; }
  else { const s = Math.sqrt(1 + r[2][2] - r[0][0] - r[1][1]) * 2; q = [(r[0][2] + r[2][0]) / s, (r[1][2] + r[2][1]) / s, 0.25 * s, (r[1][0] - r[0][1]) / s]; }
  return { translation: t, rotation: q, scale: [sx, sy, sz] };
}

function nodeTRS(n) {
  if (n.matrix) return decomposeMatrix(n.matrix);
  return {
    translation: n.translation || [0, 0, 0],
    rotation: n.rotation || [0, 0, 0, 1],
    scale: n.scale || [1, 1, 1],
  };
}

// PNG IHDR: width/height are big-endian uint32 at byte 16 and 20.
function pngSize(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
}

function arrayBufferToDataUrl(arrayBuffer, mime) {
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = (typeof btoa === 'function') ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return `data:${mime};base64,${b64}`;
}

function readTexture(json, buffers, opts) {
  if (!json.images || !json.images.length) return null;
  const img = json.images[0];
  let ab, mime = img.mimeType || 'image/png';
  if (img.uri && img.uri.startsWith('data:')) {
    mime = img.uri.slice(5, img.uri.indexOf(';'));
    ab = base64ToArrayBuffer(img.uri.slice(img.uri.indexOf(',') + 1));
  } else if (img.bufferView != null) {
    const view = json.bufferViews[img.bufferView];
    ab = buffers[view.buffer].slice(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  } else if (img.uri && opts.externalLoader) {
    ab = opts.externalLoader(img.uri);
  } else {
    return null;
  }
  const { width, height } = pngSize(ab);
  const dataUrl = (img.uri && img.uri.startsWith('data:')) ? img.uri : arrayBufferToDataUrl(ab, mime);
  return { name: (json.images[0].name) || 'texture', dataUrl, width, height };
}

// Group a 24-vertex box's faces using NORMAL; collect 4 corners + uvs per face.
function readFaces(json, buffers, meshIndex) {
  const prim = json.meshes[meshIndex].primitives[0];
  if (prim.attributes.TEXCOORD_0 == null || prim.attributes.NORMAL == null) return [];
  const pos = readAccessor(json, buffers, prim.attributes.POSITION).data;
  const nor = readAccessor(json, buffers, prim.attributes.NORMAL).data;
  const uv = readAccessor(json, buffers, prim.attributes.TEXCOORD_0).data;
  const idx = prim.indices != null ? readAccessor(json, buffers, prim.indices).data : null;
  const vertCount = pos.length / 3;
  const order = idx || Array.from({ length: vertCount }, (_, i) => i);
  // dominant axis of a normal → key
  const faceKey = (n) => {
    const ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
    const d = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : (ax[1] >= ax[2] ? 1 : 2);
    return `${d}:${Math.sign(n[d])}`;
  };
  const seen = new Map(); // key → {normal, verts:Set}
  for (const vi of order) {
    const n = [nor[vi * 3], nor[vi * 3 + 1], nor[vi * 3 + 2]];
    const k = faceKey(n);
    if (!seen.has(k)) seen.set(k, { normal: n, verts: new Set() });
    seen.get(k).verts.add(vi);
  }
  const faces = [];
  for (const { normal, verts } of seen.values()) {
    const vs = [...verts].slice(0, 4);
    faces.push({
      normal,
      corners: vs.map((vi) => [pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]]),
      uvs: vs.map((vi) => [uv[vi * 2], uv[vi * 2 + 1]]),
    });
  }
  return faces;
}

// Compute AABB of a mesh's first primitive POSITION accessor (uses min/max if present).
function meshBox(json, buffers, meshIndex) {
  const prim = json.meshes[meshIndex].primitives[0];
  const posIdx = prim.attributes.POSITION;
  const acc = json.accessors[posIdx];
  if (acc.min && acc.max) return { min: acc.min.slice(), max: acc.max.slice(), faces: readFaces(json, buffers, meshIndex) };
  const { data } = readAccessor(json, buffers, posIdx);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < data.length; i += 3) {
    for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], data[i + c]); max[c] = Math.max(max[c], data[i + c]); }
  }
  return { min, max, faces: readFaces(json, buffers, meshIndex) };
}

function buildNode(json, buffers, idx) {
  const n = json.nodes[idx];
  const trs = nodeTRS(n);
  return {
    name: n.name || `node_${idx}`,
    gltfIndex: idx,
    translation: trs.translation,
    rotation: trs.rotation,
    scale: trs.scale,
    box: (n.mesh != null) ? meshBox(json, buffers, n.mesh) : null,
    children: (n.children || []).map((c) => buildNode(json, buffers, c)),
  };
}

function readAnimations(json, buffers) {
  if (!json.animations) return [];
  return json.animations.map((anim, ai) => {
    const tracks = {};
    let length = 0;
    for (const ch of anim.channels) {
      const sampler = anim.samplers[ch.sampler];
      const times = readAccessor(json, buffers, sampler.input).data;
      const values = readAccessor(json, buffers, sampler.output);
      const nodeIndex = ch.target.node;          // unique, stable key
      const path = ch.target.path;               // 'rotation' | 'translation' | 'scale'
      if (!tracks[nodeIndex]) tracks[nodeIndex] = { rotation: [], position: [], scale: [] };
      const n = values.ncomp;
      for (let k = 0; k < times.length; k++) {
        const t = times[k];
        length = Math.max(length, t);
        const v = values.data.slice(k * n, k * n + n);
        if (path === 'rotation') tracks[nodeIndex].rotation.push({ t, q: v });
        else if (path === 'translation') tracks[nodeIndex].position.push({ t, v });
        else if (path === 'scale') tracks[nodeIndex].scale.push({ t, v });
      }
    }
    return { name: anim.name || `animation_${ai}`, length, tracks };
  });
}

// Entry point. arrayBuffer: .glb or .gltf bytes. opts.externalLoader(uri)->ArrayBuffer for external files.
export function readGltf(arrayBuffer, opts = {}) {
  const dv = new DataView(arrayBuffer);
  let json, bin = null;
  if (dv.getUint32(0, true) === GLB_MAGIC) ({ json, bin } = parseGlb(arrayBuffer));
  else json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
  const buffers = resolveBuffers(json, bin, opts.externalLoader);
  const sceneDef = json.scenes[json.scene ?? 0];
  const roots = sceneDef.nodes.map((i) => buildNode(json, buffers, i));
  return { roots, texture: readTexture(json, buffers, opts), animations: readAnimations(json, buffers), _json: json, _buffers: buffers };
}
