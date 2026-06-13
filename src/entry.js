// Blockbench plugin entry: registers an "Import glTF/glb" action that imports into the open project.
/* global Plugin, Action, Blockbench, MenuBar, Project, Dialog */
import { readGltf } from './gltf-reader.js';
import { convert } from './convert.js';
import { buildIntoProject } from './adapter.js';
import { CONVENTION } from './convention.js';

let action;

Plugin.register('cubeport', {
  title: 'Cubeport',
  author: 'Nicholas Cerdon',
  description: 'Import glTF/glb models as editable cubes, bones, textures, and animations — for re-importing Minecraft-style models (e.g. from Sketchfab) as real editable boxes instead of raw meshes.',
  icon: 'fa-cubes',
  version: '1.0.0',
  variant: 'both',
  tags: ['Minecraft', 'Import', 'Animation'],
  min_version: '4.8.0',
  website: 'https://github.com/xSIRDON/cubeport',
  repository: 'https://github.com/xSIRDON/cubeport',
  bug_tracker: 'https://github.com/xSIRDON/cubeport/issues',
  onload() {
    action = new Action('import_gltf', {
      name: 'Import glTF/glb…',
      description: 'Import a .gltf/.glb model into the current project as cubes',
      icon: 'fa-cubes',
      click() {
        if (!Project) { Blockbench.showQuickMessage('Open or create a project first', 2000); return; }

        new Dialog('gltf_import_opts', {
          title: 'Import glTF',
          form: {
            animations: { label: 'Import animations', type: 'checkbox', value: true },
            scale: { label: 'Scale (px per unit)', type: 'number', value: CONVENTION.scale },
          },
          onConfirm(opts) {
            this.hide();
            CONVENTION.scale = opts.scale;
            runImport({ importAnimations: opts.animations });
          },
        }).show();
      },
    });
    MenuBar.addAction(action, 'file.import');
  },
  onunload() {
    if (action) action.delete();
  },
});

function runImport(opts) {
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
        const res = buildIntoProject(model, opts);
        const skipMsg = model.skipped > 0 ? ` (${model.skipped} skipped)` : '';
        Blockbench.showQuickMessage(`Imported ${res.cubes.length} cubes${skipMsg}`, 2000);
      } catch (e) {
        console.error(e);
        Blockbench.showMessageBox({ title: 'glTF import failed', message: String(e && e.message || e) });
      }
    },
  );
}
