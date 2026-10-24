import * as T from './vendor/three.module.js';
// A snapshot of the actual skinned surface: original UVs and tag, no replacement artwork.
export function createMaraSand(rig,scene,landing){
 const source=rig.mesh,g=source.geometry,p=g.attributes.position,uv=g.attributes.uv,ix=g.index;
 const positions=new Float32Array(p.count*3),normals=new Float32Array(p.count*3),v=new T.Vector3(),n=new T.Vector3(),skinned=new T.Vector3();
 for(let i=0;i<p.count;i++){
  source.getVertexPosition(i,skinned);v.copy(skinned).applyMatrix4(source.matrixWorld).toArray(positions,i*3);
  n.fromBufferAttribute(p,i).add(v.fromBufferAttribute(g.attributes.normal,i));
  source.applyBoneTransform(i,n).sub(skinned).transformDirection(source.matrixWorld).toArray(normals,i*3);
 }
 const body=[],tag=[],triangles=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();let area=0;
 // These three original faces form the printed paper panel. The tag bone also
 // weights surrounding fur, so skin weights cannot identify the surviving object.
 const tagFaces=new Set([7602,7756,8274]);
 for(let j=0;j<(ix?ix.count:p.count);j+=3){const ids=[0,1,2].map(k=>ix?ix.getX(j+k):j+k);if(tagFaces.has(j/3))tag.push(...ids);else{body.push(...ids);a.fromArray(positions,ids[0]*3);b.fromArray(positions,ids[1]*3);c.fromArray(positions,ids[2]*3);area+=b.sub(a).cross(c.sub(a)).length()/2;triangles.push({ids,area});}}
 if(!tag.length)throw new Error('Mara tag surface missing');
 function geometry(indices){const out=new T.BufferGeometry();out.setAttribute('position',new T.BufferAttribute(positions.slice(),3));out.setAttribute('uv',uv.clone());out.setAttribute('normal',new T.BufferAttribute(normals.slice(),3));out.setIndex(indices);return out;}
 const clock={value:0},bodyMaterial=source.material.clone();
 const erosion=`
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float grain(vec3 p){return .68*noise(p*23.)+.23*noise(p*61.)+.09*noise(p*153.);}
 float release(vec3 p){return .12+2.4*grain(p);}`;
 bodyMaterial.onBeforeCompile=s=>{s.uniforms.sandTime=clock;s.vertexShader='varying vec3 sandPosition;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsandPosition=position;');s.fragmentShader='uniform float sandTime;varying vec3 sandPosition;\n'+erosion+'\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(release(sandPosition)<sandTime)discard;');};
 bodyMaterial.customProgramCacheKey=()=> 'mara-dust-erosion-v3';
 const shell=new T.Mesh(geometry(body),bodyMaterial);scene.add(shell);
 const tagGeometry=geometry(tag),tagBox=new T.Box3();for(const i of tag)tagBox.expandByPoint(new T.Vector3().fromArray(positions,i*3));const start=tagBox.getCenter(new T.Vector3());tagGeometry.translate(-start.x,-start.y,-start.z);
 const tagMaterial=source.material.clone();tagMaterial.side=T.DoubleSide;const label=new T.Mesh(tagGeometry,tagMaterial);label.position.copy(start);scene.add(label);
 // Sample surface area, rather than vertex density, so the grains cover the entire fox evenly.
 let seed=17023;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const count=26000,points=new Float32Array(count*3),colors=new Float32Array(count*3),randoms=new Float32Array(count*3);
 const image=source.material.map?.image,texture=document.createElement('canvas');texture.width=image?.width||1;texture.height=image?.height||1;const ctx=texture.getContext('2d',{willReadFrequently:true});if(image)ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,texture.width,texture.height).data;
 for(let i=0;i<count;i++){const pick=random()*area;let lo=0,hi=triangles.length-1;while(lo<hi){const m=(lo+hi)>>1;if(triangles[m].area<pick)lo=m+1;else hi=m;}const ids=triangles[lo].ids,r=Math.sqrt(random()),s=random(),w=[1-r,r*(1-s),r*s];v.set(0,0,0);let u=0,t=0;ids.forEach((id,k)=>{v.addScaledVector(a.fromArray(positions,id*3),w[k]);u+=uv.getX(id)*w[k];t+=uv.getY(id)*w[k];});v.toArray(points,i*3);const x=Math.min(texture.width-1,Math.max(0,Math.floor(u*texture.width))),y=Math.min(texture.height-1,Math.max(0,Math.floor((source.material.map?.flipY?1-t:t)*texture.height))),n=(y*texture.width+x)*4;new T.Color(pixels[n]/255,pixels[n+1]/255,pixels[n+2]/255).convertSRGBToLinear().multiplyScalar(.72).toArray(colors,i*3);randoms.set([random(),random(),random()],i*3);}
 const grainsGeometry=new T.BufferGeometry();grainsGeometry.setAttribute('position',new T.BufferAttribute(points,3));grainsGeometry.setAttribute('color',new T.BufferAttribute(colors,3));grainsGeometry.setAttribute('jitter',new T.BufferAttribute(randoms,3));
 const grainsMaterial=new T.ShaderMaterial({uniforms:{sandTime:clock,settleShift:{value:new T.Vector3(landing.x-start.x,0,landing.z-start.z)}},transparent:true,depthWrite:false,vertexColors:true,
 vertexShader:`uniform float sandTime;uniform vec3 settleShift;attribute vec3 jitter;varying float alpha;varying vec3 tint;varying float soft;varying float seed;${erosion}
 void main(){
  float age=sandTime-release(position);float t=max(0.,age);vec3 p=position;
  soft=step(.77,jitter.z);seed=jitter.x*19.;
  // Small eddies open into soft dust wisps; gravity takes over after a suspended beat.
  float falling=max(0.,t-.18),acceleration=mix(.75,.48,soft);
  float duration=sqrt(max(.01,position.y)/acceleration);
  float travel=clamp(falling/duration,0.,1.);
  float spread=(1.-exp(-t*2.))*mix(.11,.18,soft)*(1.-.45*travel);
  p.x+=spread*(sin(position.y*17.+t*2.1)+.5*sin(position.z*13.+t*3.7)+.18*sin(seed));
  p.z+=spread*.5*(cos(position.x*16.+t*1.6)+.12*sin(seed));
  p.xz+=settleShift.xz*travel;
  float height=p.y-acceleration*falling*falling;
  p.y=max(.006,height);
  alpha=step(0.,age)*smoothstep(0.,.09,t)*smoothstep(.006,.09,height)*mix(.36,.16,soft);
  float luma=dot(color,vec3(.2126,.7152,.0722));tint=mix(color,vec3(luma)*vec3(1.10,.95,.78),.64);
  vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(mix(3.8,36.,soft)*(1.+min(t,1.5)*.75)/-mv.z,1.,44.);
 }`,
 fragmentShader:`varying float alpha;varying vec3 tint;varying float soft;varying float seed;
 void main(){vec2 q=gl_PointCoord*2.-1.;float r=length(q);if(r>1.||alpha<.001)discard;
 float edge=exp(-r*r*mix(3.,4.5,soft))*(1.-smoothstep(.65,1.,r));
 float texture=.75+.25*sin(q.x*13.+seed)*sin(q.y*17.+seed);
 gl_FragColor=vec4(tint,alpha*edge*texture);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const grains=new T.Points(grainsGeometry,grainsMaterial);grains.frustumCulled=false;scene.add(grains);rig.group.visible=false;
 // Land the paper face-up. Its geometry keeps the original printing and ragged shape.
 a.fromArray(positions,tag[0]*3);b.fromArray(positions,tag[1]*3);c.fromArray(positions,tag[2]*3);
 const paperNormal=b.sub(a).cross(c.sub(a)).normalize();
 const finishRotation=new T.Quaternion().setFromUnitVectors(paperNormal,new T.Vector3(0,1,0));const rotated=tagGeometry.attributes.position;let minimum=Infinity;for(const i of tag){v.fromBufferAttribute(rotated,i).applyQuaternion(finishRotation);minimum=Math.min(minimum,v.y);}landing=landing.clone();landing.y=.012-minimum;
 function update(seconds){clock.value=Math.max(0,seconds);shell.visible=seconds<2.52;const u=T.MathUtils.clamp((seconds-.7)/4.5,0,1),fall=u*u*(3-2*u),flutter=Math.sin(Math.PI*u);label.position.lerpVectors(start,landing,fall);label.position.x+=Math.sin(u*Math.PI*5)*flutter*.13;label.position.z+=Math.sin(u*Math.PI*3)*flutter*.07;label.quaternion.identity().slerp(finishRotation,fall);label.rotateY(Math.sin(u*Math.PI*6)*flutter*.6);label.rotateZ(Math.sin(u*Math.PI*5)*flutter*.38);return seconds>=5.6;}
 return{update,stats:{tagTriangles:tag.length/3,bodyTriangles:body.length/3,grains:count},dispose(){for(const o of[shell,label,grains]){scene.remove(o);o.geometry.dispose();o.material.dispose();}rig.group.visible=true;}};
}
