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
