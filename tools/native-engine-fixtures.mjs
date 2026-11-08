import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = resolve('.local/native-fixture-module.mjs');
await build({ entryPoints: ['src/local-game.ts'], outfile: modulePath, bundle: true, platform: 'node', format: 'esm' });
const { dispatch } = await import(pathToFileURL(modulePath));
const fixtures = [];
function record(input) {
  const output = JSON.parse(dispatch(JSON.stringify(input)));
  if (output.error) throw new Error(output.error);
  fixtures.push({ input, expected: output }); return output;
}
for (const testSeed of [0, 17, 1729]) {
  let output = record({ op: 'new', testSeed, name: '练习牌友' });
  for (let step = 0; step < 4; step++) {
    if (output.needsBot) output = record({ op: 'tick', state: output.state });
    else {
      const suggestion = record({ op: 'hint', state: output.state, cursor: 0 });
      output = record({ op: 'action', state: output.state, action: { type: suggestion.ids ? 'play' : 'pass', ids: suggestion.ids,
        patternId: suggestion.patternId, expectedVersion: output.state.version, roundId: output.state.game.roundId, actionId: 'fixture-action-' + step } });
    }
  }
}
const target = resolve('android/app/src/test/resources'); mkdirSync(target, { recursive: true });
writeFileSync(resolve(target, 'engine-fixtures.json'), JSON.stringify(fixtures));
console.log(JSON.stringify({ fixtures: fixtures.length, bytes: JSON.stringify(fixtures).length }));
