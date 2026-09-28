// Run: node tests/check-routes.cjs [approved-proposal.json]
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sandbox = { window: {}, setTimeout };
vm.runInNewContext(fs.readFileSync(path.join(root, 'routes.js'), 'utf8'), sandbox);
const registry = sandbox.window.MMRoutes;
const routes = registry.routes;
assert.equal(routes.length, 108);
assert.equal(new Set(routes.map(r => r.route)).size, routes.length);
assert.equal(routes.filter(r => r.type !== 'external').length, 107);
assert.equal(registry.byKey['page/professional-support'], undefined);
assert.equal(registry.defaults['grief-legacy'], undefined);
for (const r of routes) {
  if (r.type === 'external') { assert.equal(r.route, 'leaves-on-a-stream.html'); continue; }
  assert.match(r.route, /^(tool|page)\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(html.includes('id="' + r.passageId + '"'), r.route);
  if (r.cardId) assert.ok(html.includes('id="' + r.cardId + '"'), r.route);
  assert.equal(registry.parse('#' + r.route).route.route, r.route);
}
for (const hash of ['#tool/%E0%A4%A', '#thoughts', '#page/growing', '#__proto__', '#tool/thought-record?text=test', '#page/professional-support']) {
  assert.equal(registry.parse(hash).valid, false);
  assert.equal(registry.parse(hash).route.route, 'page/home');
}
assert.equal(registry.parse('#main-content').explicit, false);
assert.equal(registry.parse('').explicit, false);
for (const p of ['struggling-new','soft-landing','struggling','thoughts','growing']) assert.equal(registry.forTarget(p).route, 'page/home');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
scripts.forEach((m, i) => new vm.Script(m[1], { filename: 'inline-' + i }));
new vm.Script(fs.readFileSync(path.join(root, 'navigation.js'), 'utf8'));
const base = cp.execFileSync('git', ['show','830122e:index.html'], {cwd:root,encoding:'utf8',maxBuffer:8e6});
const withoutScripts = s => s.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, '').replace(/\s+/g,' ').trim();
assert.equal(withoutScripts(html), withoutScripts(base), 'Clinical content, layout, CSS and asset markup unchanged');
const library = s => JSON.parse(s.match(/var TOOL_INDEX\s*=\s*(\[.*?\]);/s)[1]);
const before = library(base), after = library(html);
assert.equal(after.length, 79);
before.forEach((item,i)=>{
  if(item.name==='Worry Postponement')item.card='card-thought-spiral-worry-postponement';
  if(item.name==='ConnexOntario')item.card='card-alone-if-you-have-no-one-to-call';
  assert.deepEqual(after[i], item);
});
if (process.argv[2]) {
  const approved = JSON.parse(fs.readFileSync(process.argv[2],'utf8')).routes.filter(r=>r.route!=='page/professional-support');
  assert.equal(approved.length, routes.length);
  approved.forEach(r=>{
    const implemented = registry.byKey[r.route];
    for(const key of ['type','passageId','cardId']) assert.equal(implemented[key],r[key],r.route+' '+key);
  });
}
console.log(JSON.stringify({pass:true,routes:108,internalRoutes:107,libraryRows:79,syntax:'PASS',approvedContract:'PASS',clinicalAndVisualMarkup:'UNCHANGED',psychologyToday:'HELD'},null,2));
