(() => {
  // src/math.js
  function quatToMat3([x, y, z, w]) {
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return [
      1 - (yy + zz),
      xy - wz,
      xz + wy,
      xy + wz,
      1 - (xx + zz),
      yz - wx,
      xz - wy,
      yz + wx,
      1 - (xx + yy)
    ];
  }
  var clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function quatToEuler(q, order = "XYZ") {
    const m = quatToMat3(q);
    const m11 = m[0], m12 = m[1], m13 = m[2];
    const m21 = m[3], m22 = m[4], m23 = m[5];
    const m31 = m[6], m32 = m[7], m33 = m[8];
    let x, y, z;
    if (order === "XYZ") {
      y = Math.asin(clamp(m13, -1, 1));
      if (Math.abs(m13) < 0.9999999) {
        x = Math.atan2(-m23, m33);
        z = Math.atan2(-m12, m11);
      } else {
        x = Math.atan2(m32, m22);
        z = 0;
      }
    } else if (order === "ZYX") {
      y = Math.asin(-clamp(m31, -1, 1));
      if (Math.abs(m31) < 0.9999999) {
        x = Math.atan2(m32, m33);
        z = Math.atan2(m21, m11);
      } else {
        x = 0;
        z = Math.atan2(-m12, m22);
      }
    } else {
      throw new Error(`Unsupported euler order: ${order}`);
    }
    return [x, y, z];
  }

  // src/gltf-reader.js
  var GLB_MAGIC = 1179937895;
  function parseGlb(arrayBuffer) {
    const dv = new DataView(arrayBuffer);
    const length = dv.getUint32(8, true);
    let offset = 12, json = null, bin = null;
    while (offset < length) {
      const chunkLen = dv.getUint32(offset, true);
      const chunkType = dv.getUint32(offset + 4, true);
      const start = offset + 8;
      if (chunkType === 1313821514) {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, start, chunkLen)));
      } else if (chunkType === 5130562) {
        bin = arrayBuffer.slice(start, start + chunkLen);
      }
      offset = start + chunkLen + (4 - chunkLen % 4) % 4;
    }
    return { json, bin };
  }
  function base64ToArrayBuffer(b64) {
    const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function resolveBuffers(json, glbBin, externalLoader) {
    return (json.buffers || []).map((b) => {
      if (!b.uri) return glbBin;
      if (b.uri.startsWith("data:")) {
        return base64ToArrayBuffer(b.uri.slice(b.uri.indexOf(",") + 1));
      }
      if (externalLoader) return externalLoader(b.uri);
      throw new Error(`Cannot resolve external buffer: ${b.uri}`);
    });
  }
  var COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  var NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
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
    const read = (off) => isFloat ? dv["getFloat32"](off, true) : Ctor === Uint16Array ? dv.getUint16(off, true) : Ctor === Uint32Array ? dv.getUint32(off, true) : Ctor === Int16Array ? dv.getInt16(off, true) : Ctor === Uint8Array ? dv.getUint8(off) : dv.getInt8(off);
    for (let i = 0; i < acc.count; i++) {
      for (let c = 0; c < ncomp; c++) {
        out[i * ncomp + c] = read(baseOffset + i * stride + c * Ctor.BYTES_PER_ELEMENT);
      }
    }
    return { data: out, count: acc.count, ncomp, min: acc.min, max: acc.max };
  }
  function decomposeMatrix(m) {
    const t = [m[12], m[13], m[14]];
    let sx = Math.hypot(m[0], m[1], m[2]);
    const sy = Math.hypot(m[4], m[5], m[6]);
    const sz = Math.hypot(m[8], m[9], m[10]);
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    if (det < 0) sx = -sx;
    const r = [[m[0] / sx, m[4] / sy, m[8] / sz], [m[1] / sx, m[5] / sy, m[9] / sz], [m[2] / sx, m[6] / sy, m[10] / sz]];
    const tr = r[0][0] + r[1][1] + r[2][2];
    let q;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      q = [(r[2][1] - r[1][2]) / s, (r[0][2] - r[2][0]) / s, (r[1][0] - r[0][1]) / s, 0.25 * s];
    } else if (r[0][0] > r[1][1] && r[0][0] > r[2][2]) {
      const s = Math.sqrt(1 + r[0][0] - r[1][1] - r[2][2]) * 2;
      q = [0.25 * s, (r[0][1] + r[1][0]) / s, (r[0][2] + r[2][0]) / s, (r[2][1] - r[1][2]) / s];
    } else if (r[1][1] > r[2][2]) {
      const s = Math.sqrt(1 + r[1][1] - r[0][0] - r[2][2]) * 2;
      q = [(r[0][1] + r[1][0]) / s, 0.25 * s, (r[1][2] + r[2][1]) / s, (r[0][2] - r[2][0]) / s];
    } else {
      const s = Math.sqrt(1 + r[2][2] - r[0][0] - r[1][1]) * 2;
      q = [(r[0][2] + r[2][0]) / s, (r[1][2] + r[2][1]) / s, 0.25 * s, (r[1][0] - r[0][1]) / s];
    }
    return { translation: t, rotation: q, scale: [sx, sy, sz] };
  }
  function nodeTRS(n) {
    if (n.matrix) return decomposeMatrix(n.matrix);
    return {
      translation: n.translation || [0, 0, 0],
      rotation: n.rotation || [0, 0, 0, 1],
      scale: n.scale || [1, 1, 1]
    };
  }
  function meshBox(json, buffers, meshIndex) {
    const prim = json.meshes[meshIndex].primitives[0];
    const posIdx = prim.attributes.POSITION;
    const acc = json.accessors[posIdx];
    if (acc.min && acc.max) return { min: acc.min.slice(), max: acc.max.slice(), faces: [] };
    const { data } = readAccessor(json, buffers, posIdx);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], data[i + c]);
        max[c] = Math.max(max[c], data[i + c]);
      }
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
      box: n.mesh != null ? meshBox(json, buffers, n.mesh) : null,
      children: (n.children || []).map((c) => buildNode(json, buffers, c))
    };
  }
  function readGltf(arrayBuffer, opts = {}) {
    const dv = new DataView(arrayBuffer);
    let json, bin = null;
    if (dv.getUint32(0, true) === GLB_MAGIC) ({ json, bin } = parseGlb(arrayBuffer));
    else json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
    const buffers = resolveBuffers(json, bin, opts.externalLoader);
    const sceneDef = json.scenes[json.scene ?? 0];
    const roots = sceneDef.nodes.map((i) => buildNode(json, buffers, i));
    return { roots, texture: null, animations: [], _json: json, _buffers: buffers };
  }

  // src/convention.js
  var CONVENTION = {
    scale: 16,
    // 1 glTF unit = 16 px
    flip: [1, 1, 1],
    // per-axis sign for positions
    eulerOrder: "XYZ",
    // 'XYZ' | 'ZYX'
    eulerSign: [1, 1, 1]
    // per-axis sign for rotation degrees
  };
  function applyPos([x, y, z]) {
    const { scale: s, flip: f } = CONVENTION;
    return [x * s * f[0], y * s * f[1], z * s * f[2]];
  }
  function quatToBBEuler(q) {
    const e = quatToEuler(q, CONVENTION.eulerOrder);
    const s = CONVENTION.eulerSign;
    return [e[0] * 180 / Math.PI * s[0], e[1] * 180 / Math.PI * s[1], e[2] * 180 / Math.PI * s[2]];
  }

  // src/convert.js
  function convert(scene) {
    const groups = [];
    const cubes = [];
    function walk(node, parentAccum, parentIndex) {
      const accum = [
        parentAccum[0] + node.translation[0],
        parentAccum[1] + node.translation[1],
        parentAccum[2] + node.translation[2]
      ];
      const origin = applyPos(accum);
      const groupIndex = groups.length;
      groups.push({
        name: node.name,
        origin,
        rotation: quatToBBEuler(node.rotation),
        parent: parentIndex
      });
      if (node.box) {
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

  // src/adapter.js
  function buildIntoProject(model) {
    const affected = { elements: [], outliner: true, group: void 0 };
    Undo.initEdit(affected);
    const bbGroups = [];
    model.groups.forEach((g, i) => {
      const group = new Group({ name: g.name || `bone_${i}`, origin: g.origin, rotation: g.rotation });
      const parent = g.parent != null ? bbGroups[g.parent] : "root";
      group.addTo(parent === "root" ? void 0 : parent).init();
      bbGroups[i] = group;
    });
    const cubes = [];
    for (const c of model.cubes) {
      const cube = new Cube({ name: c.name, from: c.from, to: c.to, origin: c.origin, rotation: c.rotation });
      cube.addTo(bbGroups[c.group]).init();
      cubes.push(cube);
    }
    Canvas.updateAll();
    Undo.finishEdit("Import glTF", { elements: cubes, outliner: true });
    return { groups: bbGroups, cubes };
  }

  // src/entry.js
  var action;
  Plugin.register("gltf_importer", {
    title: "glTF/glb Importer",
    author: "Nicholas Cerdon",
    description: "Import glTF/glb models as editable bones + cubes into the open project.",
    icon: "fa-cubes",
    version: "0.1.0",
    variant: "both",
    onload() {
      action = new Action("import_gltf", {
        name: "Import glTF/glb\u2026",
        description: "Import a .gltf/.glb model into the current project as cubes",
        icon: "fa-cubes",
        click() {
          if (!Project) {
            Blockbench.showQuickMessage("Open or create a project first", 2e3);
            return;
          }
          Blockbench.import(
            { extensions: ["gltf", "glb"], type: "glTF Model", readtype: "binary" },
            (files) => {
              try {
                const f = files[0];
                const ab = f.content instanceof ArrayBuffer ? f.content : f.content.buffer.slice(f.content.byteOffset, f.content.byteOffset + f.content.byteLength);
                const scene = readGltf(ab);
                const model = convert(scene);
                const res = buildIntoProject(model);
                Blockbench.showQuickMessage(`Imported ${res.cubes.length} cubes`, 2e3);
              } catch (e) {
                console.error(e);
                Blockbench.showMessageBox({ title: "glTF import failed", message: String(e && e.message || e) });
              }
            }
          );
        }
      });
      MenuBar.addAction(action, "file.import");
    },
    onunload() {
      if (action) action.delete();
    }
  });
})();
