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
