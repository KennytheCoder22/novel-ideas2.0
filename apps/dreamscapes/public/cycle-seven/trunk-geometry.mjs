// One rigid lid, projected around a stationary rear hinge. Reference coordinates
// are in the right-hand 887px panel. No interpolated body images or affine shear.
export function solve(a,b){a=a.map((r,i)=>[...r,b[i]]);for(let i=0;i<b.length;i++){let k=i;for(let j=i+1;j<b.length;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;[a[i],a[k]]=[a[k],a[i]];const d=a[i][i];for(let j=i;j<=b.length;j++)a[i][j]/=d;for(let r=0;r<b.length;r++)if(r!==i){const f=a[r][i];for(let j=i;j<=b.length;j++)a[r][j]-=f*a[i][j];}}return a.map(r=>r[b.length]);}
export function homography(q){const a=[],b=[];[[0,0],[1,0],[1,1],[0,1]].forEach(([x,y],i)=>{const [u,v]=q[i];a.push([x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]);b.push(u,v);});return solve(a,b);}
const h=homography([[280,342],[729,381],[517,445],[134,397]]);
// Fit the camera's vertical axis to both supplied open-lid corners, keeping
// the box footprint and hinge fixed. A small least-squares registration absorbs
// the reference views' different vanishing points.
const angle=100*Math.PI/180,cy=Math.cos(angle),sz=Math.sin(angle),rows=[],rhs=[];
[[0,272,123],[1,694,139]].forEach(([x,u,v])=>{const den=h[6]*x+h[7]*cy+1;rows.push([sz,0,-u*sz],[0,sz,-v*sz]);rhs.push(u*den-(h[0]*x+h[1]*cy+h[2]),v*den-(h[3]*x+h[4]*cy+h[5]));});
const ata=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>rows.reduce((s,r)=>s+r[i]*r[j],0))),atb=[0,1,2].map(i=>rows.reduce((s,r,k)=>s+r[i]*rhs[k],0));const z=solve(ata,atb);
export function project(x,y,height){const d=h[6]*x+h[7]*y+z[2]*height+1;return [(h[0]*x+h[1]*y+h[2]+z[0]*height)/d,(h[3]*x+h[4]*y+h[5]+z[1]*height)/d];}
export function lidGeometry(progress){const a=Math.max(0,Math.min(1,progress))*angle;return [[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>project(x,y*Math.cos(a),y*Math.sin(a)));}
export function mapQuad(q,u,v){const m=homography(q),d=m[6]*u+m[7]*v+1;return [(m[0]*u+m[1]*v+m[2])/d,(m[3]*u+m[4]*v+m[5])/d];}

export function lidLowerGeometry(progress){const a=Math.max(0,Math.min(1,progress))*angle;return [[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>project(x,y*Math.cos(a)+.035*Math.sin(a),y*Math.sin(a)-.035*Math.cos(a)));}
