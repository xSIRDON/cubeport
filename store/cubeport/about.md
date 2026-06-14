# Cubeport

**Import glTF/glb models into Blockbench as editable cubes** — real box elements with
correct position, size, pivot, and rotation, organized into bones, with textures and
animations brought across too.

## Why

Sites like Sketchfab only hand you a `.gltf`/`.glb`. Blockbench's existing glTF importer
brings models in as **raw meshes**, so a model that was originally made out of cubes is no
longer editable as cubes — you'd have to recreate every box by hand, copying its position,
size, pivot, and rotation one at a time.

Cubeport reconstructs the actual cubes. Make a project (Bedrock Entity, Modded Entity,
GeckoLib Animated Model, or Generic), then **File → Import → Import glTF/glb…**, and your
model comes in as editable bones + cubes with its texture and animations applied.

## What it brings over

- **Geometry** — every box as an editable cube: position, size, pivot, rotation, nested in
  the original bone hierarchy.
- **Texture + UVs** — the embedded/linked texture, with each face's UVs mapped (per-face UV).
- **Animations** — glTF animation clips converted to Blockbench keyframe animations.

## ⚠️ Works on cube-based models only

Cubeport rebuilds **cubes**, so the model has to actually *be* made of cubes/boxes. It is
**not** a mesh-to-cubes (voxelizing) converter.

- ✅ **Works:** Minecraft models (Bedrock/Java entities, blocks, items), and anything built
  in Blockbench / MagicaVoxel / other box tools and exported to glTF.
- ❌ **Won't work:** sculpted, organic, or scanned models — which is **most Sketchfab
  models** (dragons, characters, high-poly props). Each non-box mesh just becomes one
  bounding-box cube, not a faithful import.

**Rule of thumb:** if it already looks blocky, Cubeport will love it; if it looks smooth and
sculpted, it won't. For raw mesh import, use the separate `gltf_importer` plugin.

## Usage

1. Create or open a project (Bedrock Entity / Modded Entity / GeckoLib / Generic).
2. **File → Import → Import glTF/glb…**
3. Choose your `.gltf` or `.glb`. Optionally toggle animations or override the scale
   (default 16 px per unit).

## Limitations

- Expects box geometry; non-box meshes become bounding-box cubes.
- One base color texture; no PBR/skinning/morph targets.
- Only the first primitive of each mesh is imported.
- Per-face UV rotation/mirroring is not auto-detected; mirror-modeled faces may show the
  texture un-mirrored.
- Animations are sampled keyframes (dense, not the original sparse keys).

## Source

Open source (MIT): https://github.com/xSIRDON/cubeport
