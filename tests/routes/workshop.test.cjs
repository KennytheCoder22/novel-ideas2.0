const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  }).outputText, filename);
};
const {validateLibraryIdForSave} = require('../../lib/savedLibraries.ts');
test('Workshop address is reserved while ordinary library IDs remain valid', () => {
  for (const id of ['3d-workshop','3D-WORKSHOP']) {
    assert.equal(validateLibraryIdForSave(id).valid,false);
    assert.equal(validateLibraryIdForSave(id,id).valid,false);
  }
  assert.equal(validateLibraryIdForSave('yvhs').valid,true);
  assert.equal(validateLibraryIdForSave('northbranch').valid,true);
});
test('Workshop navigation does not replace a saved PWA library launch path', () => {
  const values = new Map([['novelideas:pwa-launch-path','/yvhs']]);
  const window = {location:{pathname:'/3d-workshop',search:''},localStorage:{
    setItem:(k,v)=>values.set(k,v),
  }};
  const sandbox = {exports:{},window,require:()=>({Platform:{OS:'web'}})};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/pwaRuntime.ts'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText,sandbox);
  sandbox.exports.rememberPwaLaunchPath();
  assert.equal(values.get('novelideas:pwa-launch-path'),'/yvhs');
  window.location.pathname='/northbranch';
  sandbox.exports.rememberPwaLaunchPath();
  assert.equal(values.get('novelideas:pwa-launch-path'),'/northbranch');
});
