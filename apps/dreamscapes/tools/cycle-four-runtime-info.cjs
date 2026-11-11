const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});try{
 const session=await browser.newBrowserCDPSession(),gpu=await session.send('SystemInfo.getInfo'),version=await session.send('Browser.getVersion');
 // Retain renderer/driver evidence, without the command line or machine identifiers.
 const p=await browser.newPage();await p.goto('data:text/html,<canvas></canvas>');const webgl=await p.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {webgl2:!!gl,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,gpuTimerQueries:!!gl?.getExtension('EXT_disjoint_timer_query_webgl2'),maxTextureSize:gl?.getParameter(gl.MAX_TEXTURE_SIZE),devicePixelRatio};});
 const result={version:{product:version.product,revision:version.revision,jsVersion:version.jsVersion},gpu:{devices:gpu.gpu.devices,auxAttributes:gpu.gpu.auxAttributes,featureStatus:gpu.gpu.featureStatus},webgl,scope:'Automated Edge environment. This is not a measurement on a physical mobile device or the user browser tab.'};
 fs.writeFileSync(path.join(app,'verification/cycle-four/performance/runtime.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({version:result.version,webgl,devices:result.gpu.devices}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
