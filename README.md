# Cubeport

**Import glTF/glb models into Blockbench as editable cubes** — real box elements with
correct position, size, pivot, and rotation, organized into bones, with textures and
animations brought across too.

Sites like Sketchfab only hand you a `.gltf`/`.glb`, and Blockbench's existing glTF
importer brings models in as **raw meshes** — so a model originally built from cubes is no
longer editable as cubes. Cubeport reconstructs the actual cubes, so you don't have to
recreate every box by hand.

**Best for:** box-based / Minecraft-style models — especially ones made in a voxel/box tool
and exported to glTF. Arbitrary sculpted meshes import as one bounding-box cube each (this
is not a general mesh importer — use the `gltf_importer` plugin for that).

## Install

**From source:**
1. `npm install && npm run build`
2. Blockbench → **File → Plugins → Load Plugin from File** → `dist/cubeport.js`

(Once published, it will also be installable from the in-app Plugin store.)

## Use
1. Create a project (Bedrock Entity / Modded Entity / GeckoLib / Generic).
2. **File → Import → Import glTF/glb…** → pick your file.
3. An options dialog lets you toggle animation import and override the scale (default: 16 px per glTF unit).

## What it brings over
- **Geometry** — every box as an editable cube (position, size, pivot, rotation), nested in the bone hierarchy.
- **Texture + UVs** — embedded/linked texture, with each face's UVs mapped (per-face UV).
- **Animations** — glTF clips converted to Blockbench keyframe animations.

## Limitations
- Expects box geometry (Minecraft-style). Non-box meshes import as bounding-box cubes.
- One base color texture; no PBR/skinning/morph targets.
- Only the first primitive of each mesh is imported (multi-primitive meshes lose extra primitives).
- Per-face UV rotation/mirroring is not auto-detected; mirror-modeled faces may show the texture un-mirrored.
- Single-keyframe animations may have zero length.

## How it works
A pure, Node-tested core (`src/math.js`, `src/convention.js`, `src/gltf-reader.js`,
`src/convert.js`) parses the glTF and computes Blockbench cubes/bones/keyframes; a thin
runtime adapter (`src/adapter.js`, `src/entry.js`) creates the objects in the open project.
esbuild bundles everything into `dist/cubeport.js`.

## Develop
- `npm test` — runs the pure-core test suite (`node --test`).
- `npm run build` — bundles `src/` → `dist/cubeport.js`.

## License
[MIT](LICENSE)
