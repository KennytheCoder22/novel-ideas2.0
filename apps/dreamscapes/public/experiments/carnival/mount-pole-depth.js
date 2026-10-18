// Continue the existing carousel shaft through the whole cropped animal image.
// Outside this rectangle the SVG shaft remains responsible for the same pole.
// A body-length sleeve alone leaves lower limbs composited in front of the SVG
// even when their 3D depth places them behind the shaft.
export function coverMountDepth(T,pole,camera){
 camera.updateMatrixWorld(true);
 const view=camera.matrixWorldInverse.elements;
 // Intersect the crop's top/bottom view-space heights with the fixed x=z=0
 // shaft axis. Include its radius so the cut ends stay outside the crop.
 const radius=pole.geometry.parameters.radiusTop;
 const bottom=(camera.bottom-view[13])/view[5]-radius*2;
 const top=(camera.top-view[13])/view[5]+radius*2;
 pole.scale.y=(top-bottom)/pole.geometry.parameters.height;
 pole.position.y=(top+bottom)/2;
 // Preserve the original twist pitch rather than stretching its texture.
 const pitch=pole.userData.twistPitch||((pole.geometry.parameters.height* (pole.userData.originalScaleY||1))/pole.material.map.repeat.y);
 pole.userData.twistPitch=pitch;
 pole.material.map.repeat.y=(top-bottom)/pitch;
 pole.userData.depthCoverage={bottom,top};
}

// Clip only the added depth-tested shaft at the stationary SVG bottom bracket.
// Use the lowest possible bob position once, avoiding frame-order lag.
// The animal and its pommel never move. End inside the bracket (shaft y=-4),
// allowing for the tilted camera's projection of the cylinder radius.
export function limitMountPoleBottom(pole,camera,holder,anchorHeight){
 const view=camera.matrixWorldInverse.elements;
 const cssY=Number(holder.getAttribute('y')),cssHeight=Number(holder.getAttribute('height'));
 const viewY=camera.top-(anchorHeight-4-cssY)/cssHeight*(camera.top-camera.bottom);
 const bottom=Math.max(pole.userData.depthCoverage.bottom,(viewY-view[13]+Math.abs(view[9])*pole.geometry.parameters.radiusTop)/view[5]);
 const top=pole.userData.depthCoverage.top;
 pole.scale.y=(top-bottom)/pole.geometry.parameters.height;
 pole.position.y=(top+bottom)/2;
 pole.material.map.repeat.y=(top-bottom)/pole.userData.twistPitch;
 pole.userData.bracketBottom=bottom;
}
