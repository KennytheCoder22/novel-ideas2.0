import assert from 'node:assert/strict';
import * as T from '../../public/experiments/carnival/vendor/three.module.js';
import {mountRigs} from '../../public/experiments/carnival/mount-rigs.js';
import {coverMountDepth} from '../../public/experiments/carnival/mount-pole-depth.js';
import {writeFileSync} from 'node:fs';
const results=[];
for(const [name,rig] of Object.entries(mountRigs)){
 const {old,crop}=rig.crop;
 const camera=new T.OrthographicCamera(old.left+(old.right-old.left)*crop.x/old.width,old.left+(old.right-old.left)*(crop.x+crop.width)/old.width,old.top-(old.top-old.bottom)*crop.y/old.height,old.top-(old.top-old.bottom)*(crop.y+crop.height)/old.height,.01,20);
 camera.position.set(0,.12,3);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const height=rig.pole.height*rig.pole.scaleY,pitch=.7324974536895752*1.5*18/300;
 const material=new T.MeshBasicMaterial();material.map=new T.Texture();material.map.repeat.y=height/pitch;
 const pole=new T.Mesh(new T.CylinderGeometry(.01465,.01465,height,24,1,true),material);pole.position.y=rig.pole.y;
 const originalBottom=new T.Vector3(0,rig.pole.y-height/2,0).project(camera).y;
 coverMountDepth(T,pole,camera);
 const {top,bottom}=pole.userData.depthCoverage;
 assert(new T.Vector3(0,top,0).project(camera).y>1);assert(new T.Vector3(0,bottom,0).project(camera).y< -1);
 assert.equal(pole.position.x,0);assert.equal(pole.position.z,0);assert.equal(pole.geometry.parameters.radiusTop,.01465);assert(Math.abs((top-bottom)/material.map.repeat.y-pitch)<1e-10);assert(material.depthTest&&material.depthWrite);
 const saved=[pole.scale.y,pole.position.y,material.map.repeat.y];coverMountDepth(T,pole,camera);assert.deepEqual([pole.scale.y,pole.position.y,material.map.repeat.y],saved);
 results.push({name,originalBottomNDC:originalBottom,top,bottom,wholeCropDepthCovered:true,shaftAxisUnchanged:true,twistPitchUnchanged:true});
}
assert(results.find(r=>r.name==='ostrich').originalBottomNDC> -1,'Regression must reproduce the truncated Ostrich shaft');
writeFileSync(new URL('./depth-coverage-results.json',import.meta.url),JSON.stringify({passed:true,mounts:results},null,2));console.log('PASS: all 20 poles cover the whole fixed crop, with unchanged axis, thickness and twist pitch.');
