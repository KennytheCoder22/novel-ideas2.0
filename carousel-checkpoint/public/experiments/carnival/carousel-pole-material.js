// Static texture derived from the SVG carousel-gold stops and twist highlight.
// Each renderer owns its small texture; no animation, lights or draw calls added.
export function carouselPoleMaterial(T, height, span) {
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
 const ctx=canvas.getContext('2d');
 const stops=[[0,'#37200e'],[.26,'#9d621f'],[.48,'#f4c66b'],[.68,'#986121'],[1,'#3a220f']];
 // Repeat the brass face around the cylinder, so both sides retain the same finish.
 for(let face=0;face<2;face++){
   const gradient=ctx.createLinearGradient(face*64,0,(face+1)*64,0);
   stops.forEach(([at,color])=>gradient.addColorStop(at,color));
   ctx.fillStyle=gradient;ctx.fillRect(face*64,0,64,128);
 }
 ctx.strokeStyle='rgba(255,224,160,0.45)';ctx.lineWidth=6;
 for(let y=-128;y<=256;y+=128){ctx.beginPath();ctx.moveTo(0,y+128);ctx.lineTo(128,y);ctx.stroke();}
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 texture.wrapS=texture.wrapT=T.RepeatWrapping;
 texture.repeat.set(1,height/(span*18/300));
 // The SVG uses painted shine, not scene lights. Preserve those exact colors.
 return new T.MeshBasicMaterial({map:texture,toneMapped:false});
}
