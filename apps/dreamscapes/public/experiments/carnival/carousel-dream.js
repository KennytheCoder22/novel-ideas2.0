// Presentation only: this never changes source assets or the rider's seat transform.
export const dreamDefaults=Object.freeze({intensity:.85,start:18,transition:4,restoreAt:28,restoreDuration:6,fovChange:10,spaceScale:2.7,canopyRise:1.2,environmentDisplacement:.7});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
export function dreamConfig(input={}){
 const c={...dreamDefaults};for(const k of Object.keys(c))if(Number.isFinite(input[k]))c[k]=input[k];
 c.intensity=clamp(c.intensity,0,1.25);c.start=clamp(c.start,18,25);c.transition=clamp(c.transition,.5,5);
 c.restoreAt=clamp(c.restoreAt,c.start+c.transition,30);c.restoreDuration=clamp(c.restoreDuration,.5,35-c.restoreAt);
 c.fovChange=clamp(c.fovChange,0,16);c.spaceScale=clamp(c.spaceScale,1,3.5);c.canopyRise=clamp(c.canopyRise,0,2);c.environmentDisplacement=clamp(c.environmentDisplacement,-1,1);return c;
}
export function dreamAmount(time,config=dreamDefaults){
 const c=dreamConfig(config);
 return c.intensity*smooth((time-c.start)/c.transition)*(1-smooth((time-c.restoreAt)/c.restoreDuration));
}
