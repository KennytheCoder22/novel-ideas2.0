/* Permanent stages only. Empty scenes deliberately have no objects or paths yet. */
(() => {
  'use strict';
  window.CarnivalScenes = Object.freeze({
    'midway': {name:'Main Midway', destinations:{'Ferris-Wheel Platform':'ferris-platform','Rides & Games':'rides-games','Tent Row':'tent-row'}},
    'ferris-platform': {name:'Ferris-Wheel Platform', background:'./locations/ferris-platform.png', width:1672, height:941, framing:.70},
    'rides-games': {name:'Rides & Games', background:'./locations/rides-games.png', width:1671, height:941, framing:.65},
    'tent-row': {name:'Tent Row', background:'./locations/tent-row.png', width:1672, height:941, framing:.64},
    'fortune-teller': {name:'Madame Zora / Fortune Teller', background:'./locations/fortune-teller.png', width:1672, height:941, framing:.50},
    'behind-carnival': {name:'Behind the Carnival', background:'./locations/behind-carnival.png', width:1672, height:941, framing:.58},
    'forest-edge': {name:'Forest’s Edge', background:'./locations/forest-edge.png', width:1672, height:941, framing:.44},
  });
})();
