/* Permanent stages and temporary geographic paths; no scene objects or ambient overlays. */
(() => {
  'use strict';
  // Only labels with an established scene resolve. FOOD/RESTROOMS/EXIT have none.
  window.CarnivalSignDestinations = Object.freeze({
    'RIDES':'rides-games', 'GAMES':'rides-games', 'RIDES & GAMES':'rides-games',
    'FERRIS WHEEL':'ferris-platform', 'TENT ROW':'tent-row', 'MIDWAY':'midway',
    'FORTUNE TELLER':'fortune-teller', 'MADAME ZORA':'fortune-teller',
    'BACKSTAGE':'behind-carnival', 'FOREST':'forest-edge',
  });
  window.CarnivalScenes = Object.freeze({
    'midway': {name:'Main Midway', signs:[{label:'RIDES & GAMES',area:[25.8,43.2,10.3,4.7]}], destinations:{'Ferris-Wheel Platform':'ferris-platform','Rides & Games':'rides-games','Tent Row':'tent-row'}},
    'ferris-platform': {name:'Ferris-Wheel Platform', background:'./locations/ferris-platform.png', width:1672, height:941, framing:.70, signs:[{label:'GAMES',area:[1.1,43.5,6.5,5.0]},{label:'FERRIS WHEEL',area:[55,26,25,18]}], paths:[{to:'midway', area:[2,60,17,22]}]},
    'rides-games': {name:'Rides & Games', background:'./locations/rides-games.png', width:1671, height:941, framing:.65, signs:[{label:'GAMES',area:[35.4,41.4,7.5,3.3]},{label:'FOOD',area:[35.4,44.7,7.5,3.1]},{label:'RIDES',area:[35.4,47.8,7.5,3.1]},{label:'RESTROOMS',area:[35.4,50.9,7.5,3.2]},{label:'FUN HOUSE',area:[59,39,10,15]}], paths:[{to:'midway', area:[45,82,24,17]}]},
    'tent-row': {name:'Tent Row', background:'./locations/tent-row.png', width:1672, height:941, framing:.64, signs:[{label:'TENT ROW',area:[58,36,11,7]}], paths:[{to:'fortune-teller', area:[60,44,9,15]}, {to:'behind-carnival', area:[68,57,8,16]}, {to:'midway', area:[45,82,23,17]}]},
    'fortune-teller': {name:'Madame Zora / Fortune Teller', background:'./locations/fortune-teller.png', width:1672, height:941, framing:.50, signs:[{label:'RIDES',area:[88.7,19.3,11.2,6.2]},{label:'FOOD',area:[88.7,25.6,11.2,5.8]},{label:'GAMES',area:[88.7,31.5,11.2,6.0]},{label:'RESTROOMS',area:[88.7,37.6,11.2,6.4]},{label:'MADAME ZORA',area:[31,5,41,22]}], paths:[{to:'tent-row', area:[1,60,12,27]}]},
    'behind-carnival': {name:'Behind the Carnival', background:'./locations/behind-carnival.png', width:1672, height:941, framing:.58, paths:[{to:'tent-row', area:[25,40,13,27]}, {to:'forest-edge', area:[57,41,11,16]}]},
    'forest-edge': {name:'Forest’s Edge', background:'./locations/forest-edge.png', width:1672, height:941, framing:.44, paths:[{to:'behind-carnival', area:[21,55,20,25]}]},
  });
})();
