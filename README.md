# glTF/glb Importer for Blockbench

Imports a `.gltf`/`.glb` model into the **currently open** Blockbench project as
editable bones + cubes (position, size, pivot, rotation), with texture/UVs and
animations. Built for re-importing Minecraft models downloaded from Sketchfab.

**Best for:** box-based / Minecraft-style models — especially ones made in a voxel
tool and exported to glTF. Arbitrary sculpted meshes import as one bounding-box
cube each (the mesh geometry is approximated by its axis-aligned bounding box).

## Install
1. Build: `npm install && npm run build`
2. Blockbench → **File → Plugins → Load Plugin from File** → `dist/gltf_importer.js`

## Use
1. Create a project (Bedrock Entity / Modded Entity / GeckoLib / Generic).
2. **File → Import → Import glTF/glb…** → pick your file.
3. An options dialog lets you toggle animation import and override the scale (default: 16 px per glTF unit).

## Limitations
- Expects box geometry (Minecraft-style). Non-box meshes import as bounding-box cubes.
- One base color texture; no PBR/skinning/morph targets.
- Animations are sampled keyframes (dense, not original sparse keys).

## Develop
- `npm test` — runs the pure-core test suite (`node --test`).
- `npm run build` — bundles `src/` → `dist/gltf_importer.js`.
