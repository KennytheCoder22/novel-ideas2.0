import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require = createRequire(import.meta.url);
const shots = join(tmpdir(), 'carnival-platform-check');
mkdirSync(shots, {recursive:true});
const {chromium}=require(process.env.CARNIVAL_PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const b=await chromium.launch({channel:process.env.CARNIVAL_BROWSER_CHANNEL || undefined,headless:true});
 try {
 for(const width of [1280,390]) {
  const p=await b.newPage({viewport:{width,height:width===390?844:720},isMobile:width===390,hasTouch:width===390});
  p.setDefaultTimeout(15000); const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto((process.env.CARNIVAL_PREVIEW_URL || 'http://localhost:4180/experiments/carnival/index.html') + '?scene=ferris-platform');
  await p.waitForFunction(()=>document.documentElement.dataset.location==='ferris-platform');
  assert.equal(await p.locator('.platform-dressing').count(),1);
  assert.equal(await p.locator('.platform-dressing button, .platform-dressing a, .platform-dressing [tabindex]').count(),0);
  assert.equal(await p.locator('.platform-dressing').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  assert.equal(await p.locator('.platform-passenger').evaluate(e=>getComputedStyle(e).animationPlayState),'running');
  await p.screenshot({path:join(shots,`platform-${width}.png`)});
  if(width===390) {
   for(let i=0;i<4;i++) await p.locator('[data-scene="ferris-platform"] button[aria-label="Look left"]').click();
   await p.screenshot({path:join(shots,'platform-mobile-left.png')});
  }
  await p.locator('[data-scene="ferris-platform"] .location-path').click();
  await p.waitForFunction(()=>document.documentElement.dataset.location==='midway');
  assert.equal(await p.locator('.platform-passenger').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
  await p.screenshot({path:join(shots,`midway-${width}.png`)});
  await p.locator('.wheel').click();
  await p.waitForFunction(()=>document.documentElement.dataset.location==='ferris-platform');
  assert.equal(await p.locator('.platform-dressing').count(),1);
  await p.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await p.locator('.platform-passenger').evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.deepEqual(errors,[]);
  console.log(`${width}px: layers, noninteraction, navigation round trip, idle pause, reduced motion, errors PASS`);
  await p.close();
 }
 } finally { await b.close(); }
})();

