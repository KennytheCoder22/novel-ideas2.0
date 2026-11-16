const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 const app=path.resolve(__dirname,'..');
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 try{
  for(const [name,width,height,touch] of [['desktop',1440,900,false],['narrow-desktop',1024,768,false],['mobile',390,844,true],['small-mobile',320,700,true]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
   const page=await context.newPage();page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(host.url+'/carnival/?scene=fortune-teller');
   await page.waitForFunction(()=>window.DreamscapesCycleSeven&&document.documentElement.dataset.location==='fortune-teller'&&!document.documentElement.dataset.travelling&&document.querySelector('.chest-solid')?.dataset.lockState);
   const lock=page.locator('.chest-lock'),puzzle=page.locator('.chest-puzzle[open]');
   const activate=async locator=>touch?locator.tap():locator.click();
   const state=()=>page.evaluate(()=>DreamscapesCycleSeven.snapshot());
   await activate(lock);await puzzle.waitFor();assert.equal((await state()).phase,'puzzle');
   const wheels=(await state()).wheels;
   await activate(page.locator('.chest-gears button').first());assert.notDeepEqual((await state()).wheels,wheels,'Pointer input turns a puzzle wheel');
   await activate(page.getByRole('button',{name:'Close the padlock puzzle'}));assert.equal((await state()).phase,'idle');
   await activate(lock);await puzzle.waitFor();assert.equal((await state()).phase,'puzzle','Pointer input reopens the chest');
   await activate(page.getByRole('button',{name:'Close the padlock puzzle'}));
   if(!touch){
    const box=await lock.boundingBox();assert(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x-80,box.y+box.height/2,{steps:5});await page.mouse.up();
    assert.equal((await state()).phase,'idle','Dragging away does not activate the lock');
   }
   await lock.focus();await lock.press('Enter');await puzzle.waitFor();assert.equal((await state()).phase,'puzzle','Keyboard activation still works');
   await page.getByRole('button',{name:'Close the padlock puzzle'}).press('Enter');
   assert.deepEqual(errors,[]);
   console.log('PASS chest pointer '+name+' ('+width+'×'+height+')');
   await context.close();
  }
 }finally{await browser.close();await host.close();}
})().catch(error=>{console.error(error);process.exitCode=1});