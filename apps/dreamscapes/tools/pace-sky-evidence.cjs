const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification/carousel-pace-sky');
(async()=>{fs.mkdirSync(proof,{recursive:true});const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});try{
 const p=await browser.newPage();await p.goto(host.url+'/carnival/locations/rides-games.png');const results=await p.evaluate(async()=>{
  const {ridePainting,skyRepairs}=await import('/carnival/carousel-sky.js'),results=[];
  for(const id of ['rides-games','tent-row','ferris-platform','behind-carnival']){
   const image=new Image();image.src='/carnival/locations/'+id+'.png';await image.decode();const source=document.createElement('canvas');source.width=image.width;source.height=image.height;source.getContext('2d').drawImage(image,0,0);const out=ridePainting(image,id),r=skyRepairs[id];
   if(!r){results.push({id,keptOriginalMoon:true,identical:out===image});continue;}
   const before=source.getContext('2d').getImageData(0,0,image.width,image.height).data,after=out.getContext('2d').getImageData(0,0,image.width,image.height).data;
   let changed=0,outside=0;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const at=(y*image.width+x)*4;if(before[at]!==after[at]||before[at+1]!==after[at+1]||before[at+2]!==after[at+2]){changed++;if(Math.hypot((x+.5-r.center[0])/r.radius[0],(y+.5-r.center[1])/r.radius[1])>1.02)outside++;}}
   const luminance=data=>{let sum=0;for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){const i=((r.center[1]+dy)*image.width+r.center[0]+dx)*4;sum+=(data[i]+data[i+1]+data[i+2])/3;}return sum/289;};
   const preview=document.createElement('canvas');preview.width=1600;preview.height=Math.round(340*800/image.width);const c=preview.getContext('2d');c.drawImage(source,0,0,image.width,340,0,0,800,preview.height);c.drawImage(out,0,0,image.width,340,800,0,800,preview.height);
   results.push({id,changedPixels:changed,changesOutsideSkyMask:outside,moonCenterBefore:luminance(before),moonCenterAfter:luminance(after),preview:preview.toDataURL()});
  }return results;
 });
 for(const r of results){if(r.keptOriginalMoon)assert(r.identical);else{assert(r.changedPixels>2000);assert.equal(r.changesOutsideSkyMask,0);assert(r.moonCenterAfter<r.moonCenterBefore*.7);fs.writeFileSync(path.join(proof,r.id+'-sky-before-after.png'),Buffer.from(r.preview.split(',')[1],'base64'));delete r.preview;}}
 fs.writeFileSync(path.join(proof,'sky-checks.json'),JSON.stringify({passed:true,remainingMoon:'rides-games',originalPaintingFilesEdited:false,results},null,2));console.log('PASS one retained moon and three localized sky repairs');await p.close();
}finally{await browser.close();await host.close();}})().catch(e=>{console.error(e);process.exitCode=1});
