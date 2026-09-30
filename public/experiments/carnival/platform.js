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
      // Independent Platform clock: same 60-second revolution and equal/opposite
      // cabin rotation concept as Midway, without sharing or editing its code.
      const wheel = node('g', {class:'platform-wheel'});
      art('./support.png', 870, -92, 470, 632.02, wheel);
      const rotor = node('g', {class:'platform-rotor'}, wheel);
      art('./wheel-frame.png', 665, -635, 1110, 1079.73, rotor);
      const cabins = [];
      for (let i = 0; i < 12; i++) {
        const angle = (i * 30 + 8) * Math.PI / 180;
        const x = 1230 + 517 * Math.cos(angle);
        const y = -70 + 517 * Math.sin(angle);
        const anchor = node('g', {transform:`translate(${x} ${y})`}, rotor);
        const cabin = node('g', {class:'platform-cabin'}, anchor);
        art('./gondola-01.png', -63, -8, 126, 176.76, cabin);
        cabins.push(cabin);
      }
      function startWheel() {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        const still = document.documentElement.dataset.motion === 'still';
        let elapsed = 0, previous = null, frame = null;
        function paint() {
          const angle = (elapsed % 60000) / 60000 * 360;
          rotor.setAttribute('transform', `rotate(${angle} 1230 -70)`);
          cabins.forEach(cabin => cabin.setAttribute('transform', `rotate(${-angle})`));
        }
        function tick(time) {
          if (!svg.isConnected) { dispose(); return; }
          if (previous !== null) elapsed += time - previous;
          previous = time; paint();
          frame = requestAnimationFrame(tick);
        }
        function sync() {
          if (frame !== null) cancelAnimationFrame(frame);
          frame = null; previous = null;
          if (reduced.matches || still) { elapsed = 0; paint(); }
          else if (!document.hidden && !plane.parentElement.inert) frame = requestAnimationFrame(tick);
        }
        function dispose() {
          if (frame !== null) cancelAnimationFrame(frame);
          observer.disconnect();
          reduced.removeEventListener('change', sync);
          document.removeEventListener('visibilitychange', sync);
        }
        const observer = new MutationObserver(sync);
        observer.observe(plane.parentElement, {attributes:true, attributeFilter:['inert']});
        reduced.addEventListener('change', sync);
        document.addEventListener('visibilitychange', sync);
        paint(); sync();
      }
      // Original stage pixels occlude the assembly at the arch, booth and rails.
      // The base stays byte-for-byte intact; no populated reference is rendered.
      const foreground = node('clipPath', {id:'platform-architecture'}, defs);
      node('path', {d:'M0 535H915V362L932 339L1025 289L1043 252L1082 234L1095 212L1117 226L1143 220L1160 252L1212 277L1309 285L1320 275L1350 287L1358 313L1402 281L1450 256L1475 253L1520 234L1563 249L1672 278V941H0Z'}, foreground);
      const occlusion = art('./locations/ferris-platform.png',0,0,1672,941);
      occlusion.setAttribute('clip-path','url(#platform-architecture)');
      node('ellipse', {cx:1120,cy:672,rx:12,ry:2.5,fill:'#080c10',opacity:'.65'});
      node('ellipse', {cx:1155,cy:678,rx:12,ry:2.5,fill:'#080c10',opacity:'.65'});
      const passenger = art('./platform/waiting-passenger.png',1064,478,134.67,202);
      passenger.setAttribute('class','platform-passenger');
      const rail = node('clipPath', {id:'platform-front-rail'}, defs);
      node('path', {d:'M1020 585L1100 573L1101 580L1020 594Z M1107 572L1198 558L1198 566L1107 581Z M1092 563L1100 559L1110 562L1114 567L1110 574L1112 706L1093 706Z M1190 554L1188 549L1193 546L1200 547L1204 552L1203 672L1190 675Z M1121 579L1126 578L1127 682L1122 684Z M1141 576L1146 575L1147 677L1142 679Z M1162 572L1167 571L1168 672L1163 674Z M1180 569L1184 568L1185 667L1181 669Z M1108 687L1196 658L1197 665L1109 696Z'}, rail);
      const railArt = art('./locations/ferris-platform.png',0,0,1672,941);
      railArt.setAttribute('clip-path','url(#platform-front-rail)');
      const shimmer = node('g', {class:'platform-reflection',fill:'#f6bb6c'});
      for (const [x,y,w] of [[969,820,11],[962,831,16],[973,839,9],[1127,758,13],[1122,768,9]]) {
        node('ellipse',{cx:x,cy:y,rx:w/2,ry:'.8'},shimmer);
      }
      plane.append(svg);
      const urls = ['./wheel-frame.png','./support.png','./gondola-01.png','./platform/waiting-passenger.png'];
      return Promise.all(urls.map(src=>{const img=new Image();img.src=src;return img.decode();})).then(startWheel);
    }
  });
})();


