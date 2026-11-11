// Reuse the established Platform assembly, not a separate wheel illustration.
// Its supports, source-image geometry and architectural mask stay canonical.
const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
async function dataURL(src){const blob=await (await fetch(src)).blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
export async function ferrisEnvironment(background){
 const parent=document.createElement('div'),plane=document.createElement('div');parent.append(plane);
 // Geometry-only template: no hidden animation clock or event listeners.
 await window.CarnivalPlatform.mount(plane,{animate:false});
 const svg=plane.querySelector('svg'),wheel=svg.querySelector('.platform-wheel');
 const urls=new Map();await Promise.all([...new Set([...wheel.querySelectorAll('image')].map(n=>n.getAttribute('href')))].map(async url=>urls.set(url,await dataURL(url))));
 for(const image of wheel.querySelectorAll('image'))image.setAttribute('href',urls.get(image.getAttribute('href')));
 async function layer(selector){
  const copy=svg.cloneNode(false);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width','1672');copy.setAttribute('height','941');copy.append(svg.querySelector('defs').cloneNode(true));
  const group=wheel.querySelector(selector).cloneNode(true);copy.append(group);
  return load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(copy)));
 }
 const [rear,front]=await Promise.all([layer('.platform-support-rear'),layer('.platform-support-front')]);
 const rotor=wheel.querySelector('.platform-rotor'),pivot=rotor.getAttribute('transform').match(/rotate\([^ ]+ ([^ ]+) ([^)]+)\)/).slice(1).map(Number);
 const sprite=async node=>({image:await load(node.getAttribute('href')),rect:['x','y','width','height'].map(a=>Number(node.getAttribute(a)))});
 const frame=await sprite(rotor.querySelector(':scope > image'));
 const cabins=await Promise.all([...rotor.querySelectorAll('.platform-cabin')].map(async node=>{const m=node.parentElement.transform.baseVal.getItem(0).matrix;return {...await sprite(node.querySelector('image')),x:m.e-pivot[0],y:m.f-pivot[1]};}));
 const masks=['platform-architecture','platform-loading-rails'].map(id=>({path:new Path2D(svg.querySelector('#'+id+' path').getAttribute('d')),rule:id==='platform-architecture'?'evenodd':'nonzero'}));
 const out=document.createElement('canvas');out.width=1672;out.height=941;const c=out.getContext('2d');
 let last=-Infinity;
 function paint(time,still=false){
  // Reference compositor for pixel checks; live animation uses meshes below.
  const step=still?0:Math.floor(time/125);if(step===last)return false;last=step;
  const angle=(step*125%60000)/60000*Math.PI*2;
  c.clearRect(0,0,out.width,out.height);c.drawImage(background,0,0,out.width,out.height);
  c.save();c.filter='brightness(.68) saturate(.72)';c.drawImage(rear,0,0);
  c.save();c.translate(...pivot);c.rotate(angle);c.translate(-pivot[0],-pivot[1]);c.drawImage(frame.image,...frame.rect);c.restore();
  for(const cabin of cabins){const x=pivot[0]+cabin.x*Math.cos(angle)-cabin.y*Math.sin(angle),y=pivot[1]+cabin.x*Math.sin(angle)+cabin.y*Math.cos(angle);c.drawImage(cabin.image,x+cabin.rect[0],y+cabin.rect[1],cabin.rect[2],cabin.rect[3]);}
  c.drawImage(front,0,0);c.restore();
  for(const mask of masks){c.save();c.clip(mask.path,mask.rule);c.drawImage(background,0,0,out.width,out.height);c.restore();}return true;
 }
 // Static timbers and architecture belong to the painting. Only the frame
 // and upright cabins need moving meshes, avoiding large transparent layers.
 const fixed=document.createElement('canvas');fixed.width=1672;fixed.height=941;const fc=fixed.getContext('2d');fc.drawImage(background,0,0);
 fc.save();fc.filter='brightness(.68) saturate(.72)';fc.drawImage(rear,0,0);fc.drawImage(front,0,0);fc.restore();
 for(const mask of masks){fc.save();fc.clip(mask.path,mask.rule);fc.drawImage(background,0,0);fc.restore();}
 // World-space visibility for the moving parts: fade at the original scene
 // edges, and pass behind the front timbers, sign, booth and queue rails.
 const clip=document.createElement('canvas');clip.width=1676;clip.height=945;const cc=clip.getContext('2d',{willReadFrequently:true});
 const edge=1672*64/1152,g=cc.createLinearGradient(2,0,1674,0);g.addColorStop(0,'transparent');g.addColorStop(edge/1672,'white');g.addColorStop(1-edge/1672,'white');g.addColorStop(1,'transparent');cc.fillStyle=g;cc.fillRect(2,2,1672,941);
 cc.globalCompositeOperation='destination-out';cc.drawImage(front,2,2);cc.save();cc.translate(2,2);
 for(const mask of masks){cc.save();cc.clip(mask.path,mask.rule);cc.fillStyle='white';cc.fillRect(0,0,1672,941);cc.restore();}cc.restore();
 const pixels=cc.getImageData(0,0,clip.width,clip.height);for(let i=0;i<pixels.data.length;i+=4){const value=pixels.data[i+3];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}cc.putImageData(pixels,0,0);
 const lit=new Map(),getSprite=(sprite,padding=0)=>{const key=sprite.image.src;
  if(!lit.has(key)){const canvas=document.createElement('canvas');canvas.width=sprite.image.width+padding*2;canvas.height=sprite.image.height+padding*2;const ctx=canvas.getContext('2d');ctx.filter='brightness(.68) saturate(.72)';ctx.drawImage(sprite.image,padding,padding);lit.set(key,canvas);}
  return {...sprite,image:lit.get(key),padding,originalWidth:sprite.image.width,originalHeight:sprite.image.height};
 };
 const movingFrame=getSprite(frame,2),fp=movingFrame.image.getContext('2d').getImageData(2,2,frame.image.width,frame.image.height).data;let radius=0;
 for(let y=0;y<frame.image.height;y++)for(let x=0;x<frame.image.width;x++)if(fp[(y*frame.image.width+x)*4+3])radius=Math.max(radius,Math.hypot(frame.rect[0]+x/frame.image.width*frame.rect[2]-pivot[0],frame.rect[1]+y/frame.image.height*frame.rect[3]-pivot[1]));
 movingFrame.radius=radius+5;
 const gpu={frame:movingFrame,cabins:cabins.map(s=>getSprite(s)),clip,pivot};
 paint(0);return {canvas:out,paint,staticCanvas:fixed,gpu};
}

// Place the original image-space assembly on the same fixed cylindrical stage
// as its painting. A second UV set clips it at the original scene/feather edges.
export function mountFerrisEnvironment(T,scene,assembly,resources){
 const {textures,ownedGeometry,ownedMaterials}=resources,data=assembly.gpu,textureCache=new Map();
 function texture(image,color=true){if(textureCache.has(image))return textureCache.get(image);const t=new T.CanvasTexture(image);if(color)t.colorSpace=T.SRGBColorSpace;textureCache.set(image,t);textures.push(t);return t;}
 const mask=texture(data.clip,false);mask.channel=1;mask.minFilter=mask.magFilter=T.LinearFilter;mask.generateMipmaps=false;
 function layer(sprite,radius,order,columns=32,rows=8){
  const count=(columns+1)*(rows+1),positions=new Float32Array(count*3),uv=new Float32Array(count*2),clipUV=new Float32Array(count*2),indices=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){const i=y*(columns+1)+x;uv[i*2]=x/columns;uv[i*2+1]=1-y/rows;if(x<columns&&y<rows){indices.push(i,i+1,i+columns+2,i,i+columns+2,i+columns+1);}}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setAttribute('uv1',new T.BufferAttribute(clipUV,2));geometry.setIndex(indices);ownedGeometry.push(geometry);
  const material=new T.MeshBasicMaterial({map:texture(sprite.image),alphaMap:mask,transparent:true,alphaTest:.002,depthWrite:false,side:T.DoubleSide});ownedMaterials.push(material);
  const mesh=new T.Mesh(geometry,material);mesh.renderOrder=order;scene.add(mesh);
  function place(rect=sprite.rect,angle=0,rotate=false){
   const co=Math.cos(angle),si=Math.sin(angle);let i=0;
   for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++,i++){
    let sx=rect[0]+rect[2]*x/columns,sy=rect[1]+rect[3]*y/rows;
    if(rotate){const dx=sx-data.pivot[0],dy=sy-data.pivot[1];sx=data.pivot[0]+dx*co-dy*si;sy=data.pivot[1]+dx*si+dy*co;}
    const u=(1984+sx/1672*1152)/4096,theta=(1-u)*Math.PI*2;
    positions[i*3]=Math.sin(theta)*radius;positions[i*3+1]=7.9-sy/941*14;positions[i*3+2]=Math.cos(theta)*radius;
    clipUV[i*2]=(sx+2)/1676;clipUV[i*2+1]=(943-sy)/945;
   }
   geometry.attributes.position.needsUpdate=true;geometry.attributes.uv1.needsUpdate=true;geometry.computeBoundingSphere();
  }
  place();return {mesh,place,map:material.map};
 }
 const f=data.frame,r=f.radius,x0=Math.max(0,data.pivot[0]-r),x1=Math.min(1672,data.pivot[0]+r),y1=Math.min(941,data.pivot[1]+r),patch=[x0,0,x1-x0,y1];
 const frame=layer({...f,rect:patch},13.985,-19,36,1);frame.map.matrixAutoUpdate=false;
 const cabins=data.cabins.map(sprite=>({sprite,...layer(sprite,13.982,-18,4,4)}));let previousAngle;
 return {update(time,still=false){const angle=still?0:(time%60000)/60000*Math.PI*2;if(angle===previousAngle)return;previousAngle=angle;const co=Math.cos(angle),si=Math.sin(angle);
  // Rotate source UVs on a bounded curved patch, so the wheel can be culled
  // when behind the rider. No texture or vertex upload is needed for the frame.
  const kx=f.originalWidth/(f.rect[2]*f.image.width),ky=f.originalHeight/(f.rect[3]*f.image.height),dx=patch[0]-data.pivot[0],dy=patch[1]+patch[3]-data.pivot[1];
  frame.map.matrix.set(co*patch[2]*kx,-si*patch[3]*kx,(data.pivot[0]+co*dx+si*dy-f.rect[0])*kx+f.padding/f.image.width,si*patch[2]*ky,co*patch[3]*ky,1-(data.pivot[1]-si*dx+co*dy-f.rect[1])*ky-f.padding/f.image.height,0,0,1);
  for(const cabin of cabins){const s=cabin.sprite,x=data.pivot[0]+s.x*co-s.y*si,y=data.pivot[1]+s.x*si+s.y*co,rect=[x+s.rect[0],y+s.rect[1],s.rect[2],s.rect[3]];cabin.mesh.visible=rect[0]<1672&&rect[0]+rect[2]>0&&rect[1]<941&&rect[1]+rect[3]>0;if(cabin.mesh.visible)cabin.place(rect);}
 }};
}
