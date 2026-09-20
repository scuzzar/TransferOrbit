// Which level the map shows (Sun, system, body) and what a tap means.

import { changed } from '../events.js';
import { $ } from '../basics.js';
import { B, SITES, SYSNAME, bodyName, moonsOf, planetOfBody } from '../game/world.js';
import { S, cargoOrders, here, homePlanet } from '../game/state.js';
import { cargoHints } from '../game/planner.js';
import { HITS, cv, sc } from './canvas.js';

// Automatic: in transit -> solar system; in low orbit or on the ground -> the body with its sites;
// in high orbit -> system map, unless the next step towards the cargo is an interplanetary transfer.
export function autoView(){
  if(S.transit || !S.node) return {level:'sol'};
  const [k,l]=here(), hp=homePlanet(), moons=moonsOf(hp).length>0;
  if(S.move){
    const [fb,fl]=S.move.from.node.split('.'), [tb,tl]=S.move.to.node.split('.');
    if(fb===tb && fl!=='capt' && tl!=='capt' && SITES[fb]) return {level:'body', planet:hp, body:fb};
    if(moons) return {level:'sys', planet:hp};
    if(SITES[fb]) return {level:'body', planet:hp, body:fb};
    return {level:'sol'};
  }
  if(l==='capt'){
    if(!moons) return {level:'sol'};
    const h=cargoHints();
    if(!cargoOrders().length || (Object.keys(h.transfer).length && !h.step.length)) return {level:'sol'};
    return {level:'sys', planet:hp};
  }
  if(SITES[k]) return {level:'body', planet:hp, body:k};
  return moons ? {level:'sys', planet:hp} : {level:'sol'};
}

export function mapView(){
  const key=S.transit?'transit':(S.move?'mv:'+S.move.to.node+(S.move.to.site||'')+'|':'')+(S.node||'')+(S.site||'');
  if(S.ui.mapKey!==key){ S.ui.mapKey=key; S.ui.mapView=null; }
  return S.ui.mapView||autoView();
}

export function setView(v){ S.ui.mapView=v; S.ui.pick=null; changed(); }

export function renderCrumbs(v){
  const nav=$('crumbs'); nav.innerHTML='';
  const segs=[{t:'Solar system', v:{level:'sol'}}];
  if(v.planet && moonsOf(v.planet).length) segs.push({t:SYSNAME[v.planet]||B[v.planet].name, v:{level:'sys', planet:v.planet}});
  if(v.level==='body') segs.push({t:bodyName(v.body), v});
  segs.forEach((sg,i)=>{
    if(i) { const s=document.createElement('span'); s.className='sep'; s.textContent='›'; s.setAttribute('aria-hidden','true'); nav.appendChild(s); }
    const last=i===segs.length-1, b=document.createElement('button'); b.type='button'; b.textContent=sg.t;
    b.className=last?'cur':''; if(last) b.setAttribute('aria-current','page');
    b.onclick=()=>setView(sg.v); nav.appendChild(b);
  });
  nav.scrollLeft=nav.scrollWidth; // keep the current level in view
  const au=$('mapauto'); au.innerHTML='';
  if(S.ui.mapView){ const b=document.createElement('button'); b.type='button'; b.className='linky'; b.textContent='Auto'; b.title='Let the map follow the ship again'; b.onclick=()=>setView(null); au.appendChild(b); }
  else { au.textContent='Auto'; au.title='The map follows the ship'; }
  $('legend').textContent = v.level==='sol'
    ? 'Tap a planet for details, double-tap to look closer. Dashed amber: where the target would have to be for an ideal window. Dashed green: destinations of your cargo.'
    : v.level==='sys' ? 'Tap a planet, moon or orbit, double-tap for the landing sites. Green dot: a fuel depot there. Dashed green: destination of your cargo.'
    : 'Tap a landing site or an orbit. Green dot: fuel depot. Dashed green: destination of your cargo.';
}

export function onMapClick(e){
  const t=e.currentTarget, r=t.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
  let best=null, bd=Infinity;
  HITS.filter(h=>h.canvas===t).forEach(h=>{ const d=Math.hypot(h.x-x,h.y-y); if(d<h.r && d<bd){ bd=d; best=h; } });
  const pk=best?best.pick:null, key=pk?JSON.stringify(pk):null, now=performance.now();
  // Double click or double tap: look closer, or show the landing sites
  if(key && lastTap.key===key && now-lastTap.t<450){ lastTap={key:null,t:0}; const dv=deeperView(pk); if(dv){ setView(dv); return; } }
  lastTap={key,t:now};
  S.ui.pick=pk;
  if(best && best.pick.type==='planet' && best.pick.planet!==homePlanet()) S.target=best.pick.planet;
  changed();
}

let lastTap={key:null,t:0};

function deeperView(pk){
  if(pk.type==='planet'){ const k=pk.planet; return moonsOf(k).length?{level:'sys',planet:k}:SITES[k]?{level:'body',planet:k,body:k}:null; }
  if(pk.type==='body') return SITES[pk.body]?{level:'body',planet:planetOfBody(pk.body),body:pk.body}:null;
  if(pk.type==='node'){ const b=pk.node.split('.')[0]; if(pk.node.endsWith('.orbit') && SITES[b]) return {level:'body',planet:planetOfBody(b),body:b}; }
  return null;
}

export function wireMap(){
  cv.addEventListener('click',onMapClick);
  sc.addEventListener('click',onMapClick);
}
