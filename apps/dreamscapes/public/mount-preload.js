import {mountVariants,resolveMountVariant} from './experiments/carnival/mount-variants.js';
// Bump when the GLBs change. CacheStorage survives portal -> Carnival navigation.
const cacheName='dreamscapes-mounts-jpeg75-20261017-v2';
const base=new URL('./experiments/carnival/',import.meta.url);
const pending=new Map(),queue=[];
let active=0,selected;
export const preloadMetrics=[];
function pump(){
 while(active<4&&queue.length){const job=queue.shift();active++;job.run().then(job.resolve,job.reject).finally(()=>{active--;pump();});}
}
export function fetchMount(config){
 const url=new URL(config.url,base).href;
 if(pending.has(url))return pending.get(url);
 const task=new Promise((resolve,reject)=>{queue.push({resolve,reject,run:async()=>{
  const start=performance.now();let cache,cached;
  try{cache=await caches.open(cacheName);cached=await cache.match(url);}catch{}
  const lookupDone=performance.now();
  const response=cached||await fetch(url,{cache:'force-cache'});
  if(!response.ok)throw new Error(`Mount HTTP ${response.status}: ${url}`);
  // Keep bytes, not parsed Three scenes, in the cross-page cache.
  const bytes=await response.arrayBuffer(),downloadDone=performance.now();
  if(!cached&&cache)try{await cache.put(url,new Response(bytes,{headers:response.headers}));}catch{}
  preloadMetrics.push({url,bytes:bytes.byteLength,fetchMs:performance.now()-start,cacheLookupMs:lookupDone-start,downloadOrCacheReadMs:downloadDone-lookupDone,cacheWriteMs:performance.now()-downloadDone,persistentCacheHit:!!cached});
  return bytes;
 }});pump();});
 pending.set(url,task);task.catch(()=>pending.delete(url));return task;
}
export function preloadMountStyle(style){
 selected=style;
 const ids=Object.keys(mountVariants);let index=0;
 // Queue only this style. A newly selected band stops enqueueing the old set.
 return Promise.all(Array.from({length:4},async()=>{
  while(selected===style&&index<ids.length){const config=resolveMountVariant(ids[index++],style);try{await fetchMount(config);}catch{/* Runtime decides genuine per-mount fallback. */}}
 }));
}
window.carouselPreloadDiagnostics=()=>({style:selected,active,queued:queue.length,assets:preloadMetrics.slice()});
