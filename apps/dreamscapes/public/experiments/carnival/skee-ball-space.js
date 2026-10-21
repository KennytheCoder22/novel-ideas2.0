import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Perspective proxy fitted to four painted runway corners and their vanishing point.
// A proxy unit is 0.338667 m: the 0.45-unit launch is six inches long.
// Image coordinates are always relative to the unchanged 1672 x 941 artwork.
export function createMachineSpace(scene,onChange=()=>{}) {
 const W=1672,H=941,nearHalf=373,farHalf=209.5,depth=6,vanishY=220;
 const K=depth/(1/farHalf-1/nearHalf),sin=(H/2-vanishY)/K,cos=Math.sqrt(1-sin*sin);
 const focal=K*cos,height=(714-vanishY)/nearHalf*cos,distance=K/nearHalf-height*sin/cos;
 const camera=new T.PerspectiveCamera(2*Math.atan(H/(2*focal))*180/Math.PI,W/H,.03,80);
 camera.position.set(0,height,-distance);camera.lookAt(0,height-sin,-distance+cos);
 camera.setViewOffset(W,H,1,0,W,H);camera.updateMatrixWorld(true);
 const project=p=>{const v=p.clone().project(camera);return{x:(v.x+1)*W/2,y:(1-v.y)*H/2};};
 function atZ(x,y,z){const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/W*2-1,1-y/H*2),camera);return ray.ray.at((z-ray.ray.origin.z)/ray.ray.direction.z,new T.Vector3());}
 function atY(x,y,level){const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/W*2-1,1-y/H*2),camera);return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-level),new T.Vector3());}
 const shelfFoot=atZ(379,403,6.5),shelfY=shelfFoot.y;
 const proxies=[],debugGroup=new T.Group();debugGroup.visible=false;scene.add(debugGroup);
 const depthMat=new T.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:T.DoubleSide});
 function geometry(points,uvs){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));g.setIndex([0,1,2,0,2,3]);if(uvs)g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.computeVertexNormals();return g;}
 function proxy(name,g,material=depthMat,cast=true){const m=new T.Mesh(g,material);m.name=name;m.renderOrder=-20;m.castShadow=cast;scene.add(m);proxies.push(m);const outline=new T.LineSegments(new T.EdgesGeometry(g),new T.LineBasicMaterial({color:name.includes('fence')?0x80e4ef:0xffd277,depthTest:false,transparent:true,opacity:.8}));outline.renderOrder=10;debugGroup.add(outline);return m;}
 function bar(name,a,b,r=.035){const g=new T.CylinderGeometry(r,r,a.distanceTo(b),10);g.applyMatrix4(new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()),new T.Vector3(1,1,1)));return proxy(name,g);}
 const construction={metersPerUnit:.3386666667,toe:3.2,crest:3.65,rise:.1,wellEnd:6,wellFloor:-.18,scoringBase:0,landing:2.5};
 const runway=geometry([new T.Vector3(-1,0,0),new T.Vector3(1,0,0),new T.Vector3(1,0,construction.toe),new T.Vector3(-1,0,construction.toe)]);
 proxy('flat wooden alley floor',runway,depthMat,false);
 // Shadow receivers only darken the existing image; the floor is never redrawn.
 const floorShadow=new T.Mesh(runway,new T.ShadowMaterial({opacity:.48,side:T.DoubleSide}));floorShadow.receiveShadow=true;floorShadow.renderOrder=-10;scene.add(floorShadow);
 const shelfPixels=[[247,378],[438,415],[438,393],[259,357]];
 const shelfPoints=shelfPixels.map(([x,y])=>atY(x,y,shelfY));
 const shelf=proxy('middle-left shelf',geometry(shelfPoints));
 const shelfShadow=new T.Mesh(shelf.geometry,new T.ShadowMaterial({opacity:.62,side:T.DoubleSide}));shelfShadow.receiveShadow=true;shelfShadow.position.y=.002;shelfShadow.renderOrder=-9;scene.add(shelfShadow);
 // An actual upper shelf and side panel shade the waiting toy under its recess.
 const roofY=atZ(378,264,6.5).y;
 proxy('shelf canopy',geometry([[247,216,6.5],[440,267,6.5],[440,243,7.3],[260,196,7.3]].map(([x,y,z])=>atZ(x,y,z))));
 proxy('shelf back',geometry([new T.Vector3(-3.3,shelfY,7.3),new T.Vector3(-1.65,shelfY,7.3),new T.Vector3(-1.65,roofY,7.3),new T.Vector3(-3.3,roofY,7.3)]));
 const fenceHeight=z=>.16+1.36*T.MathUtils.clamp(z/6,0,1);
 const fenceX=z=>1.38-.38*T.MathUtils.clamp(z/6,0,1);
 for(const side of [-1,1]){
  const bottomNear=new T.Vector3(side*1.02,.025,0),bottomFar=new T.Vector3(side*1.02,.025,6);
  const topNear=new T.Vector3(side*fenceX(0),fenceHeight(0),0),topFar=new T.Vector3(side*fenceX(6),fenceHeight(6),6);
  bar((side>0?'left':'right')+' wooden alley rail',bottomNear,bottomFar,.045);
  bar((side>0?'left':'right')+' protective fence top',topNear,topFar,.033);
  const netMat=new T.ShaderMaterial({colorWrite:false,depthWrite:true,side:T.DoubleSide,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){vec2 p=abs(fract(vUv*vec2(35.,10.))-.5);if(p.x<.465&&p.y<.465)discard;gl_FragColor=vec4(0.);}' });
  proxy((side>0?'left':'right')+' wire fence',geometry([bottomNear,bottomFar,topFar,topNear],[0,0,1,0,1,1,0,1]),netMat,false);
  for(const z of [0,1.5,3,4.5,6])bar('fence support',new T.Vector3(side*1.02,.02,z),new T.Vector3(side*fenceX(z),fenceHeight(z),z),.015);
 }
 for(const side of [-1,1])bar('launch side rail cap',new T.Vector3(side*1.02,construction.rise-.025,construction.toe),new T.Vector3(side*1.02,construction.rise-.025,construction.crest),.025);
 const scoring=geometry([new T.Vector3(-1,construction.scoringBase,6),new T.Vector3(1,construction.scoringBase,6),atZ(1015,194,9),atZ(656,194,9)]);
 proxy('scoring board',scoring);
 // The flat alley, short S-profile launch, recessed return well and scoring deck are separate solids.
 const constructionMeshes=[],woodTexture=new T.TextureLoader().load('./skee-ball/approved-alley.png',onChange);woodTexture.colorSpace=T.SRGBColorSpace;
 const woodMaterial=new T.MeshBasicMaterial({map:woodTexture,vertexColors:true,side:T.DoubleSide});
 const rampY=u=>construction.rise*(-1.2*u*u*u+2.2*u*u);
 function textured(name,points,shades){const g=geometry(points);const uv=[],colors=[];for(let i=0;i<points.length;i++){const q=project(new T.Vector3(points[i].x,0,points[i].z));uv.push(q.x/W,1-q.y/H);const shade=shades[i];colors.push(shade,shade,shade);}g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));const m=new T.Mesh(g,woodMaterial);m.name=name;m.renderOrder=-12;scene.add(m);constructionMeshes.push(m);return m;}
 const rampSamples=[];
 for(let i=0;i<32;i++){const u=i/32,v=(i+1)/32,z=construction.toe+u*(construction.crest-construction.toe),z2=construction.toe+v*(construction.crest-construction.toe),y=rampY(u),y2=rampY(v),shade=t=>1-.42*Math.sin(t*Math.PI);
  textured('curved full-width launch ramp',[new T.Vector3(-1,y,z),new T.Vector3(1,y,z),new T.Vector3(1,y2,z2),new T.Vector3(-1,y2,z2)],[shade(u),shade(u),shade(v),shade(v)]);
  rampSamples.push({u,world:[0,y,z],image:project(new T.Vector3(0,y,z))});
 }
 const pieces=constructionMeshes.splice(0,32),joined=new T.Mesh(mergeGeometries(pieces.map(p=>p.geometry)),woodMaterial);joined.name='curved full-width launch ramp';joined.renderOrder=-12;scene.add(joined);constructionMeshes.push(joined);for(const p of pieces){scene.remove(p);p.geometry.dispose();}
 rampSamples.push({u:1,world:[0,construction.rise,construction.crest],image:project(new T.Vector3(0,construction.rise,construction.crest))});
 const C=construction.crest,E=construction.wellEnd,B=construction.wellFloor,R=construction.rise,D=construction.scoringBase;
 textured('launch edge thickness',[new T.Vector3(-1,R-.015,C),new T.Vector3(1,R-.015,C),new T.Vector3(1,R,C),new T.Vector3(-1,R,C)],[.43,.43,.85,.85]);
 textured('recessed return floor',[new T.Vector3(-1,B,C),new T.Vector3(1,B,C),new T.Vector3(1,B,E),new T.Vector3(-1,B,E)],[.018,.018,.04,.04]);
 textured('return well rear wall',[new T.Vector3(-1,B,E),new T.Vector3(1,B,E),new T.Vector3(1,D,E),new T.Vector3(-1,D,E)],[.006,.006,.12,.12]);
 textured('return well front wall',[new T.Vector3(-1,B,C),new T.Vector3(1,B,C),new T.Vector3(1,R-.015,C),new T.Vector3(-1,R-.015,C)],[.04,.04,.2,.2]);
 for(const side of [-1,1])textured('return well side wall',[new T.Vector3(side,B,C),new T.Vector3(side,B,E),new T.Vector3(side,D,E),new T.Vector3(side,R,C)],[.01,.015,.2,.3]);
 const edge=project(new T.Vector3(0,R,C)),toe=project(new T.Vector3(0,0,construction.toe));
 construction.rampLengthMeters=(C-construction.toe)*construction.metersPerUnit;construction.rampSamples=rampSamples;construction.projected={toe,crest:edge,wellRear:project(new T.Vector3(0,D,E)),wellFloor:project(new T.Vector3(0,B,(C+E)/2))};
 const collision={laneHalfWidth:1,runwayDepth:construction.toe,construction,fenceHeight,fenceX,shelfFoot:shelfFoot.toArray(),shelfY,landing:[0,0,construction.landing],stop:[0,0,.35]};
 return{construction,constructionMeshes,woodTexture,camera,project,atY,atZ,shelfFoot,shelfY,fenceHeight,fenceX,collision,proxies,floorShadow,shelfShadow,debugGroup,
  setDebug:value=>{debugGroup.visible=value;},
  calibration:{corners:[[-1,0,0],[1,0,0],[-1,0,6],[1,0,6]].map(p=>({world:p,image:project(new T.Vector3(...p))})),focal,height,distance,vanishY},
  dispose(){const gs=new Set(),ms=new Set();for(const o of [...proxies,...constructionMeshes,floorShadow,shelfShadow,...debugGroup.children]){if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);}for(const g of gs)g.dispose();for(const m of ms)m.dispose();woodTexture.dispose();}
 };
}
