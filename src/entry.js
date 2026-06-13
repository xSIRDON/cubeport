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
