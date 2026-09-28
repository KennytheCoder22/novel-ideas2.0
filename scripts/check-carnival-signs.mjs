import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CARNIVAL_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.CARNIVAL_PREVIEW_URL || 'http://localhost:4180/experiments/carnival/index.html';
const browser=await chromium.launch({headless:true,channel:process.env.CARNIVAL_BROWSER_CHANNEL || undefined});
const errors=[];
try {
 for(const mobile of [false,true]) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){const a=animate.call(this,frames,options);if(options?.duration===700){a.pause();a.currentTime=0;}return a;};});
  for(const [scene,label] of [['midway','RIDES & GAMES'],['ferris-platform','GAMES'],['fortune-teller','RIDES'],['fortune-teller','GAMES']]) {
   await page.goto(base+(scene==='midway'?'':'?scene='+scene));
   if(scene!=='midway') await page.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.dataset.travelling,scene);
   const source=scene==='midway'?'main':`[data-scene="${scene}"]`;
   const sign=page.locator(source).locator(`[data-sign="${label}"]`);
   let point;
   for(const direction of ['',...Array(7).fill('left'),...Array(7).fill('right')]) {
    if(direction&&mobile){
     const controls=scene==='midway'?page.locator(`[data-pan="${direction}"]`):page.locator(source).getByRole('button',{name:direction==='left'?'Look left':'Look right',exact:true});
     await controls.click();
    }
    const rect=await sign.boundingBox(),v=page.viewportSize();
    const l=Math.max(0,rect.x),r=Math.min(v.width,rect.x+rect.width),t=Math.max(0,rect.y),b=Math.min(v.height,rect.y+rect.height);
    if(r-l>20&&b-t>20){point={x:(l+r)/2,y:(t+b)/2};break;}
   }
   assert.ok(point,'Sign is reachable at '+scene);
   const appearance=await sign.evaluate(e=>{const s=getComputedStyle(e);return {background:s.backgroundColor,outline:s.outlineStyle,title:e.title,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height};});
   assert.equal(appearance.background,'rgba(0, 0, 0, 0)');assert.equal(appearance.outline,'none');assert.equal(appearance.title,'');
   if(mobile){assert.ok(appearance.width>=44&&appearance.height>=44);await page.touchscreen.tap(point.x,point.y);}else await page.mouse.click(point.x,point.y);
   await page.waitForFunction(()=>document.documentElement.dataset.travelling==='true');
   const effects=await page.locator(source).evaluate(e=>e.getAnimations().map(a=>({duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes()})));
   assert.equal(effects.length,1);assert.equal(effects[0].duration,700);
   assert.ok(effects[0].frames.every(f=>!f.transform||f.transform==='none'),'Sign has no zoom/translation');
   assert.equal(await page.locator('.inspection').evaluate(e=>e.open),false);
   if(scene==='fortune-teller'&&label==='RIDES'){
    await page.evaluate(()=>document.getAnimations().filter(a=>a.effect.getTiming().duration===700).forEach(a=>a.currentTime=350));
    await page.screenshot({path:join(tmpdir(),`carnival-sign-dissolve-${mobile?'mobile':'desktop'}.png`)});
   }
   await page.evaluate(()=>document.getAnimations().filter(a=>a.effect.getTiming().duration===700).forEach(a=>a.finish()));
   await page.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
   assert.equal(await page.locator('.location-back').isVisible(),false);
   console.log('PASS sign',mobile?'390px':'desktop',scene,label);
  }
  assert.equal(await page.locator('.location-sign[data-sign="FOOD"], .location-sign[data-sign="RESTROOMS"]').count(),0);
  // Existing walking regions still use the long camera transition after sign arrival.
  const path=page.locator('[data-scene="rides-games"] .location-path');
  await path.click();await page.waitForFunction(()=>document.documentElement.dataset.travelling==='true');
  const duration=await page.locator('[data-scene="rides-games"]').evaluate(e=>e.getAnimations()[0].effect.getTiming().duration);
  assert.equal(duration,2400);await page.waitForFunction(()=>document.documentElement.dataset.location==='midway'&&!document.documentElement.dataset.travelling);
  await page.close();
 }
 const live=await browser.newPage({viewport:{width:1280,height:720}});await live.goto(base+'?scene=fortune-teller');await live.waitForFunction(()=>document.documentElement.dataset.location==='fortune-teller'&&!document.documentElement.dataset.travelling);
 await live.locator('[data-sign="RIDES"]').click();await live.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
 await live.close();assert.deepEqual(errors,[]);
 console.log('PASS all cross-scene signs on desktop/touch, 700ms opacity-only effects, inactive unbuilt signs, preserved 2400ms paths, and real-time dissolve.');
} finally {await browser.close();}
