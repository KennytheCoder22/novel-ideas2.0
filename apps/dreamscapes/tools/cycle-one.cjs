const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const baseline='02edf968e484bf13adea4e3ccea82864d685ce2f';
const before=process.argv.includes('--before');
const width=process.argv.find(a=>a.startsWith('--width='))?.slice(8);
const out=path.resolve(__dirname,'../playtest-artifacts/cycle-one',(before?'before-targeted':'after-targeted')+(width?'-'+width:''));
const results=[];
(async()=>{
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer());
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 try{for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]){
  if(width&&String(viewport.width)!==width)continue;
  const name=viewport.width+'px',dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  const context=await browser.newContext({viewport,recordVideo:{dir,size:viewport}});
  if(before)for(const file of ['index.html','navigation.js','navigation.css','play-rooms.css']){
   const body=execFileSync('git',['show',`${baseline}:apps/dreamscapes/public/experiments/carnival/${file}`]);
   await context.route(url=>url.pathname==='/carnival/'+(file==='index.html'?'':file),route=>route.fulfill({body,contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html'}));
  }
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  page.setDefaultTimeout(60000);
  const snap=label=>page.screenshot({path:path.join(dir,label+'.png'),timeout:60000});
  const arrive=id=>page.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.dataset.travelling,id);
  await page.goto(host.url+'/carnival/?scene=fortune-teller');await arrive('fortune-teller');
  // Real Tab input starts at the scene focus assigned by navigation.
  await page.keyboard.press('Tab');await page.keyboard.press('Tab');await page.waitForTimeout(200);
  const focus=await page.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect(),s=getComputedStyle(e);return {label:e.getAttribute('aria-label'),outline:s.outlineStyle,outlineWidth:s.outlineWidth,x:r.x,width:r.width,scroll:e.closest('.location-view').scrollLeft};});
  await snap('keyboard-sign');
  const keyboardVisible=focus.outline!=='none'&&parseFloat(focus.outlineWidth)>0;
  const cameraStable=focus.scroll===0&&focus.x+focus.width>0&&focus.x<viewport.width;
  if(!before){assert(keyboardVisible,'Keyboard sign focus must be visible');assert(cameraStable,'Keyboard focus must reveal a path without scrolling the camera');}
  await page.keyboard.press('Enter');await arrive('rides-games');
  await page.goto(host.url+'/carnival/?scene=fun-house');await arrive('fun-house');
  for(const kind of ['tall','wide','endless']){const mirror=page.getByRole('button',{name:`Examine the ${kind} mirror`,exact:true});await mirror.focus();await page.waitForTimeout(100);await mirror.press('Enter');}
  await snap('mirror-routes');
  const routes=await page.locator('[data-scene="fun-house"] .room-route').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,label:e.textContent};}));
  const noOverlap=routes[0].x+routes[0].width<=routes[1].x&&routes.every(r=>r.x>=0&&r.x+r.width<=viewport.width);
  if(!before)assert(noOverlap,'Both mirror routes must fit independently');
  // The unlocked onward route must remain actionable after the layout correction.
  await page.getByRole('button',{name:'Walk to Tent Row',exact:true}).click();await arrive('tent-row');
  const observations=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('carnival-experiment-observations')||'[]'));
  assert.deepEqual(errors,[]);
  if(before){assert(!keyboardVisible,'Approved baseline must reproduce invisible sign focus');if(viewport.width===320)assert(!noOverlap,'Approved baseline must reproduce overlapping routes');}
  results.push({name,focus,keyboardVisible,cameraStable,routes,noOverlap,observations,errors});
  await context.close();console.log(name,JSON.stringify(results.at(-1)));
 }assert(results.length,'No viewport matched');}finally{await browser.close();await host.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({before,baseline,results},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
