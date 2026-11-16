// Narrative state is separate from the explicit story-experience evidence below.
export const encounter='kit-living-mirrors';
export const bands=['kids','pre-teens','teens','adults'];
const option=(id,label,next,preferences,consequence)=>({id,label,next,preferences,consequence});
export const nodes={
 opening:{line:'“I’m Kit. That shadow has been following me. Shall we find out why?”',cue:'point-shadow',choices:[
  option('follow-clues','Follow its trail. I want to untangle the secret.','mystery',['mystery','investigation'],'Kit reveals a ticket-shaped shadow with a missing last guest.'),
  option('hear-kit','Stay with Kit. I want to hear her story.','connection',['connection','character-history'],'Kit opens a reflection of the evening she promised to watch the hall.'),
  option('face-shadow','Let it come closer. I want to face the danger.','suspense',['suspense','danger'],'Kit draws a circle of lamplight; the shadow approaches its edge.')
 ]},
 mystery:{line:'Kit turns a tiny mirror. “The last guest is the keeper’s own reflection. Clever. Unfair, but clever.”',cue:'reveal-ticket',choices:[
  option('solve-rule','Work out the loophole, clue by clue.','paper-door',['mystery','puzzle-solving','layered-complexity','measured-pacing'],'A tiny mirror turns toward the exit; a paper door opens for the reflected guest.'),
  option('follow-impossible','Follow the guest into that impossible little room.','secret-room',['wonder','adventure','discovery'],'Kit opens a hidden room of unfinished carnival maps and saves a route fragment.')
 ]},
 connection:{line:'“One evening,” Kit says. “That was my promise. I used to sing so the hall wouldn’t feel empty.”',cue:'share-memory',choices:[
  option('hear-song','Share a gentle memory. Hear her sister’s song.','shared-song',['connection','emotional-relationships','lighter-tone'],'Kit shares a song from before the carnival; two warm reflections keep its rhythm.'),
  option('uncover-name','Discover why the hall forgot her name.','kept-name',['connection','character-history','mystery'],'Kit scratches her name beneath the keeper’s rule; the mirror can no longer erase it.')
 ]},
 suspense:{line:'The shadow stops at Kit’s light. She grins, just a little. “It’s waiting for us to blink.”',cue:'shadow-approach',choices:[
  option('hold-boundary','Wait in the dark. Let the suspense build slowly.','lantern-boundary',['suspense','measured-pacing','darker-tone'],'The shadow tests the light three times. Kit learns its limit and marks a safe boundary.'),
  option('chase-reveal','Chase it into the light. I want a sudden, playful reveal.','shadow-friend',['brisk-pacing','lighter-tone','mystery'],'Kit chases the shadow into the lantern beam: it unfolds into her lost paper bird.')
 ]},
 'paper-door':{line:'Kit folds the ticket into a door. The tiny guest steps out. “A promise needs an ending. We found one.”',cue:'paper-door',ending:true,outcome:'last-guest-released',discovery:'The keeper counted its own reflection as the last guest.'},
 'secret-room':{line:'Beyond the glass: maps of places the carnival hasn’t visited yet. Kit tears off one corner. “Next time, we pick a road.”',cue:'secret-room',ending:true,outcome:'impossible-route-saved',discovery:'A route fragment points beyond the carnival’s existing paths.'},
 'shared-song':{line:'Kit hums; the lamps answer. “My sister always sang the wrong last note. I think I finally remember it.”',cue:'shared-song',ending:true,outcome:'kits-song-remembered',discovery:'Kit’s song belongs to someone outside the hall.'},
 'kept-name':{line:'KIT stays on the glass when everything else fades. She laughs. “There. The hall can forget its rules before it forgets me.”',cue:'kept-name',ending:true,outcome:'kits-name-anchored',discovery:'A name remembered by another person resists the mirror’s erasure.'},
 'lantern-boundary':{line:'The shadow folds back into the doorway. Kit marks the glass. “It can borrow darkness. It can’t cross light we share.”',cue:'lantern-boundary',ending:true,outcome:'shadow-boundary-known',discovery:'The shadow cannot cross a shared pool of light.'},
 'shadow-friend':{line:'A paper bird lands on Kit’s wrist. “You dreadful little thing.” She smiles. One wing carries a map neither of you drew.',cue:'shadow-friend',ending:true,outcome:'paper-bird-returned',discovery:'The frightening shadow was Kit’s paper bird, carrying an unfamiliar map.'}
};
const options=Object.entries(nodes).flatMap(([decision,node])=>(node.choices||[]).map(o=>({decision,...o})));
export const preferenceLabels={mystery:'Mystery and secrets',investigation:'Investigation',connection:'Character-driven stories','character-history':'Personal histories',suspense:'Suspense',danger:'Threat and danger','puzzle-solving':'Puzzle-solving','layered-complexity':'Layered narrative complexity','measured-pacing':'Measured pacing',wonder:'Fantasy and surreal experiences',adventure:'Adventure',discovery:'Discovery','emotional-relationships':'Emotional relationships','lighter-tone':'Lighter storytelling','darker-tone':'Darker storytelling','brisk-pacing':'Brisk pacing'};
export const fresh=()=>({version:1,node:'opening',introSeen:false,decisions:[],outcomes:[]});
export function normalize(raw){
 const state=fresh();if(raw?.version!==1)return state;
 if(Object.hasOwn(nodes,raw.node))state.node=raw.node;
 state.introSeen=raw.introSeen===true;
 state.decisions=(Array.isArray(raw.decisions)?raw.decisions:[]).filter(d=>d&&options.some(o=>o.decision===d.decision&&o.id===d.option)).slice(-64).map(d=>({decision:d.decision,option:d.option,outcome:nodes[options.find(o=>o.decision===d.decision&&o.id===d.option).next].outcome||null}));
 state.outcomes=[...new Set((Array.isArray(raw.outcomes)?raw.outcomes:[]).filter(o=>Object.values(nodes).some(n=>n.outcome===o)))];return state;
}
const list=v=>Array.isArray(v)?v:[];
function priorContext(prior={}){
 return {legacyKit:{node:typeof prior?.legacyKit?.node==='string'?prior.legacyKit.node:'opening',actions:list(prior?.legacyKit?.actions).filter(x=>typeof x==='string').slice(-20)},afterimages:{order:list(prior?.afterimages?.order).filter(x=>['midway','forest-edge'].includes(x)),home:['shelter','wander'].includes(prior?.afterimages?.home)?prior.afterimages.home:null},cycleEleven:{clues:list(prior?.cycleEleven?.clues).filter(x=>['midway','fun-house','fortune-teller'].includes(x)),decision:['open','self'].includes(prior?.cycleEleven?.decision)?prior.cycleEleven.decision:null,reverse:!!prior?.cycleEleven?.reverse},borrowedLight:prior?.borrowedLight===true};
}
export function contextLine(raw,prior={},band='teens'){
 const state=normalize(raw),p=priorContext(prior);
 if(state.node==='opening'){
  if(state.outcomes.length)return 'Kit traces the marks you left together. “Another corner of the hall?”';
  if(['together','wait','truth','loophole','memory','keeper'].includes(p.legacyKit.node))return '“I came back to see what the hall was hiding,” Kit says. “Our way out is still there.”';
  if(p.cycleEleven.decision==='open')return '“That place you left open at Zora’s? The shadow keeps looking toward it.”';
  if(p.cycleEleven.decision==='self')return '“Your ticket turned toward you before you moved. The shadow noticed.”';
  if(p.legacyKit.node==='unfinished')return '“You came back,” Kit says. “Good. I found something while you were away.”';
 }
 if(state.node==='mystery'&&p.afterimages.order.includes('midway'))return 'Kit matches the ticket holes to the circle and star you found in the Midway water.';
 if(state.node==='mystery'&&p.cycleEleven.clues.includes('fun-house'))return 'Kit holds this ticket beside the unpunched one. “A watcher’s promise. A guest’s invitation. Two different things.”';
 if(state.node==='connection'&&p.afterimages.home==='shelter')return 'The light you sheltered at Zora’s keeps time with Kit’s half-remembered song.';
 if(state.node==='connection'&&p.legacyKit.node==='memory')return '“You gave up a memory for me. Let me give you one that belongs to me.”';
 if(state.node==='suspense'&&p.borrowedLight)return 'Kit borrows the route of Zora’s returning light to draw a safe circle.';
 if(state.node==='suspense'&&p.afterimages.home==='wander')return 'The wandering Afterimage slips around the shadow and lights its far side.';
 if(state.node==='secret-room'&&p.afterimages.order.includes('forest-edge'))return 'A branch from Forest’s Edge is drawn in the corner. Your discoveries belong to the same map.';
 if(state.node==='paper-door'&&['truth','loophole'].includes(p.legacyKit.node))return 'The route you found before stays open. This smaller door belongs to the guest the keeper left behind.';
 if(state.node==='lantern-boundary'&&band==='kids')return 'Kit gives you a reassuring wink. The shadow keeps its distance.';
 return '';
}
export function choose(raw,optionId,{band='teens',prior={}}={}){
 const state=normalize(raw),node=nodes[state.node],selected=node.choices?.find(o=>o.id===optionId);
 if(!selected||!bands.includes(band))return {state,evidence:null,accepted:false};
 const context=priorContext(prior),next=nodes[selected.next],detail=contextLine(state,context,band);
 const evidence={schema:'dreamscapes-narrative-evidence/v1',id:encounter+':'+state.node+':'+selected.id,source:'kit',encounter,decision:state.node,ageBand:band,origin:'explicit-narrative-experience',presented:{prompt:node.line,options:node.choices.map(o=>({id:o.id,label:o.label,preferences:[...o.preferences]}))},selected:{id:selected.id,label:selected.label},preferences:[...selected.preferences],strength:0.65,confidence:0.6,context:{scene:'fun-house',chapter:'living-hall-of-mirrors',prior:context,detail},priorDecisions:state.decisions.map(d=>({...d})),priorOutcomes:[...state.outcomes],consequence:{node:selected.next,outcome:next.outcome||null,description:selected.consequence,continuity:detail}};
 const decision={decision:state.node,option:selected.id,outcome:next.outcome||null};
 return {accepted:true,evidence,state:{...state,node:selected.next,decisions:[...state.decisions,decision].slice(-64),outcomes:next.outcome?[...new Set([...state.outcomes,next.outcome])]:state.outcomes}};
}
export const replay=raw=>({...normalize(raw),node:'opening'});
// Accept only authored explicit experience choices, never arbitrary gameplay actions.
export function normalizeEvidence(raw){
 if(raw?.schema!=='dreamscapes-narrative-evidence/v1'||raw.origin!=='explicit-narrative-experience'||raw.encounter!==encounter||!bands.includes(raw.ageBand))return null;
 const selected=options.find(o=>o.decision===raw.decision&&o.id===raw.selected?.id);if(!selected)return null;
 return choose({...fresh(),node:raw.decision,decisions:raw.priorDecisions,outcomes:raw.priorOutcomes},selected.id,{band:raw.ageBand,prior:raw.context?.prior}).evidence;
}
