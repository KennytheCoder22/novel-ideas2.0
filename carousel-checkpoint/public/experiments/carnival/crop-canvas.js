// Local experiment: fixed all-yaw crop, unchanged pixels per world/SVG unit.
export function cropCanvas(T,{name,scene,camera,carouselFrame,renderer,holder}) {
 const canvas=renderer.domElement,W=canvas.width,H=canvas.height;
 const old={width:W,height:H,x:+holder.getAttribute('x'),y:+holder.getAttribute('y'),cssWidth:+holder.getAttribute('width'),cssHeight:+holder.getAttribute('height'),left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};
 camera.updateMatrixWorld(true);const v=camera.matrixWorldInverse.elements;
 const yaw=carouselFrame.rotation.y;carouselFrame.rotation.y=0;scene.updateMatrixWorld(true);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 const point=new T.Vector3();
 const include=(x0,x1,y0,y1)=>{minX=Math.min(minX,(x0-old.left)/(old.right-old.left)*W);maxX=Math.max(maxX,(x1-old.left)/(old.right-old.left)*W);minY=Math.min(minY,(old.top-y1)/(old.top-old.bottom)*H);maxY=Math.max(maxY,(old.top-y0)/(old.top-old.bottom)*H);};
 scene.traverse(mesh=>{if(!mesh.isMesh)return;let parent=mesh,rotates=false;while(parent){if(parent===carouselFrame)rotates=true;parent=parent.parent;}const positions=mesh.geometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
  if(rotates){const radius=Math.hypot(point.x,point.z),cx=v[4]*point.y+v[12],cy=v[5]*point.y+v[13],rx=Math.hypot(v[0],v[8])*radius,ry=Math.hypot(v[1],v[9])*radius;include(cx-rx,cx+rx,cy-ry,cy+ry);}
  else{point.applyMatrix4(camera.matrixWorldInverse);include(point.x,point.x,point.y,point.y);}
 }});
 carouselFrame.rotation.y=yaw;scene.updateMatrixWorld(true);
 const margin=8,x0=Math.max(0,Math.floor((minX-margin)/2)*2),y0=Math.max(0,Math.floor((minY-margin)/2)*2),x1=Math.min(W,Math.ceil((maxX+margin)/2)*2),y1=Math.min(H,Math.ceil((maxY+margin)/2)*2),width=x1-x0,height=y1-y0;
 camera.left=old.left+(old.right-old.left)*x0/W;camera.right=old.left+(old.right-old.left)*x1/W;camera.top=old.top-(old.top-old.bottom)*y0/H;camera.bottom=old.top-(old.top-old.bottom)*y1/H;camera.updateProjectionMatrix();
 holder.setAttribute('x',old.x+x0*old.cssWidth/W);holder.setAttribute('y',old.y+y0*old.cssHeight/H);holder.setAttribute('width',width*old.cssWidth/W);holder.setAttribute('height',height*old.cssHeight/H);
 canvas.style.width=width*old.cssWidth/W+'px';canvas.style.height=height*old.cssHeight/H+'px';renderer.setSize(Math.round(width*.8),Math.round(height*.8),false);
 const data={name,old,crop:{x:x0,y:y0,width,height},envelope:{minX,maxX,minY,maxY},margin,pixelsPerCssPixel:W/old.cssWidth};(window.carouselCropDiagnostics ||= []).push(data);return data;
}
