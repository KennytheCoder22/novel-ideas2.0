import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Use an installed Playwright, or supply its module path without changing this repo.
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.CARNIVAL_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CARNIVAL_PREVIEW_URL || 'http://localhost:4180/experiments/carnival/index.html';
const shots = join(tmpdir(),'carnival-navigation-check'); mkdirSync(shots,{recursive:true});
const hashes = {
  'ferris-platform':'5f61282a5a30e577fc2e29f2997ac64ceb196982eff98eba94d2991e0d376ce0',
  'rides-games':'572e403e85e1faed527f5eac12a1f6d7a72e4403265f9327f20f0a9cdf0eeb02',
  'tent-row':'27f2c924cbf514bb79cf5a152b6b32ea34aeae05e5971c356b8fa3fcbeea7faa',
  'fortune-teller':'778d7ccbf553aedffc78a9d15bbe675b8b9a6dfdfd61281e71cf9b74d98517ac',
  'behind-carnival':'37f87bed898ff369e2794be646dc5b4ddb118d2235c911a02d536d8782c23746',
  'forest-edge':'ad560eea8f71be669de6d8dae3574478cb6b0648a897a4cd16e376acefa2c28d',
};
for(const [id,hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync(`public/experiments/carnival/locations/${id}.png`)).digest('hex'),hash);
const browser = await chromium.launch({headless:true,channel:process.env.CARNIVAL_BROWSER_CHANNEL || undefined});
const errors=[];
async function settled(page,id){await page.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.hasAttribute('data-travelling'),id,{polling:50});}
async function frameCheck(page,id){
  const result=await page.locator(`[data-scene="${id}"] .location-background`).evaluate(e=>({width:e.width,height:e.height,nw:e.naturalWidth,nh:e.naturalHeight,rect:e.getBoundingClientRect().toJSON()}));
  assert.ok(Math.abs(result.rect.width/result.rect.height-result.nw/result.nh)<.001,'No aspect distortion');
  assert.ok(result.rect.left<=1&&result.rect.right>=page.viewportSize().width-1,'Stage covers viewport');
  assert.equal(await page.locator(`[data-scene="${id}"] .location-plane`).locator('button').count(),0,'No invented scene hotspots');
}
try {
  for(const mobile of [false,true]){
    const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>sessionStorage.setItem('carnival-mara-remains','1'));
    await page.clock.install({time:new Date('2026-09-27T00:00:00Z')});
    await page.clock.pauseAt(new Date('2026-09-27T00:00:01Z'));
    await page.goto(base);
    const original=await page.locator('.composition').elementHandle();
    for(const [selector,id,pan] of [['.tent','tent-row','center'],['.entrance','rides-games','left'],['.wheel','ferris-platform','right']]){
      if(mobile) await page.locator(`[data-pan="${pan}"]`).click();
      const style=await page.locator('.composition').getAttribute('style');
      await page.locator(selector).click();
      await page.waitForFunction(()=>document.documentElement.dataset.travelling==='true',null,{polling:50});
      await page.clock.runFor(650);
      assert.equal(await page.locator('.inspection').evaluate(e=>e.open),false,'Destination no longer opens placeholder dialog');
      assert.ok(await page.locator('main').evaluate(e=>e.getBoundingClientRect().width>innerWidth),'Initial camera push shows the living Midway');
      if(id==='tent-row') await page.screenshot({path:join(shots,`approach-${mobile?'mobile':'desktop'}.png`)});
      assert.equal(await page.locator('main').evaluate(e=>e.getAnimations()[0].effect.getTiming().duration),2400);
      await page.clock.runFor(1800);await settled(page,id);
      assert.equal(await page.locator('main').evaluate(e=>e.inert),true);
      await frameCheck(page,id);
      await page.screenshot({path:join(shots,`${id}-${mobile?'mobile':'desktop'}.png`)});
      if(mobile){await page.locator(`[data-scene="${id}"]`).getByRole('button',{name:'Look left',exact:true}).click();await page.locator(`[data-scene="${id}"]`).getByRole('button',{name:'Look right',exact:true}).click();}
      await page.locator('.location-back').click(); await page.clock.runFor(2500);await settled(page,'midway');
      assert.ok(await original.evaluate(e=>e===document.querySelector('.composition')),'Original Midway DOM survives the round trip');
      assert.equal(await page.locator('.composition').getAttribute('style'),style,'Midway camera framing preserved');
      assert.equal(await page.locator('.fox').evaluate(e=>e.hidden),true);
      assert.equal(await page.locator('.ground-tag').evaluate(e=>e.hidden),false);
      assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
      assert.equal(await page.locator('.orbit').count(),12);
    }
    for(const id of ['fortune-teller','behind-carnival','forest-edge']){
      await page.goto(base+'?scene='+id);await page.waitForFunction(()=>document.documentElement.dataset.travelling==='true',null,{polling:50});await page.clock.runFor(2500);await settled(page,id);await frameCheck(page,id);
      await page.screenshot({path:join(shots,`${id}-${mobile?'mobile':'desktop'}.png`)});
      await page.locator('.location-back').click();await page.clock.runFor(2500);await settled(page,'midway');
    }
    await page.close();
  }
  const reduced=await browser.newPage({reducedMotion:'reduce'});await reduced.goto(base);
  await reduced.locator('.tent').click();await settled(reduced,'tent-row');
  await reduced.locator('.location-back').click();await settled(reduced,'midway');await reduced.close();
  const fail=await browser.newPage();await fail.goto(base);
  await fail.route('**/locations/tent-row.png',route=>route.abort());
  await fail.locator('.tent').click();await fail.waitForFunction(()=>!document.querySelector('main').inert);
  assert.equal(await fail.locator('.location-back').isVisible(),false);
  await fail.unroute('**/locations/tent-row.png');await fail.locator('.tent').click();await settled(fail,'tent-row');await fail.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: six original asset hashes, desktop/390px aspect-correct stages, three real destination round trips, push/dissolve, unchanged Midway DOM/camera and MARA state, no new hotspots, reduced motion, failed-load retry. Screenshots: '+shots);
} finally {await browser.close();}
