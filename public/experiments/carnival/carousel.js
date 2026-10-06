/* Empty carousel mechanism. Coordinates are in the 1536 x 1024 structure art.
   Slot content belongs under its .carousel-mount-anchor, never in the master art. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const PERIOD = 72000;
  const COUNT = 12;
  function pose(index, phase) {
    const angle = 2 * Math.PI * (index / COUNT - phase);
    const depth = Math.sin(angle);
    return {x:768 + 630 * Math.cos(angle), y:835 + 32 * depth, depth, scale:1 + depth * .045};
  }
  window.CarnivalCarousel = Object.freeze({period:PERIOD, slotCount:COUNT, pose,
    mount(plane) {
      const svg = document.createElementNS(NS,'svg');
      svg.setAttribute('viewBox','0 0 1671 941');
      svg.setAttribute('class','carousel-dressing');
      svg.setAttribute('aria-hidden','true');
      const node = (name, attrs, parent=svg) => {
        const el=document.createElementNS(NS,name);
        for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
        parent.append(el); return el;
      };
      const defs=node('defs',{});
      const gold=node('linearGradient',{id:'carousel-gold'},defs);
      [[0,'#37200e'],[.26,'#9d621f'],[.48,'#f4c66b'],[.68,'#986121'],[1,'#3a220f']].forEach(([offset,color])=>node('stop',{offset,'stop-color':color},gold));
      const wood=node('radialGradient',{id:'carousel-wood'},defs);
      node('stop',{offset:0,'stop-color':'#5d3418'},wood);
      node('stop',{offset:.7,'stop-color':'#916132'},wood);
      node('stop',{offset:1,'stop-color':'#ba864c'},wood);
      // Reuse actual wooden floor pixels as a planar repeating surface; the
      // source PNG is unmodified. Projection below supplies foreshortening.
      const grain=node('pattern',{id:'carousel-floor-grain',width:300,height:300,patternUnits:'userSpaceOnUse'},defs);
      const grainCrop=node('svg',{width:300,height:300,viewBox:'1020 834 240 22',preserveAspectRatio:'none'},grain);
      node('image',{href:'./carousel/structure.png',width:1536,height:1024},grainCrop);
      const deckClip=node('clipPath',{id:'carousel-deck-clip'},defs);
      node('ellipse',{cx:768,cy:835,rx:705,ry:35},deckClip);
      const columnClip=node('clipPath',{id:'carousel-column-clip'},defs);
      node('path',{d:'M580 511H954V830H580Z'},columnClip);
      const canopyClip=node('clipPath',{id:'carousel-canopy-clip'},defs);
      node('path',{d:'M0 0H1536V568L1420 608L1210 625L955 608L955 511H580V608L355 625L130 603L0 569Z'},canopyClip);
      node('ellipse',{cx:180,cy:661,rx:470,ry:24,fill:'#09090b',opacity:'.38'});
      const assembly=node('g',{transform:'translate(-625 -160) scale(.82)',class:'carousel-assembly'});
      const img=new Image();img.src='./carousel/structure.png';
      const surfaces=[];
      // A front-view texture is projected around a vertical cylinder. Its
      // horizontal position/foreshortening follows the same yaw as every slot;
      // the silhouette and installation transform never rotate as a flat card.
      function surface(parent, name, left, top, width, height, radius, clip) {
        const object=node('foreignObject',{x:left,y:top,width,height,class:name,...(clip?{'clip-path':`url(#${clip})`}:{})},parent);
        const canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
        canvas.width=width;canvas.height=height;object.append(canvas);
        const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
        if(!gl) throw new Error('Carousel surface rendering requires WebGL');
        surfaces.push({object,gl,left,top,width,height,radius});
        return object;
      }
      function prepareSurface(s) {
        const {gl,left,top,width,height}=s;
        const scratch=document.createElement('canvas');scratch.width=width;scratch.height=height;
        const ctx=scratch.getContext('2d');ctx.drawImage(img,left,top,width,height,0,0,width,height);
        const original=ctx.getImageData(0,0,width,height);
        const texturePixels=new Uint8Array(original.data);
        // Extract lamp standards from the shell so their complete upright
        // bodies orbit, rather than leaving stationary lantern silhouettes.
        if(s.object.classList.contains('carousel-canopy')) {
          for(const [lo,hi,start] of [[49,100,320],[186,247,190],[1287,1356,190],[1428,1482,320]]) {
            for(let y=start;y<height;y++) {
              const a=(y*width+lo-2)*4,b=(y*width+hi+2)*4;
              const hasA=original.data[a+3]>160,hasB=original.data[b+3]>160;
              for(let x=lo;x<=hi;x++) {
                const at=(y*width+x)*4;
                if(hasA&&hasB)for(let k=0;k<4;k++)original.data[at+k]=original.data[a+k];
                else original.data[at+3]=0;
              }
            }
          }
        }
        const filled=new Uint8Array(texturePixels);
        const bounds=new Uint8Array(height*4);
        // A surface's radius follows each original row, preserving its tapered
        // canopy/column/apron. Fill invisible texture gaps from nearest source
        // pixels so yaw cannot open holes in the physical structure.
        for(let y=0;y<height;y++) {
          let lo=width,hi=-1;
          for(let x=0;x<width;x++) if(texturePixels[(y*width+x)*4+3]>160){lo=Math.min(lo,x);hi=x;}
          if(hi<lo){lo=0;hi=width-1;}
          if(s.object.classList.contains('carousel-column')) {lo=20;hi=350;}
          if(s.object.classList.contains('carousel-rim')) {lo=60;hi=1476;}
          // The uninterrupted fascia between lamp standards is the repeating
          // shell material; standards and the center drum are separate geometry.
          if(s.object.classList.contains('carousel-canopy')&&y>=235) {
            lo=275;hi=1260;
            if(y>=511)for(let x=580;x<955;x++)texturePixels[(y*width+x)*4+3]=0;
          }
          if(s.object.classList.contains('carousel-canopy')&&y>=98&&y<235) {
            const roofRadius=Math.min(365,20+(y-98)*2.5);
            lo=Math.round(768-roofRadius);hi=Math.round(768+roofRadius);
          }
          const valid=[];
          for(let x=lo;x<=hi;x++) if(texturePixels[(y*width+x)*4+3]>160) valid.push(x);
          let cursor=0;
          for(let x=lo;x<=hi&&valid.length;x++) {
            while(cursor+1<valid.length&&Math.abs(valid[cursor+1]-x)<Math.abs(valid[cursor]-x))cursor++;
            const from=(y*width+valid[cursor])*4,to=(y*width+x)*4;
            if(texturePixels[to+3]<=160)for(let k=0;k<3;k++)filled[to+k]=texturePixels[from+k];
            filled[to+3]=255;
          }
          // Below the fascia the photographed drum obscures the rear ceiling.
          // Pack the available ceiling pixels into its material strip instead
          // of stretching one neighboring pixel across that hidden interval.
          if(s.object.classList.contains('carousel-canopy')&&y>=511&&valid.length) {
            for(let x=lo;x<=hi;x++) {
              const source=valid[Math.round((x-lo)/(hi-lo)*(valid.length-1))];
              const from=(y*width+source)*4,to=(y*width+x)*4;
              for(let k=0;k<3;k++)filled[to+k]=texturePixels[from+k];
            }
          }
          bounds.set([lo&255,lo>>8,hi&255,hi>>8],y*4);
        }
        function shader(type,code){const sh=gl.createShader(type);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh;}
        const program=gl.createProgram();
        gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p; varying vec2 uv; void main(){uv=vec2((p.x+1.0)*.5,(1.0-p.y)*.5);gl_Position=vec4(p,0.0,1.0);}'));
        gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision highp float;
          varying vec2 uv; uniform sampler2D art; uniform sampler2D shape; uniform sampler2D rows; uniform float yaw; uniform float width;
          void main(){vec4 b=texture2D(rows,vec2(.5,uv.y))*255.0;
            float lo=b.r+b.g*256.0;float hi=b.b+b.a*256.0;
            float r=max(.5,(hi-lo)*.5);float center=(lo+hi)*.5;
            float theta=acos(clamp(uv.x*2.0-1.0,-1.0,1.0));
            // Repeated front artwork supplies a continuous circumference.
            // Arc-length UVs avoid magnifying a single edge pixel as a panel
            // rounds the side and returns from the unpictured rear hemisphere.
            float sourceAngle=acos(cos(theta-yaw));
            float sx=(center+r*(1.0-2.0*sourceAngle/3.141592653589793))/width;
            vec4 color=texture2D(art,vec2(sx,uv.y));
            gl_FragColor=vec4(color.rgb,texture2D(shape,uv).a);
          }`));
        gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
        const position=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
        function texture(unit,w,h,pixels,linear){gl.activeTexture(gl.TEXTURE0+unit);const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);}
        texture(0,width,height,filled,true);texture(1,width,height,new Uint8Array(original.data),true);texture(2,1,height,bounds,false);
        gl.uniform1i(gl.getUniformLocation(program,'art'),0);gl.uniform1i(gl.getUniformLocation(program,'shape'),1);gl.uniform1i(gl.getUniformLocation(program,'rows'),2);gl.uniform1f(gl.getUniformLocation(program,'width'),width);
        s.yawLocation=gl.getUniformLocation(program,'yaw');
      }
      surface(assembly,'carousel-rim',0,800,1536,224,760);
      // The deck's foreshortened plane shares the rigid assembly's yaw.
      const deck=node('g',{'clip-path':'url(#carousel-deck-clip)'},assembly);
      node('ellipse',{cx:768,cy:835,rx:705,ry:35,fill:'url(#carousel-wood)'},deck);
      const projection=node('g',{transform:'translate(768 835) scale(1 .049645)'},deck);
      const floor=node('g',{class:'carousel-floor'},projection);
      node('circle',{r:708,fill:'url(#carousel-floor-grain)'},floor);
      for(let x=-720;x<720;x+=47) {
        node('path',{d:`M${x} -720V720`,stroke:'#342012','stroke-width':1.5,opacity:'.3'},floor);
      }
      for(let i=0;i<12;i++) {
        node('path',{d:'M205 0H695',transform:`rotate(${i*30})`,stroke:'#d9a85f','stroke-width':2,opacity:'.38'},floor);
      }
      const rear=node('g',{class:'carousel-rear-slots'},assembly);
      surface(assembly,'carousel-column',580,511,374,319,187);
      const front=node('g',{class:'carousel-front-slots'},assembly);
      surface(assembly,'carousel-canopy',0,0,1536,625,760,'carousel-canopy-clip');
      const frontStandards=node('g',{class:'carousel-front-standards'},assembly);
      // Complete lamp standards share the shell's yaw and retain upright depth.
      const standards=[[49,100],[186,247],[1287,1356],[1428,1482]].map(([left,right],i)=>{
        const center=(left+right)/2;
        const angle=Math.acos((center-768)/760);
        const group=node('g',{class:'carousel-standard'},rear);
        const clip=node('clipPath',{id:`carousel-standard-${i}`},defs);
        const large=i===1||i===2,tip=large?190:320,head=large?31:25,stem=large?12:7,foot=large?30:23;
        node('path',{d:`M${center} ${tip}L${center+10} ${tip+25}H${center+head}V${tip+120}L${center+stem} ${tip+152}V748L${center+foot} 770V858H${center-foot}V770L${center-stem} 748V${tip+152}L${center-head} ${tip+120}V${tip+25}H${center-10}Z`},clip);
        node('image',{href:'./carousel/structure.png',width:1536,height:1024,'clip-path':`url(#carousel-standard-${i})`},group);
        return {group,center,angle};
      });
      const debug=new URLSearchParams(location.search).get('carousel')==='debug';
      const slots=Array.from({length:COUNT},(_,index)=>{
        const slot=node('g',{'data-carousel-slot':index+1,class:'carousel-slot'},rear);
        node('rect',{x:-4,y:-405,width:8,height:401,rx:3,fill:'url(#carousel-gold)'},slot);
        // Fine helical highlight reads as a brass carousel pole at scene scale.
        const twist=node('pattern',{id:`carousel-twist-${index}`,width:8,height:18,patternUnits:'userSpaceOnUse'},defs);
        node('path',{d:'M-4 10L12 0M-4 28L12 18',stroke:'#ffe0a0','stroke-width':1.5,opacity:'.45'},twist);
        node('rect',{x:-4,y:-405,width:8,height:401,fill:`url(#carousel-twist-${index})`},slot);
        node('path',{d:'M-7 -22H7L13 -2H-13Z',fill:'#662019',stroke:'#ba8840','stroke-width':2},slot);
        node('ellipse',{cx:0,cy:-1,rx:16,ry:3,fill:'url(#carousel-gold)'},slot);
        const anchor=node('g',{class:'carousel-mount-anchor',transform:'translate(0 -135)'},slot);
        if(debug) {
          node('circle',{r:8,fill:'none',stroke:'#a9e8ed','stroke-width':2},anchor);
          node('text',{x:12,y:0,fill:'#d4fbff','font-size':24},anchor).textContent=String(index+1);
        }
        return slot;
      });
      // Original stage foreground, not a populated reference replacement.
      const railClip=node('clipPath',{id:'carousel-stage-foreground'},defs);
      node('path',{d:'M0 640L82 628L158 652L163 800L226 819L231 941H0Z M204 668Q286 638 399 662L395 941H205Z M399 580L520 580L529 699L408 718Z M592 391H702L718 405L702 420H592Z M591 421H700L716 435L700 448H591Z M591 449H699L718 463L700 478H591Z M591 479H702L718 491L702 507H591Z M642 503H652V650H642Z'},railClip);
      // Rail runs and posts traced in the approved empty scene's coordinates.
      node('path',{d:'M0 550L657 545V555L0 561Z M0 569L657 560V568L0 578Z M0 619L650 576V584L0 630Z'},railClip);
      for(const [x,y,h,w] of [[32,553,98,7],[66,553,88,6],[108,549,88,9],[149,550,101,7],[179,547,116,9],[225,550,106,6],[267,548,108,7],[309,548,109,7],[351,546,110,8],[394,548,118,7],[435,548,128,7],[478,546,119,7],[525,546,105,8],[570,545,83,8],[615,544,90,8]]) {
        node('rect',{x,y,width:w,height:h},railClip);
      }
      node('image',{href:'./locations/rides-games.png',width:1671,height:941,'clip-path':'url(#carousel-stage-foreground)'},svg);
      plane.append(svg);
      let elapsed=0,last=null,frame=null;
      const reduced=matchMedia('(prefers-reduced-motion: reduce)');
      const still=new URLSearchParams(location.search).get('motion')==='still';
      function paint() {
        const phase=(elapsed%PERIOD)/PERIOD;
        svg.dataset.phase=String(phase);
        const yaw=-phase*2*Math.PI;
        assembly.dataset.yaw=String(yaw);
        floor.setAttribute('transform',`rotate(${-phase*360})`);
        if(img.complete&&img.naturalWidth) {
          for(const s of surfaces) if(s.yawLocation) {
            s.gl.uniform1f(s.yawLocation,yaw);s.gl.drawArrays(s.gl.TRIANGLE_STRIP,0,4);
            s.object.dataset.yaw=String(yaw);
          }
        }
        for(const {group,center,angle} of standards) {
          const theta=angle+yaw;
          const x=768+760*Math.cos(theta);
          const depth=Math.sin(theta);
          const y=(depth-Math.sin(angle))*35;
          group.setAttribute('transform',`translate(${x-center} ${y})`);
          (depth<0?rear:frontStandards).append(group);
        }
        const ordered=slots.map((slot,index)=>({slot,...pose(index,phase)})).sort((a,b)=>a.depth-b.depth);
        for(const {slot,x,y,scale,depth} of ordered) {
          slot.setAttribute('transform',`translate(${x} ${y}) scale(${scale})`);
          slot.setAttribute('opacity',String(.84+.16*(depth+1)/2));
          (depth<0?rear:front).append(slot);
        }
      }
      function active(){return svg.isConnected&&!document.hidden&&!plane.parentElement.inert&&!reduced.matches&&!still;}
      function tick(now){frame=null;if(!active()){last=null;return;}if(last!==null)elapsed+=now-last;last=now;paint();frame=requestAnimationFrame(tick);}
      function sync(){if(frame!==null)cancelAnimationFrame(frame);frame=null;last=null;if(active())frame=requestAnimationFrame(tick);}
      const observer=new MutationObserver(sync);
      observer.observe(plane.parentElement,{attributes:true,attributeFilter:['inert']});
      document.addEventListener('visibilitychange',sync); reduced.addEventListener('change',sync);
      paint();
      return img.decode().then(()=>{surfaces.forEach(prepareSurface);paint();sync();}).catch(error=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);svg.remove();throw error;});
    }
  });
})();
