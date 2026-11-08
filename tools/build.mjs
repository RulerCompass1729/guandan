import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
await build({ entryPoints: ['src/client.ts'], outfile: 'public/app.js', bundle: true,
  format: 'esm', target: ['chrome90'], minify: true, sourcemap: false });
