// ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// Run with node scripts/check-conflicts.cjs. Uses the project's TypeScript compiler.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(__dirname, '..', file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8').replaceAll('import.meta.env', '({})'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const localRequire = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', {filename:file})(localRequire,module,module.exports);
  return module.exports;
}
const {detectConflicts} = load('src/utils/ConflictDetector.ts');
const {normalizeAircraft} = load('src/network/NetworkManager.ts');
const ac = (hex, extra = {}) => normalizeAircraft({hex, lat:0, lon:0, gs:300, track:90, alt_baro:10000, ...extra});
const pair = (a,b,minutes=2) => detectConflicts([a,b],0,0,100,minutes);
let count=0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
test('same altitude nearby alerts, including zero coordinates',()=>assert.equal(pair(ac('a'),ac('b',{lon:.01})).length,1));
test('1500 ft vertical separation suppresses alerts',()=>assert.equal(pair(ac('a'),ac('b',{lon:.01,alt_baro:11500})).length,0));
test('exactly 1000 ft does not alert',()=>assert.equal(pair(ac('a'),ac('b',{alt_baro:11000})).length,0));
test('missing altitude does not become a sea-level conflict',()=>assert.equal(pair(ac('a',{alt_baro:undefined}),ac('b',{alt_baro:undefined})).length,0));
test('ground reports with taxi speed excluded',()=>assert.equal(pair(ac('a',{alt_baro:'ground'}),ac('b',{alt_baro:'ground'})).length,0));
test('nonfinite altitude excluded',()=>assert.equal(pair(ac('a',{alt_baro:NaN}),ac('b',{alt_baro:Infinity})).length,0));
test('climbing aircraft clears altitude before horizontal convergence',()=>assert.equal(pair(ac('a',{baro_rate:2000}),ac('b',{lon:10/60,track:270})).length,0));
test('descending aircraft converges in three dimensions',()=>{
 const result=pair(ac('a'),ac('b',{lon:10/60,track:270,alt_baro:13000,baro_rate:-3000}));
 assert.equal(result.length,1); assert.ok(result[0].sepFt<100); assert.ok(result[0].eta>=59 && result[0].eta<=61);
});
test('vertical convergence after lateral pass does not alert',()=>assert.equal(pair(ac('a'),ac('b',{lon:10/60,track:270,alt_baro:15000,baro_rate:-2000})).length,0));
test('geometric altitude and rate fallback works',()=>assert.equal(pair(ac('a',{alt_baro:undefined,alt_geom:10000}),ac('b',{alt_baro:undefined,alt_geom:13000,geom_rate:-3000})).length,1));
test('mixed altitude references do not produce a false conflict',()=>assert.equal(pair(ac('a'),ac('b',{alt_baro:undefined,alt_geom:10000})).length,0));
test('common barometric altitude preferred over geometric display differences',()=>assert.equal(pair(ac('a',{alt_geom:11000}),ac('b',{alt_baro:11500,alt_geom:11000})).length,0));
test('missing rate assumes level flight',()=>assert.equal(pair(ac('a'),ac('b')).length,1));
test('continuous prediction detects crossings between old sample times',()=>assert.equal(pair(ac('a',{gs:3600}),ac('b',{gs:3600,lon:20/60,track:270})).length,1));
test('zero forecast checks current position',()=>assert.equal(pair(ac('a'),ac('b'),0).length,1));
test('invalid forecast rejected',()=>assert.equal(pair(ac('a'),ac('b'),NaN).length,0));
console.log(`${count} separation regression tests passed.`);
