/* Platform-only set dressing. No handlers, observations, or shared Midway animation. */
(() => {
  'use strict';
  const visibility = () => document.documentElement.classList.toggle('platform-document-hidden', document.hidden);
  document.addEventListener('visibilitychange', visibility);
  visibility();
  const ns = 'http://www.w3.org/2000/svg';
  window.CarnivalPlatform = Object.freeze({
    mount(plane) {
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 1672 941');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('platform-dressing');
      const defs = document.createElementNS(ns, 'defs');
      svg.append(defs);
      function node(tag, attrs, parent = svg) {
        const el = document.createElementNS(ns, tag);
        for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
        parent.append(el); return el;
      }
      function art(src, x, y, width, height, parent = svg) {
        return node('image', {href:src,x,y,width,height,preserveAspectRatio:'xMidYMid meet'}, parent);
      }
      // Existing extracted source art is reused read-only. This independent wheel is
      // parked for Pass 1; there is no coupling to the Midway's angle or timing.
      const wheel = node('g', {class:'platform-wheel'});
      art('./wheel-frame.png', 665, -635, 1110, 1079.73, wheel);
      art('./support.png', 870, -92, 470, 632.02, wheel);
      for (let i = 0; i < 12; i++) {
        const angle = (i * 30 + 8) * Math.PI / 180;
        const x = 1230 + 517 * Math.cos(angle);
        const y = -70 + 517 * Math.sin(angle);
        art('./gondola-01.png', x - 63, y - 8, 126, 176.76, wheel);
      }
      // Original stage pixels occlude the assembly at the arch, booth and rails.
      // The base stays byte-for-byte intact; no populated reference is rendered.
      const foreground = node('clipPath', {id:'platform-architecture'}, defs);
      node('path', {d:'M0 535H915V362L932 339L1025 289L1043 252L1082 234L1095 212L1117 226L1143 220L1160 252L1212 277L1309 285L1320 275L1350 287L1358 313L1402 281L1450 256L1475 253L1520 234L1563 249L1672 278V941H0Z'}, foreground);
      const occlusion = art('./locations/ferris-platform.png',0,0,1672,941);
      occlusion.setAttribute('clip-path','url(#platform-architecture)');
      node('ellipse', {cx:1129,cy:642,rx:26,ry:5,fill:'#080c10',opacity:'.55'});
      const passenger = art('./platform/waiting-passenger.png',1064,451,128,192);
      passenger.setAttribute('class','platform-passenger');
      const rail = node('clipPath', {id:'platform-front-rail'}, defs);
      node('path', {d:'M1007 590L1198 550L1204 559L1010 601Z M1096 579L1106 577L1110 682L1100 685Z M1187 550L1200 547L1203 655L1192 660Z'}, rail);
      const railArt = art('./locations/ferris-platform.png',0,0,1672,941);
      railArt.setAttribute('clip-path','url(#platform-front-rail)');
      const shimmer = node('g', {class:'platform-reflection',fill:'#f6bb6c'});
      for (const [x,y,w] of [[969,820,11],[962,831,16],[973,839,9],[1127,758,13],[1122,768,9]]) {
        node('ellipse',{cx:x,cy:y,rx:w/2,ry:'.8'},shimmer);
      }
      plane.append(svg);
      const urls = ['./wheel-frame.png','./support.png','./gondola-01.png','./platform/waiting-passenger.png'];
      return Promise.all(urls.map(src=>{const img=new Image();img.src=src;return img.decode();}));
    }
  });
})();


