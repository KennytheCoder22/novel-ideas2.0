// All twenty cropped mount canvases share one offscreen WebGL context.
// Room renderers and inspections can coexist without evicting older mount canvases.
let shared=null,users=0;
export function sharedMountRenderer(T,canvas) {
 if(!shared) {
  shared=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  shared.setClearColor(0,0);
 }
 users++;
 const display=canvas.getContext('2d',{alpha:true});
 let disposed=false;
 return {
  domElement:canvas,
  get outputColorSpace(){return shared.outputColorSpace;},
  set outputColorSpace(value){shared.outputColorSpace=value;},
  get toneMapping(){return shared.toneMapping;},
  set toneMapping(value){shared.toneMapping=value;},
  setSize(width,height,updateStyle=true) {
   canvas.width=Math.floor(width);canvas.height=Math.floor(height);
   if(updateStyle){canvas.style.width=width+'px';canvas.style.height=height+'px';}
  },
  setClearColor(...args){shared.setClearColor(...args);},
  getContext(){return shared.getContext();},
  render(scene,camera) {
   if(disposed)return;
   shared.setSize(canvas.width,canvas.height,false);
   shared.render(scene,camera);
   display.clearRect(0,0,canvas.width,canvas.height);
   display.drawImage(shared.domElement,0,0);
  },
  dispose() {
   if(disposed)return;disposed=true;
   if(--users===0){shared.dispose();shared.forceContextLoss();shared=null;}
  }
 };
}
