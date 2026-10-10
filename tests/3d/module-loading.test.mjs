import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { model } from './fixtures.mjs';

// Vercel emits this API as CommonJS. Node 24's default require(ESM) support
// would hide the production failure, so explicitly disable it in the child.
test('deployed CommonJS handler loads native ESM gates without require(ESM)', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const dir = await mkdtemp(path.join(root, '.3d-module-test-'));
  try {
    await mkdir(path.join(dir, 'api'));
    await cp(path.join(root, 'lib/3d'), path.join(dir, 'lib/3d'), { recursive: true });
    const source = await readFile(path.join(root, 'api/3d-generate.ts'), 'utf8');
    const compile = text => ts.transpileModule(text, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    await writeFile(path.join(dir, 'api/3d-generate.cjs'), compile(source));
    // Negative control proves this test detects the original production bug.
    await writeFile(path.join(dir, 'api/before.cjs'), compile(source.replace(
      '../lib/3d/load-normal.cjs', '../lib/3d/normal.mjs')));
    const input = await model(undefined, j => {
      delete j.meshes[0].primitives[0].attributes.TEXCOORD_0;
    });
    await writeFile(path.join(dir, 'input.glb'), input);
    const child = spawnSync(process.execPath, ['--no-experimental-require-module', '-e', `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const path = require('node:path');
      const dir = process.argv[1];
      assert.throws(() => require(path.join(dir, 'api/before.cjs')), {code:'ERR_REQUIRE_ESM'});
      const handler = require(path.join(dir, 'api/3d-generate.cjs')).default;
      const input = fs.readFileSync(path.join(dir, 'input.glb'));
      process.env.STABILITY_API_KEY = 'test-never-a-real-key';
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response(input); };
      async function request(method, body) {
        const res = { headers:{}, statusCode:200,
          setHeader(k,v){this.headers[k]=v;return this;},
          status(v){this.statusCode=v;return this;},
          json(v){this.body=v;return this;}, send(v){this.body=v;return this;} };
        await handler({method,headers:{host:'test.local',origin:'https://test.local'},body},res);
        return res;
      }
      (async () => {
        const get = await request('GET');
        assert.equal(get.statusCode,405);
        assert.equal(get.headers.Allow,'POST');
        const empty = await request('POST',{});
        assert.equal(empty.statusCode,400);
        assert.equal(empty.body.error,'unsupported_image_type');
        assert.equal(calls,0);
        const mirror = await request('POST',{
          mimeType:'image/png',imageBase64:'dGVzdA==',hiddenSideMode:'mirror'
        });
        assert.equal(mirror.statusCode,200);
        assert.equal(calls,1);
        assert.equal(mirror.headers['X-NovelIdeas-Symmetry-Action'],'UNCHANGED');
        assert.equal(mirror.headers['X-NovelIdeas-Symmetry-Stages'],'eligibility,utility');
        assert.deepEqual(mirror.body,input);
        assert.equal(mirror.body.toString('ascii',0,4),'glTF');
      })().catch(error => { console.error(error); process.exitCode=1; });
    `, dir], { encoding: 'utf8', timeout: 60000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stdout + child.stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
