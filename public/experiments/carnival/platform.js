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
      // Source axle (175.5,55) in 351 x 472 artwork meets the rotor pivot.
      const supportX = 995, supportY = -70 - 55 * 470 / 351;
      const supportHeight = 472 * 470 / 351;
      const rearSupport = node('g', {class:'platform-support-rear'}, wheel);
      art('./support.png',supportX,supportY,470,supportHeight,rearSupport);
      const rotor = node('g', {class:'platform-rotor'}, wheel);
      // Frame source hub is (280,280); retain its scale and remove rounding drift.
      const frameScale = 1110 / 550;
      art('./wheel-frame.png',1230-280*frameScale,-70-280*frameScale,1110,535*frameScale,rotor);
      const cabins = [];
      for (let i = 0; i < 12; i++) {
        const angle = (i * 30 + 8) * Math.PI / 180;
        const x = 1230 + 517 * Math.cos(angle);
        const y = -70 + 517 * Math.sin(angle);
        const anchor = node('g', {transform:`translate(${x} ${y})`}, rotor);
        const cabin = node('g', {class:'platform-cabin'}, anchor);
        if (i === 3) {
          cabin.classList.add('platform-boarding-gondola');
          // The supplied top mounting lugs sit at this cabin's orbital pivot.
          art('./platform/boarding-gondola.png', -90, -8, 180, 174.35, cabin);
        } else art('./gondola-01.png', -63, -8, 126, 176.76, cabin);
        cabins.push(cabin);
      }
      // A complete near-side A-frame, not half of the far-side frame.
      // Axle-relative perspective brings its feet toward the camera/left:
      // wider stance, lower footing and shear, with the axle held exactly fixed.
      const frontSupport = node('g', {
        class:'platform-support-front',
        transform:'translate(1230 -70) matrix(1.12 0 -0.20 1.08 0 0) translate(-1230 70)',
      }, wheel);
      art('./support.png',supportX,supportY,470,supportHeight,frontSupport);
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
      node('path', {d:'M0 535H915V362L932 339L1025 289L1043 252L1082 234L1095 212L1117 226L1143 220L1160 252L1212 277L1309 285L1320 275L1350 287L1358 313L1402 281L1450 256L1475 253L1520 234L1563 249L1672 278V941H0Z M974 426L1156 412V610H974Z', 'clip-rule':'evenodd'}, foreground);
      const occlusion = art('./locations/ferris-platform.png',0,0,1672,941);
      occlusion.setAttribute('clip-path','url(#platform-architecture)');
      // Open only the loading bay behind its existing front rails. Reapply those
      // original rails so the moving ordinary cabin remains behind the queue.
      const loadingRails = node('clipPath', {id:'platform-loading-rails'}, defs);
      node('path', {d:'M974 535H1156V548H974Z M974 588L1156 562V574L974 602Z M985 535H994V610H985Z M1010 536H1018V610H1010Z M1035 535H1042V610H1035Z M1064 535H1072V610H1064Z M1093 529H1111V610H1093Z M1121 536H1127V610H1121Z M1141 536H1147V610H1141Z'}, loadingRails);
      const loadingRailArt = art('./locations/ferris-platform.png',0,0,1672,941);
      loadingRailArt.setAttribute('clip-path','url(#platform-loading-rails)');
      // The portrait extends behind the window sill, not over the facade.
      const windowClip = node('clipPath', {id:'platform-booth-window'}, defs);
      node('path', {d:'M1508 516L1657 516L1657 642L1508 632Z'}, windowClip);
      const attendantLayer = node('g', {class:'platform-attendant', 'clip-path':'url(#platform-booth-window)'});
      art('./platform/attendant.png',1502,521,140,169.47,attendantLayer);
      const counterClip = node('clipPath', {id:'platform-counter'}, defs);
      node('path', {d:'M1589 584L1654 587L1653 643L1589 638Z M1645 519H1672V648H1645Z M1507 631L1672 642V660H1507Z'}, counterClip);
      const counter = art('./locations/ferris-platform.png',0,0,1672,941);
      counter.setAttribute('clip-path','url(#platform-counter)');

      // Both shoes rest on the upper wooden deck, behind its front edge.
      node('ellipse', {cx:1065,cy:614,rx:12,ry:2.5,fill:'#080c10',opacity:'.65'});
      node('ellipse', {cx:1100,cy:620,rx:12,ry:2.5,fill:'#080c10',opacity:'.65'});
      const passenger = art('./platform/waiting-passenger.png',1009,420,134.67,202);
      passenger.setAttribute('class','platform-passenger');
      const rail = node('clipPath', {id:'platform-front-rail'}, defs);
      node('path', {d:'M1020 585L1100 573L1101 580L1020 594Z M1107 572L1198 558L1198 566L1107 581Z M1092 563L1100 559L1110 562L1114 567L1110 574L1112 706L1093 706Z M1190 554L1188 549L1193 546L1200 547L1204 552L1203 672L1190 675Z M1121 579L1126 578L1127 682L1122 684Z M1141 576L1146 575L1147 677L1142 679Z M1162 572L1167 571L1168 672L1163 674Z M1180 569L1184 568L1185 667L1181 669Z M1108 687L1196 658L1197 665L1109 696Z'}, rail);
      const railArt = art('./locations/ferris-platform.png',0,0,1672,941);
      // Front pickets crossing the relocated passenger; rear rails stay behind.
      node('path', {d:'M1049 585L1055 584L1056 686L1050 688Z M1071 582L1077 581L1078 686L1072 688Z'}, rail);
      railArt.setAttribute('clip-path','url(#platform-front-rail)');
      const shimmer = node('g', {class:'platform-reflection',fill:'#f6bb6c'});
      for (const [x,y,w] of [[969,820,11],[962,831,16],[973,839,9],[1127,758,13],[1122,768,9]]) {
        node('ellipse',{cx:x,cy:y,rx:w/2,ry:'.8'},shimmer);
      }
      // Small discarded objects, in the ground plane and outside all path bounds.
      node('ellipse', {cx:1040,cy:787,rx:10,ry:3,fill:'#080c10',opacity:'.3'});
      const ticketGround = node('g', {transform:'translate(1040 786) rotate(-16) scale(1 .48)'});
      const ticket = node('g', {class:'platform-loose-ticket'}, ticketGround);
      art('./platform/loose-ticket.png',-11,-12.29,22,24.58,ticket);
      node('ellipse', {cx:1116,cy:810,rx:3.8,ry:1.1,fill:'#080c10',opacity:'.5'});
      const token = art('./platform/dropped-token.png',1112.25,807.3,7.5,2.84);
      token.setAttribute('class','platform-dropped-token');
      plane.append(svg);
      const urls = ['./wheel-frame.png','./support.png','./gondola-01.png','./platform/waiting-passenger.png','./platform/attendant.png','./platform/boarding-gondola.png','./platform/loose-ticket.png','./platform/dropped-token.png'];
      return Promise.all(urls.map(src=>{const img=new Image();img.src=src;return img.decode();})).then(startWheel);
    }
  });
})();


