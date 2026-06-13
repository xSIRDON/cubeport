import { build } from 'esbuild';

await build({
  entryPoints: ['src/entry.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/gltf_importer.js',
  legalComments: 'none',
});
console.log('Built dist/gltf_importer.js');
