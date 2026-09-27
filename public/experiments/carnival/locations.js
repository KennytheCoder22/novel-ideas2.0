/* Permanent stages and temporary geographic paths; no scene objects or ambient overlays. */
(() => {
  'use strict';
  window.CarnivalScenes = Object.freeze({
    'midway': {name:'Main Midway', destinations:{'Ferris-Wheel Platform':'ferris-platform','Rides & Games':'rides-games','Tent Row':'tent-row'}},
    'ferris-platform': {name:'Ferris-Wheel Platform', background:'./locations/ferris-platform.png', width:1672, height:941, framing:.70, paths:[{to:'midway', area:[2,60,17,22]}]},
    'rides-games': {name:'Rides & Games', background:'./locations/rides-games.png', width:1671, height:941, framing:.65, paths:[{to:'midway', area:[45,82,24,17]}]},
    'tent-row': {name:'Tent Row', background:'./locations/tent-row.png', width:1672, height:941, framing:.64, paths:[{to:'fortune-teller', area:[60,44,9,15]}, {to:'behind-carnival', area:[68,57,8,16]}, {to:'midway', area:[45,82,23,17]}]},
    'fortune-teller': {name:'Madame Zora / Fortune Teller', background:'./locations/fortune-teller.png', width:1672, height:941, framing:.50, paths:[{to:'tent-row', area:[1,60,12,27]}]},
    'behind-carnival': {name:'Behind the Carnival', background:'./locations/behind-carnival.png', width:1672, height:941, framing:.58, paths:[{to:'tent-row', area:[25,40,13,27]}, {to:'forest-edge', area:[57,41,11,16]}]},
    'forest-edge': {name:'Forest’s Edge', background:'./locations/forest-edge.png', width:1672, height:941, framing:.44, paths:[{to:'behind-carnival', area:[21,55,20,25]}]},
  });
})();
