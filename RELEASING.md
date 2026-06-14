# Releasing Cubeport

Two channels: (1) a public GitHub repo, then (2) the official Blockbench plugin store.

## 1. GitHub repo

From the repo root (already committed on a branch and merged to the default branch):

```bash
# create the public repo and push (GitHub CLI, already authenticated as xSIRDON)
gh repo create xSIRDON/cubeport --public --source . --remote origin --push
```

Then cut a release so people can download the built plugin:

```bash
gh release create v1.0.0 dist/cubeport.js \
  --title "Cubeport v1.0.0" \
  --notes "Import glTF/glb models into Blockbench as editable cubes + bones + textures + animations."
```

People can then **File → Plugins → Load Plugin from URL** with the release asset URL, or
download `dist/cubeport.js` and load it from file.

## 2. Official Blockbench plugin store

The store is the repo **JannisX11/blockbench-plugins**. Submission = a pull request.

### Before you submit — read this
- The store policy rejects plugins whose **features use generative AI**. Cubeport is a
  deterministic converter and uses no AI at runtime, so it qualifies. Still, read the
  current CONTRIBUTING / policy text in that repo yourself and make sure you're comfortable
  owning and maintaining the plugin (answering issues, shipping fixes). It's your plugin.
- The id `cubeport` is unique (the existing `gltf_importer` by 0x13F is a separate, raw-mesh
  importer — Cubeport is the editable-cubes one).

### Steps
1. Fork **JannisX11/blockbench-plugins** and clone your fork.
2. Create the plugin folder `plugins/cubeport/` containing:
   - `cubeport.js`  ← copy of this repo's built `dist/cubeport.js`
   - `about.md`     ← copy of this repo's `store/cubeport/about.md`
   - `icon.svg`     ← copy of this repo's `store/cubeport/icon.svg` (48–96 px, ≤12 KB ✓)
   - (optional) `LICENSE.MD` ← copy of this repo's `LICENSE`
   - (optional) `src/` ← copy this repo's `src/` so reviewers can read the unbundled source
3. Add an entry to `plugins.json` (must match the `Plugin.register` metadata exactly):

```json
"cubeport": {
  "title": "Cubeport",
  "author": "Nicholas Cerdon",
  "description": "Re-import Blockbench-made Minecraft models that were exported to glTF/glb (e.g. via Sketchfab) back into Blockbench as editable cubes, bones, textures, and animations. For cube-based Blockbench/Minecraft models only — not sculpted or organic meshes.",
  "icon": "fa-cubes",
  "version": "1.0.0",
  "variant": "both",
  "tags": ["Minecraft", "Import", "Animation"],
  "min_version": "4.8.0",
  "website": "https://github.com/xSIRDON/cubeport",
  "repository": "https://github.com/xSIRDON/cubeport",
  "bug_tracker": "https://github.com/xSIRDON/cubeport/issues",
  "has_changelog": false
}
```

4. Run the repo's validator (authoritative — fix whatever it flags):

```bash
npm install
npm run validate cubeport
```

5. Open a PR. Maintainers review against quality standards. For future updates, bump the
   version in **both** `src/entry.js` (`Plugin.register`) and `plugins.json` so auto-update
   works, rebuild, and update the store files.

## Keeping versions in sync

The version lives in three places — keep them equal on every release:
`package.json`, `src/entry.js` (`Plugin.register({ version })`), and the `plugins.json`
store entry.
