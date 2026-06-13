# glTF → Blockbench Importer Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Blockbench plugin that imports a `.gltf`/`.glb` file into the currently open project as editable bones + cubes (position, size, pivot, rotation), with texture/UVs and animations.

**Architecture:** Pure, Node-testable core (`math`, `convention`, `gltf-reader`, `convert`) + a thin Blockbench `adapter` + a plugin `entry`. esbuild bundles everything into a single `dist/gltf_importer.js` the user loads in Blockbench. We ship our **own** small glTF reader because Blockbench bundles three.js r129 but **not** `GLTFLoader`.

**Tech Stack:** Node 25 (ESM), `node --test` (built-in test runner), esbuild (bundling). No runtime deps in the plugin; Blockbench globals (`Plugin`, `Action`, `Blockbench`, `Group`, `Cube`, `Texture`, `Animation`, `Undo`, `Canvas`, `Project`) are used only in `adapter`/`entry`.

**Coordinate mapping (the crux):** Each glTF node → one Blockbench bone (group) containing one axis-aligned cube. Use **translation-only accumulation** for pivots/coords and the node's **local** quaternion (→ Euler degrees) for the bone rotation. Proof in Task 5.

**Build order:** Phase 1 geometry → Phase 2 texture+UVs → Phase 3 animations → Phase 4 (stretch) verify/polish.

---

## File Structure

```
glTFConverter/
  package.json            # ESM, scripts: test, build
  build.mjs               # esbuild → dist/gltf_importer.js
  src/
    math.js               # vec3/quat/mat3 + quatToEuler (pure)
    convention.js         # CONVENTION constant; applyConvention(), quatToBBEuler() (pure)
    gltf-reader.js        # ArrayBuffer → ParsedScene (pure; no three, no Blockbench)
    convert.js            # ParsedScene → IntermediateModel (pure)
    adapter.js            # IntermediateModel → Blockbench objects (runtime)
    entry.js              # Plugin.register + Action + wiring (runtime)
  test/
    math.test.js
    convert.test.js
    reader.test.js
    fixtures/bacteria.gltf   # copy of the user's sample
  dist/gltf_importer.js   # build output — the deliverable
  README.md
```

**Data contracts** (JSDoc typedefs live at the top of the modules that produce them):

```js
// ParsedScene (produced by gltf-reader, consumed by convert) — all values RAW glTF units/space
// ParsedNode  = { name:string, translation:[x,y,z], rotation:[x,y,z,w], scale:[x,y,z],
//                 children:ParsedNode[], box:ParsedBox|null }
// ParsedBox   = { min:[x,y,z], max:[x,y,z], faces:ParsedFace[] }            // faces [] until Phase 2
// ParsedFace  = { normal:[x,y,z], uvs:[[u,v],[u,v],[u,v],[u,v]],            // 0..1, ordered by corners
//                 corners:[[x,y,z]*4] }
// ParsedScene = { roots:ParsedNode[], texture:ParsedTexture|null, animations:ParsedAnimation[] }
// ParsedTexture   = { name:string, dataUrl:string, width:number, height:number }   // Phase 2
// ParsedAnimation = { name:string, length:number,                                  // Phase 3
//                     tracks: { [nodeName]: { rotation:[{t,q:[x,y,z,w]}], position:[{t,v:[x,y,z]}],
//                                             scale:[{t,v:[x,y,z]}] } } }

// IntermediateModel (produced by convert, consumed by adapter) — all values BLOCKBENCH units/degrees
// IMGroup = { name, origin:[x,y,z], rotation:[rx,ry,rz], parent:number|null }   // index into groups[]
// IMCube  = { name, from:[x,y,z], to:[x,y,z], origin:[x,y,z], rotation:[0,0,0],
//             group:number, faces:{north?:IMFace,...}|null }
// IMFace  = { uv:[x1,y1,x2,y2], rotation:0|90|180|270 }
// IMModel = { groups:IMGroup[], cubes:IMCube[], texture:ParsedTexture|null,
//             animations:IMAnimation[] }
// IMAnimation = { name, length, loop:'loop'|'once',
//                 tracks: { [groupIndex]: { rotation:[{t,value:[x,y,z]}],
//                                           position:[{t,value:[x,y,z]}],
//                                           scale:[{t,value:[x,y,z]}] } } }
```

---

## Task 0: Project scaffolding

**Files:**
- Create: `package.json`, `build.mjs`, `.gitignore`, `test/fixtures/bacteria.gltf`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "gltf-importer-blockbench",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test",
    "build": "node build.mjs"
  },
  "devDependencies": {
    "esbuild": "^0.24.0"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 3: Create `build.mjs`**

```js
import { build } from 'esbuild';

await build({
  entryPoints: ['src/entry.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/gltf_importer.js',
  legalComments: 'none',
});
console.log('Built dist/gltf_importer.js');
```

- [ ] **Step 4: Copy the sample fixture**

Run (PowerShell):
```powershell
New-Item -ItemType Directory -Force test/fixtures | Out-Null
Copy-Item "$env:USERPROFILE\Downloads\bacteria\source\model.gltf" test/fixtures/bacteria.gltf
```
Expected: `test/fixtures/bacteria.gltf` exists (~300 KB).

- [ ] **Step 5: Install esbuild**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json build.mjs .gitignore test/fixtures/bacteria.gltf
git commit -m "chore: scaffold gltf importer project"
```

---

## Task 1: Math utilities (`src/math.js`)

**Files:**
- Create: `src/math.js`
- Test: `test/math.test.js`

- [ ] **Step 1: Write the failing tests**

`test/math.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/math.test.js`
Expected: FAIL — `Cannot find module '../src/math.js'`.

- [ ] **Step 3: Implement `src/math.js`**

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/math.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/math.js test/math.test.js
git commit -m "feat: add quaternion/euler math utilities"
```

---

## Task 2: Convention module (`src/convention.js`)

This is the single place that encodes glTF→Blockbench axis/scale/Euler convention, so calibration changes stay local.

**Files:**
- Create: `src/convention.js`
- Test: extend `test/math.test.js` (convention is trivial; tested alongside).

- [ ] **Step 1: Write the failing test (append to `test/math.test.js`)**

```js
import { CONVENTION, applyPos, quatToBBEuler } from '../src/convention.js';

test('applyPos scales by 16 and applies flip', () => {
  // default flip [1,1,1], scale 16
  closeArr(applyPos([1, 0.5, -0.25]), [16, 8, -4]);
});

test('quatToBBEuler returns degrees', () => {
  const q = axisAngleQuat([0, 1, 0], deg(30));
  const e = quatToBBEuler(q);
  // y≈30 in default XYZ; sign depends on CONVENTION.eulerSign
  close(Math.abs(e[1]), 30, 1e-2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/math.test.js`
Expected: FAIL — `Cannot find module '../src/convention.js'`.

- [ ] **Step 3: Implement `src/convention.js`**

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/math.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/convention.js test/math.test.js
git commit -m "feat: add glTF→Blockbench convention module"
```

---

## Task 3: glTF reader — geometry only (`src/gltf-reader.js`)

Parse `.gltf`/`.glb` into a `ParsedScene` with node TRS, hierarchy, and per-mesh AABB. (Texture/animation added in later phases.)

**Files:**
- Create: `src/gltf-reader.js`
- Test: `test/reader.test.js`

- [ ] **Step 1: Write the failing tests**

`test/reader.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/reader.test.js`
Expected: FAIL — `Cannot find module '../src/gltf-reader.js'`.

- [ ] **Step 3: Implement `src/gltf-reader.js`**

```js
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

// Compute AABB of a mesh's first primitive POSITION accessor (uses min/max if present).
function meshBox(json, buffers, meshIndex) {
  const prim = json.meshes[meshIndex].primitives[0];
  const posIdx = prim.attributes.POSITION;
  const acc = json.accessors[posIdx];
  if (acc.min && acc.max) return { min: acc.min.slice(), max: acc.max.slice(), faces: [] };
  const { data } = readAccessor(json, buffers, posIdx);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < data.length; i += 3) {
    for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], data[i + c]); max[c] = Math.max(max[c], data[i + c]); }
  }
  return { min, max, faces: [] };
}

function buildNode(json, buffers, idx) {
  const n = json.nodes[idx];
  const trs = nodeTRS(n);
  return {
    name: n.name || `node_${idx}`,
    translation: trs.translation,
    rotation: trs.rotation,
    scale: trs.scale,
    box: (n.mesh != null) ? meshBox(json, buffers, n.mesh) : null,
    children: (n.children || []).map((c) => buildNode(json, buffers, c)),
  };
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
  return { roots, texture: null, animations: [], _json: json, _buffers: buffers };
}
```

> Note: the unused `quatToMat3` import is intentional groundwork for later phases — remove it if your linter complains; it's used in Phase 3.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/reader.test.js`
Expected: PASS (4/4) — scene parsed, 130 nodes, head box ≈ 10×4×14.

- [ ] **Step 5: Commit**

```bash
git add src/gltf-reader.js test/reader.test.js
git commit -m "feat: glTF reader for node hierarchy + mesh AABB"
```

---

## Task 4: Convert — geometry (`src/convert.js`)

Walk the `ParsedScene` and emit `IMModel` groups + cubes using translation-only accumulation + local rotation.

**Files:**
- Create: `src/convert.js`
- Test: `test/convert.test.js`

- [ ] **Step 1: Write the failing tests**

`test/convert.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/convert.test.js`
Expected: FAIL — `Cannot find module '../src/convert.js'`.

- [ ] **Step 3: Implement `src/convert.js`**

```js
import { applyPos, quatToBBEuler } from './convention.js';

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
      cubes.push({ name: node.name, from, to, origin, rotation: [0, 0, 0], group: groupIndex, faces: null });
    }

    for (const child of node.children) walk(child, accum, groupIndex);
  }

  for (const root of scene.roots) walk(root, [0, 0, 0], null);
  return { groups, cubes, texture: scene.texture, animations: [] };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/convert.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Integration assertion against the sample (append to `test/convert.test.js`)**

```js
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
```

- [ ] **Step 6: Run to verify pass**

Run: `node --test test/convert.test.js`
Expected: PASS — sample produces ~98 cubes, all positive integer sizes.

- [ ] **Step 7: Commit**

```bash
git add src/convert.js test/convert.test.js
git commit -m "feat: convert glTF scene to Blockbench groups + cubes (geometry)"
```

---

## Task 5: Blockbench adapter + plugin entry (geometry) — first end-to-end import

**Proof of the mapping (reference; keep in a comment in `convert.js`):**
For parent `p` (root) with local rot `R_p`, child `i` with local translation `t_i`, local rot `R_i`:
glTF world vertex `= R_p R_i v + R_p t_i + t_p`.
Blockbench rest pivot `P_i = t_p + t_i` (translation-only), local rotations applied hierarchically:
`A_p(A_i(v + P_i)) = R_p R_i v + R_p t_i + t_p`. They match. ∎

**Files:**
- Create: `src/adapter.js`, `src/entry.js`
- (No Node unit test — verified manually in Blockbench. Adapter code stays thin.)

- [ ] **Step 1: Implement `src/adapter.js`**

```js
// IMModel → Blockbench objects, added to the OPEN project. Runtime-only (Blockbench globals).
/* global Group, Cube, Undo, Canvas */

export function buildIntoProject(model) {
  const affected = { elements: [], outliner: true, group: undefined };
  Undo.initEdit(affected);

  // Create groups parent-first; map IM index → Blockbench Group.
  const bbGroups = [];
  model.groups.forEach((g, i) => {
    const group = new Group({ name: g.name || `bone_${i}`, origin: g.origin, rotation: g.rotation });
    const parent = g.parent != null ? bbGroups[g.parent] : 'root';
    group.addTo(parent === 'root' ? undefined : parent).init();
    bbGroups[i] = group;
  });

  // Create cubes inside their groups.
  const cubes = [];
  for (const c of model.cubes) {
    const cube = new Cube({ name: c.name, from: c.from, to: c.to, origin: c.origin, rotation: c.rotation });
    cube.addTo(bbGroups[c.group]).init();
    cubes.push(cube);
  }

  Canvas.updateAll();
  Undo.finishEdit('Import glTF', { elements: cubes, outliner: true });
  return { groups: bbGroups, cubes };
}
```

- [ ] **Step 2: Implement `src/entry.js`**

```js
// Blockbench plugin entry: registers an "Import glTF/glb" action that imports into the open project.
/* global Plugin, Action, Blockbench, MenuBar, Project */
import { readGltf } from './gltf-reader.js';
import { convert } from './convert.js';
import { buildIntoProject } from './adapter.js';

let action;

Plugin.register('gltf_importer', {
  title: 'glTF/glb Importer',
  author: 'Nicholas Cerdon',
  description: 'Import glTF/glb models as editable bones + cubes into the open project.',
  icon: 'fa-cubes',
  version: '0.1.0',
  variant: 'both',
  onload() {
    action = new Action('import_gltf', {
      name: 'Import glTF/glb…',
      description: 'Import a .gltf/.glb model into the current project as cubes',
      icon: 'fa-cubes',
      click() {
        if (!Project) { Blockbench.showQuickMessage('Open or create a project first', 2000); return; }
        Blockbench.import(
          { extensions: ['gltf', 'glb'], type: 'glTF Model', readtype: 'binary' },
          (files) => {
            try {
              const f = files[0];
              const ab = f.content instanceof ArrayBuffer
                ? f.content
                : f.content.buffer.slice(f.content.byteOffset, f.content.byteOffset + f.content.byteLength);
              const scene = readGltf(ab);
              const model = convert(scene);
              const res = buildIntoProject(model);
              Blockbench.showQuickMessage(`Imported ${res.cubes.length} cubes`, 2000);
            } catch (e) {
              console.error(e);
              Blockbench.showMessageBox({ title: 'glTF import failed', message: String(e && e.message || e) });
            }
          },
        );
      },
    });
    MenuBar.addAction(action, 'file.import');
  },
  onunload() {
    if (action) action.delete();
  },
});
```

- [ ] **Step 3: Build the plugin**

Run: `npm run build`
Expected: `Built dist/gltf_importer.js`, file exists, no errors.

- [ ] **Step 4: Manual smoke test in Blockbench**

1. Open Blockbench → **File → Plugins → Load Plugin from File** → pick `dist/gltf_importer.js`.
2. Create a new **Bedrock Entity** project.
3. **File → Import → Import glTF/glb…** → pick `test/fixtures/bacteria.gltf`.
4. Expected: ~98 cubes appear as editable bones in the outliner; quick message "Imported 98 cubes".

- [ ] **Step 5: Commit**

```bash
git add src/adapter.js src/entry.js dist/gltf_importer.js
git commit -m "feat: Blockbench adapter + plugin entry (geometry import end-to-end)"
```

---

## Task 6: Coordinate calibration

Geometry is now imported; verify orientation/positions match the source and lock the convention.

**Files:**
- Modify: `src/convention.js` (only the `CONVENTION` constant)

- [ ] **Step 1: Visual check**

In Blockbench, compare the imported model to the Sketchfab/source orientation. Note any: mirrored axis (model backwards/left-right flipped), upside-down, or rotated bones.

- [ ] **Step 2: Adjust convention if needed**

- Mirrored on an axis → flip that axis sign in `CONVENTION.flip` (e.g. `[1,1,-1]`).
- Bone rotations wrong direction/order → switch `CONVENTION.eulerOrder` to `'ZYX'` and/or set `CONVENTION.eulerSign` (e.g. `[-1,1,-1]`).
- Re-run `npm run build`, reload plugin, re-import, recompare. Iterate until it matches.

- [ ] **Step 3: Round-trip confirmation (optional, strong signal)**

Export the imported model back to glTF (Blockbench's native glTF export) and diff a few node translations/rotations against the original `model.gltf`. They should match within tolerance.

- [ ] **Step 4: Lock a regression test (append to `test/convert.test.js`)**

Once calibrated, capture the head bone's expected origin/rotation so future changes can't silently break it:
```js
test('sample: head bone has expected calibrated transform', () => {
  const buf = readFileSync(new URL('./fixtures/bacteria.gltf', import.meta.url));
  const scene = readGltf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const m = convert(scene);
  const head = m.groups.find((g) => g.name === 'head');
  assert.ok(head);
  // Fill in the calibrated values observed in Blockbench:
  // closeArr(head.origin, [<x>, <y>, <z>]);
});
```
> Fill in the `<x>,<y>,<z>` with the values verified in Step 1–3, then uncomment.

- [ ] **Step 5: Commit**

```bash
git add src/convention.js test/convert.test.js
git commit -m "fix: calibrate glTF→Blockbench coordinate convention"
```

---

## Task 7: Reader — texture + UVs (Phase 2)

Extend the reader to decode the base color texture and per-face UVs.

**Files:**
- Modify: `src/gltf-reader.js`
- Test: extend `test/reader.test.js`

- [ ] **Step 1: Write the failing tests (append to `test/reader.test.js`)**

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/reader.test.js`
Expected: FAIL — `scene.texture` is null / `faces.length` 0.

- [ ] **Step 3: Add texture + face decoding to `src/gltf-reader.js`**

Add these helpers and wire them in:
```js
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
```
Then update `meshBox` to attach faces, and `readGltf` to attach the texture:
```js
// in meshBox(...): replace `faces: []` with:
//   faces: readFaces(json, buffers, meshIndex),
// in readGltf(...): replace `texture: null` with:
//   texture: readTexture(json, buffers, opts),
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/reader.test.js`
Expected: PASS — texture 64×64, 6 faces with in-range UVs.

- [ ] **Step 5: Commit**

```bash
git add src/gltf-reader.js test/reader.test.js
git commit -m "feat: reader decodes base color texture + per-face UVs"
```

---

## Task 8: Convert — per-face UV rects (Phase 2)

Turn each `ParsedFace` into a Blockbench `[x1,y1,x2,y2]` rect + rotation, keyed by BB face name.

**Files:**
- Modify: `src/convert.js`
- Test: extend `test/convert.test.js`

- [ ] **Step 1: Write the failing test (append to `test/convert.test.js`)**

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/convert.test.js`
Expected: FAIL — cube faces are `null`.

- [ ] **Step 3: Add face mapping to `src/convert.js`**

```js
import { CONVENTION } from './convention.js';

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
```
Then, in `convert`, set the cube faces:
```js
// replace `faces: null` in the cubes.push(...) with:
//   faces: buildFaces(node.box, scene.texture),
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/convert.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convert.js test/convert.test.js
git commit -m "feat: map glTF per-face UVs to Blockbench face rects"
```

---

## Task 9: Adapter — apply texture + per-face UV (Phase 2)

**Files:**
- Modify: `src/adapter.js`
- (Manual verification in Blockbench.)

- [ ] **Step 1: Update `src/adapter.js` to add the texture and assign face UVs**

```js
/* global Group, Cube, Texture, Project, Undo, Canvas */
export function buildIntoProject(model) {
  Undo.initEdit({ elements: [], textures: [], outliner: true });

  // Texture first (so faces can reference it).
  let texture = null;
  if (model.texture) {
    texture = new Texture({ name: model.texture.name }).fromDataURL(model.texture.dataUrl).add(false);
    if (model.texture.width)  Project.texture_width = model.texture.width;
    if (model.texture.height) Project.texture_height = model.texture.height;
  }
  if (model.cubes.some((c) => c.faces)) Project.box_uv = false; // per-face UV mode

  const bbGroups = [];
  model.groups.forEach((g, i) => {
    const group = new Group({ name: g.name || `bone_${i}`, origin: g.origin, rotation: g.rotation });
    group.addTo(g.parent != null ? bbGroups[g.parent] : undefined).init();
    bbGroups[i] = group;
  });

  const cubes = [];
  for (const c of model.cubes) {
    const cube = new Cube({ name: c.name, from: c.from, to: c.to, origin: c.origin, rotation: c.rotation });
    cube.addTo(bbGroups[c.group]).init();
    if (c.faces && texture) {
      for (const [name, face] of Object.entries(c.faces)) {
        if (!cube.faces[name]) continue;
        cube.faces[name].uv = face.uv;
        cube.faces[name].rotation = face.rotation;
        cube.faces[name].texture = texture.uuid;
      }
    }
    cubes.push(cube);
  }

  Canvas.updateAll();
  if (texture) Canvas.updateAllUVs && Canvas.updateAllUVs();
  Undo.finishEdit('Import glTF', { elements: cubes, textures: texture ? [texture] : [], outliner: true });
  return { groups: bbGroups, cubes, texture };
}
```

- [ ] **Step 2: Build + manual test**

Run: `npm run build`
Then in Blockbench: reload plugin, new Bedrock Entity project, import `bacteria.gltf`.
Expected: cubes appear textured; faces look correct (adjust `CONVENTION.flip`/face mapping or face `rotation` in Task 6/here if a face is mirrored or 90°-off).

- [ ] **Step 3: Commit**

```bash
git add src/adapter.js dist/gltf_importer.js
git commit -m "feat: apply texture and per-face UVs on import"
```

---

## Task 10: Reader — animations (Phase 3)

**Files:**
- Modify: `src/gltf-reader.js`
- Test: extend `test/reader.test.js`

- [ ] **Step 1: Write the failing test (append to `test/reader.test.js`)**

```js
test('sample: reads 3 animations with named tracks', () => {
  const scene = loadFixture();
  assert.equal(scene.animations.length, 3);
  const idle = scene.animations.find((a) => a.name.includes('idle'));
  assert.ok(idle, 'idle animation present');
  assert.ok(idle.length > 0, 'has length');
  const tracks = Object.values(idle.tracks);
  assert.ok(tracks.length > 0, 'has bone tracks');
  // at least one rotation keyframe somewhere
  assert.ok(tracks.some((t) => t.rotation.length > 0));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/reader.test.js`
Expected: FAIL — `scene.animations` empty.

- [ ] **Step 3: Add animation decoding to `src/gltf-reader.js`**

```js
function readAnimations(json, buffers) {
  if (!json.animations) return [];
  const nodeName = (i) => (json.nodes[i] && json.nodes[i].name) || `node_${i}`;
  return json.animations.map((anim, ai) => {
    const tracks = {};
    let length = 0;
    for (const ch of anim.channels) {
      const sampler = anim.samplers[ch.sampler];
      const times = readAccessor(json, buffers, sampler.input).data;
      const values = readAccessor(json, buffers, sampler.output);
      const name = nodeName(ch.target.node);
      const path = ch.target.path; // 'rotation' | 'translation' | 'scale'
      if (!tracks[name]) tracks[name] = { rotation: [], position: [], scale: [] };
      const n = values.ncomp;
      for (let k = 0; k < times.length; k++) {
        const t = times[k];
        length = Math.max(length, t);
        const v = values.data.slice(k * n, k * n + n);
        if (path === 'rotation') tracks[name].rotation.push({ t, q: v });
        else if (path === 'translation') tracks[name].position.push({ t, v });
        else if (path === 'scale') tracks[name].scale.push({ t, v });
      }
    }
    return { name: anim.name || `animation_${ai}`, length, tracks };
  });
}
```
Then in `readGltf` replace `animations: []` with `animations: readAnimations(json, buffers)`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/reader.test.js`
Expected: PASS — 3 animations, idle has bone tracks + rotation keys.

- [ ] **Step 5: Commit**

```bash
git add src/gltf-reader.js test/reader.test.js
git commit -m "feat: reader decodes glTF animation tracks"
```

---

## Task 11: Convert — animations to Blockbench keyframes (Phase 3)

Convert per-node TRS keyframes into `IMAnimation` tracks keyed by group index, with rotations as Euler degrees and positions in BB units. Positions/scales are emitted as **deltas from the rest pose** (Blockbench animator convention: keyframes are offsets from the bone's rest transform).

**Files:**
- Modify: `src/convert.js`
- Test: extend `test/convert.test.js`

- [ ] **Step 1: Write the failing test (append to `test/convert.test.js`)**

```js
test('animation: rotation keys become euler-degree keyframes on the right group', () => {
  const s = Math.sin(Math.PI / 4); // 90° about Y at t=0.5
  const scene = {
    roots: [node({ name: 'bone', box: { min: [0, 0, 0], max: [0.0625, 0.0625, 0.0625], faces: [] } })],
    texture: null,
    animations: [{
      name: 'test', length: 0.5,
      tracks: { bone: { rotation: [{ t: 0, q: [0, 0, 0, 1] }, { t: 0.5, q: [0, s, 0, s] }], position: [], scale: [] } },
    }],
  };
  const m = convert(scene);
  assert.equal(m.animations.length, 1);
  const groupIndex = m.groups.findIndex((g) => g.name === 'bone');
  const track = m.animations[0].tracks[groupIndex];
  assert.ok(track, 'track for bone group');
  assert.equal(track.rotation.length, 2);
  assert.equal(track.rotation[0].t, 0);
  assert.ok(Math.abs(Math.abs(track.rotation[1].value[1]) - 90) < 1e-2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/convert.test.js`
Expected: FAIL — `m.animations` is `[]`.

- [ ] **Step 3: Add animation conversion to `src/convert.js`**

```js
// Reuses applyPos / quatToBBEuler already imported at the top of convert.js (Task 4).
// Converts animation tracks after groups/cubes exist (needs nameToIndex + restAccum from the walk).
function convertAnimations(scene, nameToIndex, restAccum) {
  return scene.animations.map((anim) => {
    const tracks = {};
    for (const [nodeName, t] of Object.entries(anim.tracks)) {
      const gi = nameToIndex[nodeName];
      if (gi == null) continue;
      const out = { rotation: [], position: [], scale: [] };
      for (const k of t.rotation) out.rotation.push({ t: k.t, value: quatToBBEuler(k.q) });
      const rest = restAccum[nodeName] || [0, 0, 0];
      const restPx = applyPos(rest);
      for (const k of t.position) {
        const px = applyPos([rest[0] + k.v[0], rest[1] + k.v[1], rest[2] + k.v[2]]);
        out.position.push({ t: k.t, value: [px[0] - restPx[0], px[1] - restPx[1], px[2] - restPx[2]] });
      }
      for (const k of t.scale) out.scale.push({ t: k.t, value: [k.v[0], k.v[1], k.v[2]] });
      tracks[gi] = out;
    }
    return { name: anim.name, length: anim.length, loop: 'loop', tracks };
  });
}
```
Modify `convert` to record the maps during the walk and call `convertAnimations`:
```js
// At top of convert(): add
//   const nameToIndex = {};
//   const restAccum = {};
// Inside walk(), right after computing `accum` and `groupIndex`/push:
//   nameToIndex[node.name] = groupIndex;
//   restAccum[node.name] = accum;
// At the end, replace `animations: []` with:
//   animations: convertAnimations(scene, nameToIndex, restAccum),
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/convert.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convert.js test/convert.test.js
git commit -m "feat: convert glTF animations to Blockbench keyframe tracks"
```

---

## Task 12: Adapter — create Blockbench animations (Phase 3)

**Files:**
- Modify: `src/adapter.js`
- (Manual verification in Blockbench.)

- [ ] **Step 1: Add animation creation to `src/adapter.js`**

After cubes are created (and before/after `Canvas.updateAll()`), add:
```js
/* global Animation */
function buildAnimations(model, bbGroups) {
  for (const a of model.animations) {
    const anim = new Animation({ name: a.name, loop: a.loop, length: a.length }).add(false);
    for (const [gi, track] of Object.entries(a.tracks)) {
      const group = bbGroups[Number(gi)];
      if (!group) continue;
      const animator = anim.getBoneAnimator(group);
      for (const k of track.rotation) animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, 'rotation', false);
      for (const k of track.position) animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, 'position', false);
      for (const k of track.scale)    animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, 'scale', false);
    }
  }
}
```
Call `buildAnimations(model, bbGroups);` inside `buildIntoProject` (after cubes, before `Undo.finishEdit`). Guard the format: only run if `Format.animation_mode` (most entity formats) — otherwise skip with a quick message.

- [ ] **Step 2: Build + manual test**

Run: `npm run build`
In Blockbench: reload plugin, new Bedrock Entity project, import `bacteria.gltf`, open the **Animate** tab.
Expected: 3 animations listed; playing `idle`/`run`/`attack` animates the bones, matching the Sketchfab preview. If rotations look off, the same `CONVENTION.eulerOrder`/`eulerSign` fix from Task 6 applies (rotation conversion is shared).

- [ ] **Step 3: Commit**

```bash
git add src/adapter.js dist/gltf_importer.js
git commit -m "feat: create Blockbench keyframe animations on import"
```

---

## Task 13: Options dialog + edge cases (polish)

**Files:**
- Modify: `src/entry.js`, `src/convert.js`, `src/gltf-reader.js`

- [ ] **Step 1: Add an import options dialog in `src/entry.js`**

Before calling `Blockbench.import`, show a dialog to toggle animations and override scale:
```js
/* global Dialog */
new Dialog('gltf_import_opts', {
  title: 'Import glTF',
  form: {
    animations: { label: 'Import animations', type: 'checkbox', value: true },
    scale: { label: 'Scale (px per unit)', type: 'number', value: 16 },
  },
  onConfirm(opts) {
    this.hide();
    CONVENTION.scale = opts.scale; // import { CONVENTION } at top
    runImport({ animations: opts.animations });
  },
}).show();
```
Move the file-pick + import logic into a `runImport(opts)` helper; when `opts.animations === false`, skip `buildAnimations` (pass the flag through to the adapter).

- [ ] **Step 2: Handle edge cases in the reader/convert (append guards)**

- Non-box meshes: in `convert`, if a node has a `box` whose size is zero on any axis, skip the cube and count it: `skipped++`. Return `skipped` in the model; `entry` shows `Imported N cubes (M skipped)`.
- No texture: faces stay `null` (already handled) — geometry-only import still works.
- `.glb` import: already supported via `readtype:'binary'` + `parseGlb`.

- [ ] **Step 3: Build + manual test both paths**

Run: `npm run build`
Test: import `minecraft_backrooms_entity_howlerbacteria.glb` from Downloads (the `.glb` sibling) — confirm it imports too.

- [ ] **Step 4: Commit**

```bash
git add src/entry.js src/convert.js src/gltf-reader.js dist/gltf_importer.js
git commit -m "feat: import options dialog + edge-case handling"
```

---

## Task 14: README + final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# glTF/glb Importer for Blockbench

Imports a `.gltf`/`.glb` model into the **currently open** Blockbench project as
editable bones + cubes (position, size, pivot, rotation), with texture/UVs and
animations. Built for re-importing Minecraft models downloaded from Sketchfab.

## Install
1. Build: `npm install && npm run build`
2. Blockbench → **File → Plugins → Load Plugin from File** → `dist/gltf_importer.js`

## Use
1. Create a project (Bedrock Entity / Modded Entity / GeckoLib / Generic).
2. **File → Import → Import glTF/glb…** → pick your file.

## Limitations
- Expects box geometry (Minecraft-style). Non-box meshes import as bounding-box cubes.
- One base color texture; no PBR/skinning/morph targets.
- Animations are sampled keyframes (dense, not original sparse keys).

## Develop
- `npm test` — runs the pure-core test suite (`node --test`).
- `npm run build` — bundles `src/` → `dist/gltf_importer.js`.
```

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 3: Full manual run**

Reload plugin in Blockbench; import both `bacteria.gltf` and the `.glb`; confirm geometry, texture, and animations.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review Notes (coverage vs. spec)

- Geometry (pos/size/pivot/rotation + hierarchy): Tasks 3–6. ✓
- Texture + per-face UVs: Tasks 7–9. ✓
- Animations: Tasks 10–12. ✓
- Format-agnostic "import into open project": Task 5 (`buildIntoProject`), Task 12 guards animation-capable formats. ✓
- Coordinate calibration isolated to one module: Task 2 + Task 6. ✓
- Node test harness against the real sample: Tasks 3, 4, 7, 10. ✓
- Edge cases (no project, non-box, no texture, .glb): Task 5 (guard), Task 13. ✓
- Deliverable single bundled plugin: Task 0 + Task 5 build. ✓
```
