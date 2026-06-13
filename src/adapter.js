/* global Group, Cube, Texture, Project, Undo, Canvas, Animation, Format, Blockbench */

// createKeyframe(value, time, channel, undo, select) — pass undo=false (we wrap the whole
// import in one Undo) and select=false (don't select hundreds of keyframes).
function buildAnimations(model, bbGroups) {
  let made = 0;
  for (const a of model.animations) {
    const anim = new Animation({ name: a.name, loop: a.loop, length: a.length }).add(false);
    for (const [gi, track] of Object.entries(a.tracks)) {
      const group = bbGroups[Number(gi)];
      if (!group) continue;
      const animator = anim.getBoneAnimator(group);
      for (const k of track.rotation) animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, 'rotation', false, false);
      for (const k of track.position) animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, 'position', false, false);
      for (const k of track.scale)    animator.createKeyframe({ x: k.value[0], y: k.value[1], z: k.value[2] }, k.t, 'scale', false, false);
    }
    made++;
  }
  return made;
}

export function buildIntoProject(model, options = {}) {
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

  let animCount = 0;
  if (options.importAnimations !== false && model.animations && model.animations.length) {
    if (typeof Format !== 'undefined' && Format && Format.animation_mode === false) {
      Blockbench.showQuickMessage('Imported geometry; this format has no animation support', 2500);
    } else {
      animCount = buildAnimations(model, bbGroups);
    }
  }

  Canvas.updateAll();
  if (texture) Canvas.updateAllUVs && Canvas.updateAllUVs();
  Undo.finishEdit('Import glTF', { elements: cubes, textures: texture ? [texture] : [], outliner: true });
  return { groups: bbGroups, cubes, texture, animations: animCount };
}
