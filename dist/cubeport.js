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
    const ncompTop = NUM_COMPONENTS[acc.type];
    if (acc.bufferView == null) {
      return { data: new Array(acc.count * ncompTop).fill(0), count: acc.count, ncomp: ncompTop, min: acc.min, max: acc.max };
    }
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
  function pngSize(arrayBuffer) {
    const b = new Uint8Array(arrayBuffer);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (b[i] !== sig[i]) return null;
    const dv = new DataView(arrayBuffer);
    return { width: dv.getUint32(16, false), height: dv.getUint32(20, false) };
  }
  function arrayBufferToDataUrl(arrayBuffer, mime) {
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
    return `data:${mime};base64,${b64}`;
  }
  function readTexture(json, buffers, opts) {
    if (!json.images || !json.images.length) return null;
    const img = json.images[0];
    let ab, mime = img.mimeType || "image/png";
    if (img.uri && img.uri.startsWith("data:")) {
      mime = img.uri.slice(5, img.uri.indexOf(";"));
      ab = base64ToArrayBuffer(img.uri.slice(img.uri.indexOf(",") + 1));
    } else if (img.bufferView != null) {
      const view = json.bufferViews[img.bufferView];
      ab = buffers[view.buffer].slice(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    } else if (img.uri && opts.externalLoader) {
      ab = opts.externalLoader(img.uri);
    } else {
      return null;
    }
    const size = pngSize(ab) || { width: null, height: null };
    const dataUrl = img.uri && img.uri.startsWith("data:") ? img.uri : arrayBufferToDataUrl(ab, mime);
    return { name: json.images[0].name || "texture", dataUrl, width: size.width, height: size.height };
  }
  function readFaces(json, buffers, meshIndex) {
    const prim = json.meshes[meshIndex].primitives[0];
    if (prim.attributes.TEXCOORD_0 == null || prim.attributes.NORMAL == null) return [];
    const pos = readAccessor(json, buffers, prim.attributes.POSITION).data;
    const nor = readAccessor(json, buffers, prim.attributes.NORMAL).data;
    const uv = readAccessor(json, buffers, prim.attributes.TEXCOORD_0).data;
    const idx = prim.indices != null ? readAccessor(json, buffers, prim.indices).data : null;
    const vertCount = pos.length / 3;
    const order = idx || Array.from({ length: vertCount }, (_, i) => i);
    const faceKey = (n) => {
      const ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
      const d = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
      return `${d}:${Math.sign(n[d])}`;
    };
    const seen = /* @__PURE__ */ new Map();
    for (const vi of order) {
      const n = [nor[vi * 3], nor[vi * 3 + 1], nor[vi * 3 + 2]];
      const k = faceKey(n);
      if (!seen.has(k)) seen.set(k, { normal: n, verts: /* @__PURE__ */ new Set() });
      seen.get(k).verts.add(vi);
    }
    const faces = [];
    for (const { normal, verts } of seen.values()) {
      const vs = [...verts].slice(0, 4);
      faces.push({
        normal,
        corners: vs.map((vi) => [pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]]),
        uvs: vs.map((vi) => [uv[vi * 2], uv[vi * 2 + 1]])
      });
    }
    return faces;
  }
  function meshBox(json, buffers, meshIndex) {
    const prim = json.meshes[meshIndex].primitives[0];
    const posIdx = prim.attributes.POSITION;
    const acc = json.accessors[posIdx];
    if (acc.min && acc.max) return { min: acc.min.slice(), max: acc.max.slice(), faces: readFaces(json, buffers, meshIndex) };
    const { data } = readAccessor(json, buffers, posIdx);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], data[i + c]);
        max[c] = Math.max(max[c], data[i + c]);
      }
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
      box: n.mesh != null ? meshBox(json, buffers, n.mesh) : null,
      children: (n.children || []).map((c) => buildNode(json, buffers, c))
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
        const nodeIndex = ch.target.node;
        const path = ch.target.path;
        if (!tracks[nodeIndex]) tracks[nodeIndex] = { rotation: [], position: [], scale: [] };
        const n = values.ncomp;
        for (let k = 0; k < times.length; k++) {
          const t = times[k];
          length = Math.max(length, t);
          const v = values.data.slice(k * n, k * n + n);
          if (path === "rotation") tracks[nodeIndex].rotation.push({ t, q: v });
          else if (path === "translation") tracks[nodeIndex].position.push({ t, v });
          else if (path === "scale") tracks[nodeIndex].scale.push({ t, v });
        }
      }
      return { name: anim.name || `animation_${ai}`, length, tracks };
    });
  }
  function readGltf(arrayBuffer, opts = {}) {
    const dv = new DataView(arrayBuffer);
    let json, bin = null;
    if (dv.getUint32(0, true) === GLB_MAGIC) ({ json, bin } = parseGlb(arrayBuffer));
    else json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
    const buffers = resolveBuffers(json, bin, opts.externalLoader);
    const sceneDef = json.scenes && json.scenes[json.scene ?? 0] || { nodes: [] };
    const roots = (sceneDef.nodes || []).map((i) => buildNode(json, buffers, i));
    return { roots, texture: readTexture(json, buffers, opts), animations: readAnimations(json, buffers), _json: json, _buffers: buffers };
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
  function bbFaceName(normal) {
    const f = CONVENTION.flip;
    const n = [normal[0] * f[0], normal[1] * f[1], normal[2] * f[2]];
    const ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
    const d = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
    const s = Math.sign(n[d]);
    if (d === 0) return s >= 0 ? "east" : "west";
    if (d === 1) return s >= 0 ? "up" : "down";
    return s >= 0 ? "south" : "north";
  }
  function faceToUv(face, tex) {
    const us = face.uvs.map((p) => p[0] * tex.width);
    const vs = face.uvs.map((p) => p[1] * tex.height);
    return {
      uv: [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)],
      rotation: 0
      // refined in calibration if a texture looks rotated
    };
  }
  function buildFaces(box, tex) {
    if (!tex || !tex.width || !tex.height || !box.faces || !box.faces.length) return null;
    const out = {};
    for (const face of box.faces) out[bbFaceName(face.normal)] = faceToUv(face, tex);
    return out;
  }
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
        for (let comp = 0; comp < 3; comp++) {
          for (let i = 1; i < out.rotation.length; i++) {
            let d = out.rotation[i].value[comp] - out.rotation[i - 1].value[comp];
            while (d > 180) {
              out.rotation[i].value[comp] -= 360;
              d -= 360;
            }
            while (d < -180) {
              out.rotation[i].value[comp] += 360;
              d += 360;
            }
          }
        }
        for (const k of t.position) {
          out.position.push({ t: k.t, value: applyPos([k.v[0] - lT[0], k.v[1] - lT[1], k.v[2] - lT[2]]) });
        }
        for (const k of t.scale) out.scale.push({ t: k.t, value: [k.v[0], k.v[1], k.v[2]] });
        tracks[gi] = out;
      }
      return { name: anim.name, length: anim.length, loop: "loop", tracks };
    });
  }
  function convert(scene) {
    const groups = [];
    const cubes = [];
    let skipped = 0;
    const indexToGroup = {};
    const restRot = {};
    const localTrans = {};
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
      if (node.gltfIndex != null) {
        indexToGroup[node.gltfIndex] = groupIndex;
        restRot[node.gltfIndex] = groups[groupIndex].rotation;
        localTrans[node.gltfIndex] = node.translation;
      }
      if (node.box) {
        const lo = applyPos([accum[0] + node.box.min[0], accum[1] + node.box.min[1], accum[2] + node.box.min[2]]);
        const hi = applyPos([accum[0] + node.box.max[0], accum[1] + node.box.max[1], accum[2] + node.box.max[2]]);
        const from = [Math.min(lo[0], hi[0]), Math.min(lo[1], hi[1]), Math.min(lo[2], hi[2])];
        const to = [Math.max(lo[0], hi[0]), Math.max(lo[1], hi[1]), Math.max(lo[2], hi[2])];
        const isDegenerate = to[0] - from[0] < 1e-6 || to[1] - from[1] < 1e-6 || to[2] - from[2] < 1e-6;
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

  // src/adapter.js
  function buildAnimations(model, bbGroups) {
    let made = 0;
    for (const a of model.animations) {
      const anim = new Animation({ name: a.name, loop: a.loop, length: a.length }).add(false);
      for (const [gi, track] of Object.entries(a.tracks)) {
        const group = bbGroups[Number(gi)];
        if (!group) continue;
        const animator = anim.getBoneAnimator(group);
        for (const k of track.rotation) animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, "rotation", false, false);
        for (const k of track.position) animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, "position", false, false);
        for (const k of track.scale) animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, "scale", false, false);
      }
      made++;
    }
    return made;
  }
  function buildIntoProject(model, options = {}) {
    const prev = { box_uv: Project.box_uv, tw: Project.texture_width, th: Project.texture_height };
    Undo.initEdit({ elements: [], textures: [], outliner: true });
    try {
      let texture = null;
      if (model.texture) {
        texture = new Texture({ name: model.texture.name }).fromDataURL(model.texture.dataUrl).add(false);
        if (model.texture.width) Project.texture_width = model.texture.width;
        if (model.texture.height) Project.texture_height = model.texture.height;
      }
      if (model.cubes.some((c) => c.faces)) Project.box_uv = false;
      const bbGroups = [];
      model.groups.forEach((g, i) => {
        const group = new Group({ name: g.name || `bone_${i}`, origin: g.origin, rotation: g.rotation });
        group.addTo(g.parent != null ? bbGroups[g.parent] : void 0).init();
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
      let animCount = 0;
      if (options.importAnimations !== false && model.animations && model.animations.length) {
        if (typeof Format !== "undefined" && Format && Format.animation_mode === false) {
          Blockbench.showQuickMessage("Imported geometry; this format has no animation support", 2500);
        } else {
          animCount = buildAnimations(model, bbGroups);
        }
      }
      Canvas.updateAll();
      if (texture) Canvas.updateAllUVs && Canvas.updateAllUVs();
      Undo.finishEdit("Import glTF", { elements: cubes, textures: texture ? [texture] : [], outliner: true });
      return { groups: bbGroups, cubes, texture, animations: animCount };
    } catch (e) {
      Project.box_uv = prev.box_uv;
      Project.texture_width = prev.tw;
      Project.texture_height = prev.th;
      if (typeof Undo.cancelEdit === "function") Undo.cancelEdit();
      else Undo.finishEdit("Import glTF (failed)");
      throw e;
    }
  }

  // src/entry.js
  var action;
  Plugin.register("cubeport", {
    title: "Cubeport",
    author: "Nicholas Cerdon",
    description: "Import CUBE-BASED glTF/glb models into Blockbench as editable cubes, bones, textures, and animations \u2014 for re-importing Minecraft-style models (e.g. from Sketchfab). Works on box geometry only, not sculpted/organic meshes.",
    icon: "fa-cubes",
    version: "1.0.0",
    variant: "both",
    tags: ["Minecraft", "Import", "Animation"],
    min_version: "4.8.0",
    website: "https://github.com/xSIRDON/cubeport",
    repository: "https://github.com/xSIRDON/cubeport",
    bug_tracker: "https://github.com/xSIRDON/cubeport/issues",
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
          new Dialog("gltf_import_opts", {
            title: "Import glTF",
            form: {
              animations: { label: "Import animations", type: "checkbox", value: true },
              scale: { label: "Scale (px per unit)", type: "number", value: CONVENTION.scale }
            },
            onConfirm(opts) {
              this.hide();
              CONVENTION.scale = opts.scale;
              runImport({ importAnimations: opts.animations });
            }
          }).show();
        }
      });
      MenuBar.addAction(action, "file.import");
    },
    onunload() {
      if (action) action.delete();
    }
  });
  function runImport(opts) {
    Blockbench.import(
      { extensions: ["gltf", "glb"], type: "glTF Model", readtype: "binary" },
      (files) => {
        try {
          const f = files[0];
          const ab = f.content instanceof ArrayBuffer ? f.content : f.content.buffer.slice(f.content.byteOffset, f.content.byteOffset + f.content.byteLength);
          const scene = readGltf(ab);
          const model = convert(scene);
          const res = buildIntoProject(model, opts);
          const skipMsg = model.skipped > 0 ? ` (${model.skipped} skipped)` : "";
          Blockbench.showQuickMessage(`Imported ${res.cubes.length} cubes${skipMsg}`, 2e3);
        } catch (e) {
          console.error(e);
          Blockbench.showMessageBox({ title: "glTF import failed", message: String(e && e.message || e) });
        }
      }
    );
  }
})();
