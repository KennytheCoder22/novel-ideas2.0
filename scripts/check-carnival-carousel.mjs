import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CARNIVAL_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.CARNIVAL_PREVIEW_URL || 'http://localhost:4180/experiments/carnival/index.html';
const browser=await chromium.launch({headless:true,channel:process.env.CARNIVAL_BROWSER_CHANNEL || undefined});
try {
 for(const width of [1280,390]) {
  const page=await browser.newPage({viewport:{width,height:width===390?844:720},isMobile:width===390,hasTouch:width===390});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'?scene=rides-games');
  await page.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
  const dressing=page.locator('.carousel-dressing');
  assert.equal(await dressing.count(),1);
  assert.equal(await dressing.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  assert.equal(await dressing.locator('button,a,[tabindex]').count(),0);
  assert.equal(await dressing.locator('[data-carousel-slot]').count(),12);
  assert.equal(await dressing.locator('.carousel-mount-anchor > *').count(),0,'No populated mounts');
  if(width===390) for(let i=0;i<5;i++) await page.locator('[data-scene="rides-games"]').getByRole('button',{name:'Look left',exact:true}).click();
  await page.screenshot({path:join(tmpdir(),`carnival-carousel-moving-${width}-a.png`)});
  const phase=Number(await dressing.getAttribute('data-phase'));
  await page.waitForTimeout(1300);
  assert.ok(Number(await dressing.getAttribute('data-phase'))>phase,'Slow rotation advances');
  await page.screenshot({path:join(tmpdir(),`carnival-carousel-moving-${width}-b.png`)});
  const matrices=await dressing.locator('.carousel-slot').evaluateAll(nodes=>nodes.map(e=>{const m=e.getCTM();return {a:m.a,b:m.b,c:m.c,d:m.d};}));
  matrices.forEach(m=>assert.ok(m.a>0&&m.d>0&&Math.abs(m.b)<1e-8&&Math.abs(m.c)<1e-8,'Poles remain upright'));
  assert.ok(await dressing.locator('.carousel-rear-slots .carousel-slot').count()>0);
  assert.ok(await dressing.locator('.carousel-front-slots .carousel-slot').count()>0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(100);
  const frozen=await dressing.getAttribute('data-phase');
  await page.waitForTimeout(200);
  assert.equal(await dressing.getAttribute('data-phase'),frozen,'Reduced motion holds current pose');
  if(width===390) for(let i=0;i<5;i++) await page.locator('[data-scene="rides-games"]').getByRole('button',{name:'Look left',exact:true}).click();
  await page.screenshot({path:join(tmpdir(),`carnival-carousel-${width}.png`)});
  if(width===390) await page.locator('[data-scene="rides-games"]').getByRole('button',{name:'Look toward the center',exact:true}).click();
  await page.locator('[data-scene="rides-games"] .location-path').click();
  await page.waitForFunction(()=>document.documentElement.dataset.location==='midway'&&!document.documentElement.dataset.travelling);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const away=await dressing.getAttribute('data-phase');
  await page.waitForTimeout(200);
  assert.equal(await dressing.getAttribute('data-phase'),away,'Off-stage rotation pauses');
  const midwayNode=await page.locator('.composition').elementHandle();
  // Reach Rides & Games by its original Midway destination without replacing Midway.
  if(width===390) for(let i=0;i<5;i++) await page.locator('[data-pan="left"]').click();
  await page.locator('main .entrance').click();
  await page.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
  assert.equal(await dressing.count(),1,'Re-entry reuses the mechanism');
  assert.equal(await midwayNode.evaluate(e=>e===document.querySelector('.composition')),true);
  await page.waitForTimeout(150);
  assert.notEqual(await dressing.getAttribute('data-phase'),away,'Re-entry resumes');
  assert.deepEqual(errors,[]);
  console.log(`${width}px: upright slots, depth layers, rotation, pause/resume, reduced motion, navigation, empty mounts PASS`);
  await page.close();
 }
 // Drive browser animation-frame timestamps deterministically. Navigation's
 // actual dissolve still runs; only animation frames use this controlled clock.
 const page=await browser.newPage();
 page.on('pageerror',error=>console.error('Phase browser error:',error.message));
 page.on('console',message=>{if(message.type()==='error')console.error('Phase console:',message.text());});
 await page.addInitScript(()=>{
  let id=0;const queue=new Map();
  window.requestAnimationFrame=f=>{queue.set(++id,f);return id;};
  window.cancelAnimationFrame=id=>queue.delete(id);
  window.stepCarousel=time=>{const tasks=[...queue.values()];queue.clear();tasks.forEach(f=>f(time));};
 });
 await page.goto(base+'?scene=rides-games');
 await page.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling,null,{polling:100});
 await page.evaluate(()=>stepCarousel(0));
 const before=await page.locator('.carousel-slot').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.carouselSlot,transform:e.getAttribute('transform')})));
 const initialTextures=await page.locator('.carousel-assembly canvas').evaluateAll(nodes=>nodes.map(e=>e.toDataURL()));
 for(const time of [5000,18000,36000]) {
  await page.evaluate(t=>stepCarousel(t),time);
  const yaw=-time/72000*2*Math.PI;
  const angles=await page.locator('.carousel-assembly,[data-yaw]').evaluateAll(nodes=>nodes.map(e=>Number(e.dataset.yaw)));
  angles.forEach(angle=>assert.ok(Math.abs(angle-yaw)<1e-9,'Every structural surface shares the negative yaw'));
  assert.equal(await page.locator('.carousel-floor').getAttribute('transform'),`rotate(${-time/72000*360})`);
  if(time===18000) {
   const slot=await page.locator('[data-carousel-slot="1"]').getAttribute('transform');
   assert.ok(slot.startsWith('translate(768 803)'), 'Right-hand slot travels upward/back: counterclockwise');
   const textures=await page.locator('.carousel-assembly canvas').evaluateAll(nodes=>nodes.map(e=>e.toDataURL()));
   textures.forEach((texture,i)=>assert.notEqual(texture,initialTextures[i],'Column, canopy and rim rotate with floor'));
  }
  await page.screenshot({path:join(tmpdir(),`carnival-carousel-phase-${time}.png`)});
 }
 await page.evaluate(()=>stepCarousel(72000));
 assert.equal(await page.locator('.carousel-dressing').getAttribute('data-phase'),'0','72-second loop returns to same phase');
 const after=await page.locator('.carousel-slot').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.carouselSlot,transform:e.getAttribute('transform')})));
 const parse=s=>s.match(/-?\d+(?:\.\d+)?/g).map(Number);
 for(const a of before){const b=after.find(v=>v.id===a.id);parse(a.transform).forEach((n,i)=>assert.ok(Math.abs(n-parse(b.transform)[i])<.001));}
 assert.deepEqual(await page.locator('.carousel-assembly canvas').evaluateAll(nodes=>nodes.map(e=>e.toDataURL())),initialTextures);
 console.log('Shared counterclockwise yaw, structural texture motion and 72-second seamless orbit PASS');
 await page.close();
 const still=await browser.newPage();
 await still.goto(base+'?scene=rides-games&motion=still&carousel=debug');
 await still.waitForFunction(()=>document.documentElement.dataset.location==='rides-games');
 assert.equal(await still.locator('.carousel-mount-anchor text').count(),12,'Debug-only slot labels');
 assert.equal(await still.locator('.carousel-dressing').getAttribute('data-phase'),'0');
 await still.waitForTimeout(100);
 assert.equal(await still.locator('.carousel-dressing').getAttribute('data-phase'),'0');
 console.log('Still mode and debug slots PASS');
 await still.close();
} finally {await browser.close();}
