// Bundles the server and all its dependencies into dist/server.js, so the
// Docker image needs no node_modules at runtime.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  sourcemap: 'linked',
  // Some CommonJS dependencies call require() at runtime.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
