# glTF → Blockbench Importer Plugin — Design

- **Date:** 2026-06-13
- **Status:** Approved (design); pending implementation plan
- **Author:** Nicholas Cerdon (with Claude)

## Problem

Sketchfab (and similar sites) only supply models as glTF/glb. When you bring one
into Blockbench it shows up as a static mesh — the cubes do **not** come in as
editable Blockbench cubes. Today the only way to make the model editable is to
manually recreate every cube one by one, copying its position, size, pivot point,
and rotation by hand. For a model like the sample (`bacteria`, ~98 cubes) that is
hours of tedious, error-prone work.

No existing Blockbench plugin does this conversion for Minecraft-style models.

## Goal

A Blockbench plugin that imports a `.gltf`/`.glb` file **into the currently open
project** as real, editable bones and cubes, bringing over:

1. **Geometry** — every cube with correct position, size, pivot, and rotation,
   nested in the original bone hierarchy.
2. **Texture + UVs** — the embedded/linked texture, with each cube's face UVs
   mapped so the model looks right immediately.
3. **Animations** — the baked glTF animation clips converted to Blockbench
   keyframe animations.

### Non-goals

- Not a standalone/external converter — it must merge into the open project.
- Not glTF **export** (Blockbench already exports glTF natively).
- Not skinning/skeletal vertex weights, morph targets, PBR material conversion,
  cameras, or lights. Minecraft models are rigid box hierarchies; we ignore the
  rest.
- Not box-UV reconstruction (we use per-face UV — see Texture section).

## Source file analysis (sample: `bacteria/source/model.gltf`)

Confirmed by inspecting the user's real Sketchfab download (a Blockbench-made
Minecraft Bedrock entity, round-tripped through glTF):

- 130 nodes, 98 meshes, 1 material, 1 embedded 64×64 PNG (data URI), 3 animations
  (`animation.howler.idle`, `animation.howler.run`, `animation.howler.attack`).
- **Each cube is a glTF node** carrying `translation` (pivot) + `rotation`
  (quaternion), with a box mesh: exactly **24 vertices / 36 indices** (6 faces).
- **Geometry bounding box × 16 yields exact integer pixel sizes** (`10×4×14`,
  `1×6×1`, `1×5×1`, …) → confirms scale factor 16 (1 glTF unit = 16 px = 1 block).
- `TEXCOORD_0` present, normalized `[0,1]` → multiply by texture size for BB pixels.
- Material is `MASK`/`doubleSided` with a `baseColorTexture` — standard Minecraft.
- ~32 nodes have no mesh → they are the group/bone hierarchy; scene root is node 129.

This validates that everything the user hand-copies is fully present and
recoverable from the file.

## Approach

A **single Blockbench plugin** (`.js`, loaded via *File → Plugins → Load Plugin
from File*), structured in two cleanly separated layers plus a test harness:

1. **Conversion core** — pure module, **zero Blockbench dependencies**. Input:
   parsed glTF data. Output: an intermediate description object with everything
   already in Blockbench units (pixels) and degrees. Pure math → testable in
   plain Node against the sample file.
2. **Blockbench adapter** — thin layer that turns the intermediate description
   into real `Group` / `Cube` / `Texture` / `Animation` objects in the open
   project, then refreshes the viewport.

glTF parsing uses **Blockbench's bundled three.js `GLTFLoader`**, which already
handles `.gltf`, `.glb`, embedded base64 buffers/textures, and external file
references. We read node TRS and geometry bounding boxes from the parsed graph —
no hand-rolled binary/accessor parsing.

### Rejected alternatives

- **Hand-written glTF parser** — full control but reimplements glb container,
  base64 buffers, and accessor decoding for little benefit.
- **Standalone external converter producing `.bbmodel`** — easiest to test, but
  cannot merge into the open project, which is the user's entire workflow.

## Architecture & data flow

```
.gltf/.glb file
  │
  ▼  three.GLTFLoader (Blockbench-bundled)
THREE scene graph  (nodes: position, quaternion, scale; BufferGeometry; UVs; AnimationClips)
  │
  ▼  Conversion core  (pure, no Blockbench)
Intermediate model
  {
    groups:    [{ id, parentId, name, origin:[x,y,z], rotation:[rx,ry,rz] }],
    cubes:     [{ id, groupId, name, from:[...], to:[...], origin:[...],
                  rotation:[...], faces:{ north:{uv:[x1,y1,x2,y2], rotation}, ... } }],
    texture:   { name, dataUrl, width, height },
    animations:[{ name, length, loop, bones:{ groupId:{ rotation:[{t,value}], position:[...], scale:[...] } } }]
  }
  │
  ▼  Blockbench adapter
Real Group / Cube / Texture / Animation objects added to the open Project
  + Canvas.updateAll() / refresh
```

## Component design

### 1. Entry point & plugin registration

- `BBPlugin.register('gltf_importer', { title, author, icon, version, variant:'both', onload, onunload })`.
- `onload` registers an **Action** `import_gltf` ("Import glTF/glb…") added to the
  File menu and the toolbar, plus tears it down in `onunload`.
- Action handler: guard that a project is open (else inform the user to create one
  first), open a file picker via `Blockbench.import({extensions:['gltf','glb'],
  type:'glTF Model', readtype:'binary'})`, then run loader → core → adapter.

### 2. glTF loading

- Instantiate `new THREE.GLTFLoader()`. Use `.parse(arrayBuffer, '', onLoad,
  onError)` so it works for both `.glb` (binary) and `.gltf` (with embedded
  base64; external-file `.gltf` resolved relative to the chosen path when possible).
- From the resulting `gltf.scene`, traverse nodes; collect `AnimationClip`s from
  `gltf.animations`.

### 3. Conversion core (pure)

Walk the scene graph depth-first, producing the intermediate model:

- **Node classification:** node with children (and no/empty mesh) → group only;
  node with a box mesh → group containing one cube (keeps rotation on the group so
  the cube stays axis-aligned, which all target formats support).
- **Scale:** multiply all positions/sizes by `SCALE = 16` (configurable override).
- **Pivot:** group `origin` = node world translation × 16 (accumulate parent
  translations so Bedrock-style global pivots are correct). Cube `origin` = its
  group origin.
- **Size + position:** read `geometry.boundingBox` (`min`/`max`) in node-local
  space; `from = (translation + min) × 16`, `to = (translation + max) × 16`.
  Verified to produce clean integers on the sample.
- **Rotation:** convert node quaternion → Euler degrees in the order Blockbench
  expects; assign to the group. (Cube rotation left at 0.)
- **Coordinate convention:** apply the axis transform that inverts Blockbench's
  glTF export (see "Coordinate calibration"). Encapsulated in one
  `gltfToBlockbench(vec)` / `gltfQuatToBBEuler(quat)` pair so it is the single
  place to adjust during calibration.

### 4. Texture + per-face UV

- Extract the base color texture image (data URL for embedded; file read for
  linked). Build `texture` entry with pixel `width`/`height`.
- Switch project to **per-face UV** (`Project.box_uv = false`). Per-face is
  required because glTF UVs are arbitrary; box-UV detection would be fragile.
- For each of a box's 6 faces, take that face's 4 glTF UVs, multiply by texture
  size, compute the `[x1,y1,x2,y2]` rect, and detect flip/rotation (0/90/180/270)
  to fill Blockbench's per-face `uv` + `rotation`. Map glTF face direction →
  Blockbench face key (north/south/east/west/up/down) consistently with the
  coordinate convention.

### 5. Animation conversion

- For each `AnimationClip`: create a Blockbench `Animation` (name, length, loop).
- For each channel (per node, per path rotation/position/scale): sample its
  keyframes; for each key emit a Blockbench keyframe on that group's animator —
  rotation as Euler degrees (quaternion→Euler per key), position scaled ×16,
  times in seconds.
- Position/scale channels relative to rest are handled by emitting values
  consistent with Blockbench's animator model. Built last; densely-sampled keys
  are acceptable (fidelity over sparsity).

### 6. Blockbench adapter

- Create groups parent-first: `new Group({name, origin, rotation}).init()` then
  `.addTo(parentGroupOrRoot)`; keep an id→Group map.
- Create cubes: `new Cube({name, from, to, origin, rotation}).init()`, set
  `cube.faces[face].uv/rotation/texture`, add to the cube's group.
- Texture: `new Texture({name}).fromDataURL(dataUrl).add(false)`; assign to faces.
- Animations: `new Animation({name, length, loop}).add(false)`; populate
  `animation.animators[group.uuid]` keyframes.
- Finish: `Canvas.updateAll()`, `Undo.finishEdit('Import glTF')`,
  `Blockbench.showQuickMessage('Imported N cubes')`.

## Coordinate calibration (the one uncertain area)

Blockbench applies an axis/scale convention when it exports glTF; we must invert
it. Scale (×16) is confirmed. The remaining unknown is exact axis sign/order and
Euler order. De-risking strategy:

1. **Unit assertions** in the Node harness: every cube size is a positive integer
   (within epsilon) when converted.
2. **Round-trip check:** import the sample, re-export to glTF via Blockbench, and
   confirm node transforms match the original within tolerance.
3. **Visual confirmation** by the user in Blockbench.

All convention logic lives in one small module so calibration changes are local.

## Build phases (each independently verifiable)

1. **Geometry** — bones + cubes with correct position/size/pivot/rotation. (Solves
   the core pain. Verify: cubes match the sample, sizes are clean integers.)
2. **Texture + per-face UVs** — model looks right. (Verify: texture applied, faces
   aligned.)
3. **Animations** — clips become Blockbench keyframe animations. (Verify: playback
   matches Sketchfab preview.)

## Testing strategy

- **Node test harness** drives the *conversion core* against
  `bacteria/source/model.gltf` (parsing the JSON / via a headless three load),
  asserting: cube count, integer sizes, sane pivots/rotations, UV rects in range,
  animation counts. No Blockbench needed → fast, CI-able.
- **Manual in Blockbench:** user loads the plugin, imports the sample, visually
  confirms geometry, texture, and animations; round-trip re-export check.

## Error handling & edge cases

- No project open → clear message, abort.
- Non-box meshes (vertex count ≠ 24 / not a 6-face box) → import as best-effort
  bounding-box cube and log a warning count; never crash the whole import.
- Missing/zero UVs or no texture → import geometry only, skip texture step.
- Multiple textures/materials → support more than one; assign per-cube material's
  texture.
- `.glb` with external buffers, or `.gltf` referencing missing external files →
  surface a readable error.
- Degenerate/zero-size boxes → skip with a warning.

## Deliverables

- `gltf_importer.js` — the Blockbench plugin (entry + adapter).
- Conversion core module (bundled into the plugin; also importable by the harness).
- Node test harness + the sample file wired in as a fixture.
- Short README: install, usage, known limitations.

## Open risks

- Exact Euler order / axis flip — mitigated by the calibration plan above.
- Animation channel semantics (relative vs absolute, pre/post rotation) — the
  riskiest; isolated to phase 3 and validated against the Sketchfab preview.
- Blockbench plugin API specifics (exact constructor options, animator keyframe
  API) — verify against current Blockbench docs/source during implementation.
