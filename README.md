# Cubeport

> 🟩 **Completely vibe-coded for a community in need.** Cubeport was built end-to-end with
> AI assistance (Claude) to fill a real gap for Minecraft modelers — bringing glTF models
> back in as editable cubes instead of dead meshes.

**Import glTF/glb models into Blockbench as editable cubes** — real box elements with
correct position, size, pivot, and rotation, organized into bones, with textures and
animations brought across too.

Sites like Sketchfab only hand you a `.gltf`/`.glb`, and Blockbench's existing glTF
importer brings models in as **raw meshes** — so a model originally built from cubes is no
longer editable as cubes. Cubeport reconstructs the actual cubes, so you don't have to
recreate every box by hand.

## ⚠️ Works on cube-based models only

Cubeport rebuilds **cubes**, so the source model has to actually *be* made of cubes/boxes.
It is **not** a mesh-to-cubes (voxelizing) converter — it won't turn a sculpted model into
a blocky one.

✅ **Works great:**
- Minecraft models — Bedrock/Java entities, blocks, items
- Models built in Blockbench / MagicaVoxel / other box tools and exported to glTF
- Anything whose geometry is made of axis-aligned boxes

❌ **Won't work (most Sketchfab models are like this):**
- Sculpted, organic, or 3D-scanned models (dragons, characters, props)
- High-poly / arbitrary triangle meshes

For non-box models, each mesh just becomes a single bounding-box cube — a crude blocky
stand-in, **not** a faithful import. If you want raw mesh import instead, use the separate
[`gltf_importer`](https://github.com/JannisX11/blockbench-plugins) plugin.

> **Rule of thumb:** if it already looks blocky, Cubeport will love it. If it looks smooth
> and sculpted, it won't.

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
