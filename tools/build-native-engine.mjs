import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const root = resolve(import.meta.dirname, '..'), temp = resolve(root, '.local/native-engine-compiled');
const sources = ['src/cards.ts', 'src/rules.ts', 'src/game.ts', 'src/policy.ts', 'src/model.ts', 'src/local-game.ts', 'tools/build-native-engine.mjs'];
const hash = createHash('sha256');
for (const file of sources) hash.update(file + '\n').update(readFileSync(resolve(root, file)));
const fingerprint = hash.digest('hex');
rmSync(temp, { recursive: true, force: true });
execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--target', 'ES5', '--module', 'commonjs',
  '--downlevelIteration', '--lib', 'ES2022,DOM', '--skipLibCheck', '--strict', '--outDir', temp, resolve(root, 'src/local-game.ts')], { cwd: root, stdio: 'inherit' });
writeFileSync(resolve(temp, 'package.json'), '{"type":"commonjs"}\n');
const result = await build({ entryPoints: [resolve(temp, 'local-game.js')], bundle: true, format: 'iife', globalName: 'GuandanOffline', target: 'es5', write: false, minify: false });
const out = resolve(root, 'android/app/src/main/assets/local-game.js'); mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, '// Generated from shared rules; run node tools/build-native-engine.mjs\n// source-sha256: ' + fingerprint + '\n' + result.outputFiles[0].text);
console.log(JSON.stringify({ asset: 'android/app/src/main/assets/local-game.js', sourceSha256: fingerprint, bytes: readFileSync(out).length }));
