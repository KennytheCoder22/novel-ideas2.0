// Independent scene paintings each contain their own moon. In the surround,
// retain the Rides & Games moon and cover only the other three lunar discs
// with nearby cloud pixels from the same painting. Originals are never edited.
export const skyRepairs=Object.freeze({
 'tent-row':{center:[1143,62],radius:[50,48],donor:[1290,70]},
 'ferris-platform':{center:[515,150],radius:[55,55],donor:[690,150]},
 'behind-carnival':{center:[1141,57],radius:[56,52],donor:[1298,58]}
});
export function ridePainting(image,id){
 const repair=skyRepairs[id];if(!repair)return image;
 const [x,y]=repair.center,[rx,ry]=repair.radius,[sx,sy]=repair.donor;
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);
 const patch=document.createElement('canvas');patch.width=rx*2;patch.height=ry*2;const p=patch.getContext('2d');
 p.drawImage(image,sx-rx,sy-ry,rx*2,ry*2,0,0,rx*2,ry*2);
 p.globalCompositeOperation='destination-in';p.translate(rx,ry);p.scale(rx,ry);const fade=p.createRadialGradient(0,0,.64,0,0,1);fade.addColorStop(0,'white');fade.addColorStop(1,'transparent');p.fillStyle=fade;p.fillRect(-1,-1,2,2);
 c.drawImage(patch,x-rx,y-ry);return canvas;
}
