/* Stationary support geometry only. Reuses the approved timber/metal artwork. */
(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  let serial = 0;
  function node(tag, attrs, parent) {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    parent.append(el);
    return el;
  }
  function mount(parent, {pivot, feet, floor, thickness, hubRadius = 0}) {
    const [x,y] = pivot, height = floor-y;
    const group = node('g', {'data-support-pivot':pivot.join(' ')}, parent);
    const defs = node('defs', {}, group);
    const prefix = 'support-structure-' + serial++;
    // A bearing opening leaves the existing hub face visible over the leg ends.
    // The legs still converge at that exact axle; the rotor itself is unchanged.
    if (hubRadius) {
      const clip = node('clipPath', {id:prefix+'-bearing'}, defs);
      const r = hubRadius;
      node('path', {d:`M-2000-2000H4000V4000H-2000Z M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0`, 'clip-rule':'evenodd'}, clip);
      group.setAttribute('clip-path',`url(#${prefix}-bearing)`);
    }
    function piece(name, path, transform) {
      const clip = node('clipPath', {id:prefix+'-'+name}, defs);
      node('path', {d:path}, clip);
      const part = node('g', {transform}, group);
      node('image', {href:'./support.png',x:0,y:0,width:351,height:472,
        'clip-path':`url(#${prefix}-${name})`,preserveAspectRatio:'xMidYMid meet'}, part);
    }
    // The original cross-tie spans the two legs, below their common axle.
    const fraction = .25, left = x+(feet[0]-x)*fraction, right = x+(feet[1]-x)*fraction;
    const braceScale = (right-left)/112;
    piece('brace','M120 163H232V187H120Z',
      `matrix(${braceScale} 0 0 ${thickness} ${left-120*braceScale} ${y+height*fraction-175*thickness})`);
    // Each source leg is isolated from the old flat top and cross-tie. An affine
    // projection maps its upper bearing to the axle and its shoe to the footing.
    // Both legs remain whole, including their original weathering and foot plates.
    for (const [name,root,shoe,foot,path] of [
      ['left',140,74,feet[0],'M118 55H156L80 400L113 425L140 444V472H0V432L32 416L42 400Z'],
      ['right',212,276,feet[1],'M195 55H233L310 400L320 418L351 436V472H205V438L230 420L236 400Z'],
    ]) {
      const shear = (foot-x-thickness*(shoe-root))/400;
      const scaleY = height/400;
      piece(name,path,`matrix(${thickness} 0 ${shear} ${scaleY} ${x-thickness*root-shear*55} ${y-scaleY*55})`);
    }
    return group;
  }
  window.CarnivalSupportStructure = Object.freeze({mount});
  // Midway keeps its exact 600 x 710 assembly coordinates and (305,305) pivot.
  // Only its stationary support groups receive new geometry.
  for (const [selector,options] of [
    ['.wheel-structure-rear',{pivot:[305,305],feet:[170,470],floor:710,thickness:.85}],
    ['.wheel-structure-front',{pivot:[305,305],feet:[90,535],floor:740,thickness:1,hubRadius:40}],
  ]) {
    const parent = document.querySelector(selector);
    if (!parent) continue;
    const svg = node('svg',{class:'support-structure',viewBox:'0 0 600 710','aria-hidden':'true'},parent);
    mount(svg,options);
  }
})();
