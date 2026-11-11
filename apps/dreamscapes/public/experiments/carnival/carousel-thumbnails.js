import * as T from './vendor/three.module.js';
import {sharedMountRenderer} from './shared-mount-renderer.js';

// Static portraits of the loaded mount artwork. No new models or WebGL contexts.
const portraits=new Map();
export function mountThumbnail(id,style){
 const key=style+':'+id;if(portraits.has(key))return portraits.get(key);
 const entry=id==='horse'?window.carouselHorseComparison:window.carouselAnimalComparisons?.find(m=>m.name===id);
 if(!entry?.model||!window.carouselVariantDiagnostics?.().mounts.some(m=>m.identity===id&&m.style===style&&m.visible))throw Error('Mount portrait not ready');
 const scene=new T.Scene(),group=new T.Group(),model=entry.model.clone(true);group.add(model);scene.add(group);
 const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
 model.position.sub(center);model.updateMatrix();group.scale.setScalar(1/Math.max(size.x,size.y,size.z,.001));
 scene.add(new T.HemisphereLight(0xfff2de,0x514958,1.5));
 const light=new T.DirectionalLight(0xffecd3,2);light.position.set(-2,3,4);scene.add(light);
 const camera=new T.OrthographicCamera(-1,1,1,-1,.01,30);camera.position.set(3,1.4,3);camera.lookAt(0,0,0);camera.updateMatrixWorld();group.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(group);let extent=0;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));}
 const half=extent*1.10;camera.left=-half;camera.right=half;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
 const canvas=document.createElement('canvas'),renderer=sharedMountRenderer(T,canvas);
 try{renderer.setSize(256,256,false);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.render(scene,camera);const png=canvas.toDataURL('image/png');portraits.set(key,png);return png;}
 finally{renderer.dispose();scene.clear();}
}
