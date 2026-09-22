// Which level the map shows (Sun, system, body) and what a tap means.

import { changed } from '../events.js';
import { $ } from '../basics.js';
import { B, SITES, SYSNAME, bodyName, moonsOf, planetOfBody } from '../game/world.js';
import { S, ViewLevel, Pick, cargoOrders, here, homePlanet } from '../game/state.js';
import { cargoHints } from '../game/planner.js';
import { Hit, HITS, cv, sc } from './canvas.js';

// Automatic: in transit -> solar system; in low orbit or on the ground -> the body with its sites;
// in high orbit -> system map, unless the next step towards the cargo is an interplanetary transfer.
export function autoView():ViewLevel{
  if(S.action.transit || !S.domain.node) return {level:'sol'};
  const [k,l]=here(), hp=homePlanet(), moons=moonsOf(hp).length>0;
  if(S.render.move){
    const [fb,fl]=S.render.move.from.node.split('.'), [tb,tl]=S.render.move.to.node.split('.');
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
  if(typeof k==='string' && SITES[k]) return {level:'body', planet:hp, body:k};
  return moons ? {level:'sys', planet:hp} : {level:'sol'};
}

export function mapView():ViewLevel{
  const key=S.action.transit?'transit':(S.render.move?'mv:'+S.render.move.to.node+(S.render.move.to.site||'')+'|':'')+(S.domain.node||'')+(S.domain.site||'');
  if(S.ui.mapKey!==key){ S.ui.mapKey=key; S.ui.mapView=null; }
  return S.ui.mapView||autoView();
}

export function setView(v:ViewLevel|null){ S.ui.mapView=v; S.ui.pick=null; changed(); }

export function renderCrumbs(v:ViewLevel){
  const nav=$('crumbs'); if(!nav) return; nav.innerHTML='';
  const segs:[string,ViewLevel][]=[['Solar system',{level:'sol'}]];
  if(v.level!=='sol'){
    const pl=v.planet;
    if(pl && moonsOf(pl).length) segs.push([SYSNAME[pl]||B[pl].name,{level:'sys', planet:pl}]);
  }
  if(v.level==='body') segs.push([bodyName(v.body),v]);
  segs.forEach((sg,i)=>{
    if(i) { const s=document.createElement('span'); s.className='sep'; s.textContent='\u203A'; s.setAttribute('aria-hidden','true'); nav.appendChild(s); }
    const last=i===segs.length-1, b=document.createElement('button'); b.type='button'; b.textContent=sg[0];
    b.className=last?'cur':''; if(last) b.setAttribute('aria-current','page');
    b.onclick=()=>setView(sg[1]); nav.appendChild(b);
  });
  nav.scrollLeft=nav.scrollWidth; // keep the current level in view
  const au=$('mapauto'); if(au){
    au.innerHTML='';
    if(S.ui.mapView){ const b=document.createElement('button'); b.type='button'; b.className='linky'; b.textContent='Auto'; b.title='Let the map follow the ship again'; b.onclick=()=>setView(null); au.appendChild(b); }
    else { au.textContent='Auto'; au.title='The map follows the ship'; }
  }
  const lg=$('legend'); if(lg) lg.textContent = v.level==='sol'
    ? 'Tap a planet for details, double-tap to look closer. Dashed amber: where the target would have to be for an ideal window. Dashed green: destinations of your cargo.'
    : v.level==='sys' ? 'Tap a planet, moon or orbit, double-tap for the landing sites. Green dot: a fuel depot there. Dashed green: destination of your cargo.'
    : 'Tap a landing site or an orbit. Green dot: fuel depot. Dashed green: destination of your cargo.';
}

export function onMapClick(e:MouseEvent){
  const t=e.currentTarget as HTMLElement, r=t.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
  let best:Hit|null=null, bd=Infinity;
  for(const h of HITS){ if(h.canvas===t){ const d=Math.hypot(h.x-x,h.y-y); if(d<h.r && d<bd){ bd=d; best=h; } } }
  const pk:Record<string,any>|null=best?best.pick:null, key=pk?JSON.stringify(pk):null, now=performance.now();
  // Double click or double tap: look closer, or show the landing sites
  if(key && lastTap.key===key && now-lastTap.t<450){ lastTap={key:null,t:0}; const dv=pk?deeperView(pk):null; if(dv){ setView(dv); return; } }
  lastTap={key,t:now};
  S.ui.pick=pk as Pick|null;
  if(best && best.pick.type==='planet' && best.pick.planet!==homePlanet()) S.domain.target=best.pick.planet;
  changed();
}

let lastTap:{key:string|null;t:number}={key:null,t:0};

function deeperView(pk:Record<string,any>):ViewLevel|null{
  if(pk.type==='planet'){ const k=pk.planet; return moonsOf(k).length?{level:'sys',planet:k}:SITES[k]?{level:'body',planet:k,body:k}:null; }
  if(pk.type==='body') return SITES[pk.body]?{level:'body',planet:planetOfBody(pk.body),body:pk.body}:null;
  if(pk.type==='node'){ const b=pk.node.split('.')[0]; if(pk.node.endsWith('.orbit') && SITES[b]) return {level:'body',planet:planetOfBody(b),body:b}; }
  return null;
}

export function wireMap(){
  (cv as HTMLCanvasElement).addEventListener('click',onMapClick as any);
  (sc as HTMLCanvasElement).addEventListener('click',onMapClick as any);
}
