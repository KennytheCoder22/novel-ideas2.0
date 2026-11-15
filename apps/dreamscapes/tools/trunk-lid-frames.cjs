// Authoring captures only. This does not exercise the Borrowed Light story.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const app=path.resolve(__dirname,'..'),out=process.env.CHEST_EVIDENCE||path.join(app,'.tmp/lid-geometry/integrated');fs.mkdirSync(out,{recursive:true});
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 try{
  for(const version of ['baseline','candidate']){
   const page=await browser.newPage({viewport:{width:1000,height:1000}});
   let source=version==='baseline'?execFileSync('git',['show','5338ada43d8da766949172a2c0de472de070c7dd:apps/dreamscapes/public/cycle-seven/trunk-renderer.mjs'],{cwd:app,encoding:'utf8'}):fs.readFileSync(path.join(app,'public/cycle-seven/trunk-renderer.mjs'),'utf8');
   // Three-times magnification of the production renderer, without altering geometry.
   source=source.replace('canvas.width=1672;canvas.height=941','canvas.width=5016;canvas.height=2823').replace('ctx.clearRect(0,0,1672,941);','ctx.setTransform(3,0,0,3,0,0);ctx.clearRect(0,0,1672,941);');
   await page.route('**/cycle-seven/trunk-renderer.mjs',r=>r.fulfill({body:source,contentType:'text/javascript'}));
   await page.goto(host.url+'/carnival/?scene=fortune-teller');
   await page.evaluate(async()=>{window.review=(await import('/cycle-seven/trunk-renderer.mjs')).createTrunk(document.body);await review.ready;for(const n of [...document.body.children])if(n!==review.canvas)n.style.display='none';document.body.style.background='#18141a';review.canvas.style.cssText='position:fixed;left:-3050px;top:-1700px;width:5016px;height:2823px;z-index:99999;';});
   for(const [label,value] of [['opening-0',0],['opening-25',.25],['opening-50',.5],['opening-75',.75],['opening-100',1],['closing-75',.75],['closing-50',.5],['closing-25',.25],['closing-0',0]]){
    await page.evaluate(v=>review.pose(v),value);await page.screenshot({path:path.join(out,`${version}-${label}.png`)});
   }
   await page.close();
  }
  const labels=['opening-0','opening-25','opening-50','opening-75','opening-100','closing-75','closing-50','closing-25','closing-0'];
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>Rigid trunk lid comparisons</title><style>body{background:#18141a;color:#eee;font:18px system-ui;margin:24px}section{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:30px}img{width:100%}h2{grid-column:1/-1}figure{margin:0}</style><h1>Trunk lid authoring comparisons</h1><p>Baseline left; rigid lid candidate right. Production artwork at 3× magnification. Functional verification pending.</p>${labels.map(l=>`<section><h2>${l}</h2>${['baseline','candidate'].map(v=>`<figure><figcaption>${v}</figcaption><img src="${v}-${l}.png"></figure>`).join('')}</section>`).join('')}`);
  console.log('Authoring frames: '+out);
 }finally{await browser.close();await host.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
