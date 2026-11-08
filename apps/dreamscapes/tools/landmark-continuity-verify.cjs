// Run final-source browser checks sequentially so model loads and video encoding
// do not compete with another browser suite. Nothing is pushed or deployed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification/landmark-continuity'),artifacts=path.join(app,'playtest-artifacts/landmark-continuity');
const env={...process.env,DREAMSCAPES_REUSE_UNCHANGED_SCENES:'1',PLAYWRIGHT_MODULE:process.env.PLAYWRIGHT_MODULE||'C:/Users/KenBR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',BROWSER_EXE:process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',DREAMSCAPES_ONBOARD_EVIDENCE_DIR:path.join(artifacts,'final-verified'),DREAMSCAPES_LIFECYCLE_EVIDENCE_DIR:path.join(artifacts,'lifecycle'),DREAMSCAPES_EVIDENCE_DIR:path.join(artifacts,'regression')};
const files=['carousel-onboard.js','carousel-environment.js','platform.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,'public/experiments/carnival',f))).digest('hex')]));
const steps=[['composition',['tools/landmark-continuity-browser.cjs','--mode=composition']],['views',['tools/landmark-continuity-browser.cjs','--mode=views']],['lifecycle',['tools/onboard-lifecycle.cjs']],['carnival',['tools/playtest.cjs','--no-comparison','--observations','--no-video']],['onboard',['tools/onboard-browser.cjs']]];
const from=process.argv.find(s=>s.startsWith('--from='))?.slice(7),selected=from?steps.slice(steps.findIndex(([name])=>name===from)):steps;
assert(selected.length&&(!from||steps.some(([name])=>name===from)),'Unknown verification step');
const oldRunFile=path.join(proof,'workflow-results.json'),oldRun=fs.existsSync(oldRunFile)?JSON.parse(fs.readFileSync(oldRunFile)):null;
const changed=cp.execFileSync('git',['diff','--name-only','5b9e7439','--','public'],{cwd:app,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const allowed=new Set(files.map(f=>'apps/dreamscapes/public/experiments/carnival/'+f));
if(!oldRun||oldRun.sourceHashes?.['platform.js']!==hashes()['platform.js']||changed.some(f=>!allowed.has(f)))env.DREAMSCAPES_REUSE_UNCHANGED_SCENES='0';
const result={startedAt:new Date().toISOString(),sourceHashes:hashes(),reuseUnchangedSceneControllers:env.DREAMSCAPES_REUSE_UNCHANGED_SCENES==='1',priorVerifiedSteps:from&&JSON.stringify(oldRun?.sourceHashes)===JSON.stringify(hashes())?[...(oldRun.priorVerifiedSteps||[]),...(oldRun.steps||[])].filter(s=>s.passed):[],steps:[]};
fs.mkdirSync(proof,{recursive:true});
for(const [name,args]of selected){
 console.log('START '+name);const started=Date.now(),run=cp.spawnSync(process.execPath,args,{cwd:app,env,stdio:'inherit'});
 result.steps.push({name,passed:run.status===0,exitCode:run.status,wallTimeMs:Date.now()-started});fs.writeFileSync(path.join(proof,'workflow-results.json'),JSON.stringify(result,null,2));
 if(run.status!==0){process.exitCode=1;break;}
 assert.deepEqual(hashes(),result.sourceHashes,'Runtime source changed during verification');
}
result.finishedAt=new Date().toISOString();result.passed=result.steps.length===selected.length&&result.steps.every(s=>s.passed);fs.writeFileSync(path.join(proof,'workflow-results.json'),JSON.stringify(result,null,2));
