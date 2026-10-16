// ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// Focused geometry and setup URL checks. Run: node scripts/check-display.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(path) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { scopeGeometry, fillsRadarViewport } = await load('../src/utils/scopeGeometry.ts');
const { normalizeFeeder } = await load('../src/utils/feederUrl.ts');
let checks = 0;
for (const [w,h] of [[1920,1080],[1024,600],[375,667],[667,240],[90,90],[80,60],[40,40],[1,1]]) {
  for (const fill of [true,false]) {
    const {radius,guideRadius,showHeadings} = scopeGeometry(w,h,fill);
    assert(radius > 0);
    assert(guideRadius <= Math.min(w,h)/2);
    if (showHeadings) {
      // Include the full width of three-digit heading labels at 11px.
      for (let deg=0; deg<360; deg+=30) {
        const radians=(deg-90)*Math.PI/180;
        const x=w/2+(guideRadius+18)*Math.cos(radians);
        const y=h/2+(guideRadius+18)*Math.sin(radians);
        assert(x-11>=0 && x+11<=w && y-6>=0 && y+6<=h, `${w}x${h}, heading ${deg}`);
      }
    }
    if (!fill) assert.equal(radius,guideRadius);
    checks++;
  }
}
assert.equal(normalizeFeeder('192.168.1.100'), 'http://192.168.1.100/tar1090/data/aircraft.json');
assert.equal(normalizeFeeder('receiver.local:8080'), 'http://receiver.local:8080/tar1090/data/aircraft.json');
assert.equal(normalizeFeeder('https://receiver.local/data/aircraft.json'), 'https://receiver.local/data/aircraft.json');
assert.equal(normalizeFeeder('/data/aircraft.json'), '/data/aircraft.json');
for (const invalid of ['', 'bad host', 'ftp://receiver/data', 'http://user:secret@receiver']) assert.throws(() => normalizeFeeder(invalid));
console.log(`Passed ${checks} geometry combinations and 8 feeder address checks.`);

for (const fillViewport of [false, true]) {
  assert.equal(fillsRadarViewport({ sweepStyle: 'none', fillViewport }), true);
  for (const sweepStyle of ['rotate', 'pulse']) {
    assert.equal(fillsRadarViewport({ sweepStyle, fillViewport }), fillViewport);
  }
}
console.log('Passed all 6 sweep/viewport mode combinations.');
