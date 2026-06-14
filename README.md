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

## ⚠️ Made for Blockbench-exported Minecraft models

Cubeport is built for one specific round-trip: a **Minecraft model made in Blockbench**,
**exported to glTF/glb** (for example uploaded to Sketchfab), brought **back** into
Blockbench as editable cubes. That's the case it's verified on — because the scale
(16 px = 1 block) and the axis/rotation conventions it expects are exactly what Blockbench's
own glTF exporter produces.

✅ **Works:**
- Minecraft models originally made in Blockbench (Bedrock/Java entities, blocks, items),
  exported to glTF/glb and re-imported.

❌ **Won't work:**
- Sculpted, organic, or 3D-scanned models — i.e. **most Sketchfab models** (dragons,
  characters, high-poly props). Cubeport rebuilds cubes; it does **not** voxelize meshes.
- Anything not made of axis-aligned boxes.

Cube models made in *other* tools may import, but aren't guaranteed — their scale or
orientation can differ from Blockbench's conventions. For raw mesh import of any glTF, use
the separate [`gltf_importer`](https://github.com/JannisX11/blockbench-plugins) plugin.

> **Rule of thumb:** if it was built out of cubes in Blockbench and looks blocky, Cubeport
> will love it. If it looks smooth and sculpted, it won't.

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
