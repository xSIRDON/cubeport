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
