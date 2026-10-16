// ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source = await fs.readFile(new URL('../src/utils/airspaceViewport.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020}});
const {viewportTiles, viewportBounds} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const view = {lat:42.54,lon:-71.28,range:50,halfWidthNm:50,halfHeightNm:50};
const square = viewportTiles(view);
assert(square.length < 25, 'Only intersecting tiles; no oversized 7x7 grid');
const wide = viewportTiles({...view,halfHeightNm:15});
assert(wide.length <= square.length);
const portrait = viewportTiles({...view,halfWidthNm:15});
assert(portrait.length <= square.length);
const crossing=viewportTiles({...view,lon:179.9});
assert(crossing.some(k=>k.split('/')[1]==='0'));
assert(crossing.some(k=>k.split('/')[1]==='127'));
assert.equal(crossing.length,new Set(crossing).size);
for (const lat of [-89,-80,0,80,89]) {
 const keys=viewportTiles({...view,lat});
 for(const key of keys) {const [z,x,y]=key.split('/').map(Number); assert(x>=0&&x<2**z&&y>=0&&y<2**z);}
}
assert.deepEqual(viewportTiles({...view,range:NaN}),[]);
const bounds=viewportBounds(view);
assert(Math.abs(bounds.north-(view.lat+50/60))<1e-10);
console.log(`Viewport tests passed: square=${square.length}, wide=${wide.length}, portrait=${portrait.length}, dateline=${crossing.length} tiles.`);
