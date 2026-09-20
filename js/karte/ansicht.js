// Welche Ebene die Karte zeigt (Sonne, System, Körper) und was ein Tippen bedeutet.

import { geaendert } from '../ereignisse.js';
import { $ } from '../basis.js';
import { B, SITES, SYSNAME, bodyName, moonsOf, planetOfBody } from '../spiel/welt.js';
import { S, cargoOrders, here, homePlanet } from '../spiel/zustand.js';
import { cargoHints } from '../spiel/planer.js';
import { HITS, cv, sc } from './leinwand.js';

// Automatik: Transfer → Sonnensystem; im niedrigen Orbit oder am Boden → Körper mit Landeplätzen;
// im hohen Orbit → Systemkarte, außer der nächste Schritt zur Fracht ist ein interplanetarer Transfer.
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

export function setView(v){ S.ui.mapView=v; S.ui.pick=null; geaendert(); }

export function renderCrumbs(v){
  const nav=$('crumbs'); nav.innerHTML='';
  const segs=[{t:'Sonnensystem', v:{level:'sol'}}];
  if(v.planet && moonsOf(v.planet).length) segs.push({t:SYSNAME[v.planet]||B[v.planet].name, v:{level:'sys', planet:v.planet}});
  if(v.level==='body') segs.push({t:bodyName(v.body), v});
  segs.forEach((sg,i)=>{
    if(i) { const s=document.createElement('span'); s.className='sep'; s.textContent='›'; s.setAttribute('aria-hidden','true'); nav.appendChild(s); }
    const last=i===segs.length-1, b=document.createElement('button'); b.type='button'; b.textContent=sg.t;
    b.className=last?'cur':''; if(last) b.setAttribute('aria-current','page');
    b.onclick=()=>setView(sg.v); nav.appendChild(b);
  });
  nav.scrollLeft=nav.scrollWidth; // aktuelle Ebene sichtbar halten
  const au=$('mapauto'); au.innerHTML='';
  if(S.ui.mapView){ const b=document.createElement('button'); b.type='button'; b.className='linky'; b.textContent='Auto'; b.title='Karte folgt wieder dem Schiff'; b.onclick=()=>setView(null); au.appendChild(b); }
  else { au.textContent='Auto'; au.title='Die Karte folgt dem Schiff'; }
  $('legend').textContent = v.level==='sol'
    ? 'Planet antippen für Details, doppelt antippen zum Näheransehen. Bernstein gestrichelt: wo das Ziel für ein ideales Fenster stehen müsste. Grün gestrichelt: Ziele deiner Fracht.'
    : v.level==='sys' ? 'Planet, Mond oder Orbit antippen, doppelt antippen für die Landeplätze. Grüner Punkt: Tankstelle dort. Grün gestrichelt: Ziel deiner Fracht.'
    : 'Landeplatz oder Orbit antippen. Grüner Punkt: Tankstelle. Grün gestrichelt: Ziel deiner Fracht.';
}

export function onMapClick(e){
  const t=e.currentTarget, r=t.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
  let best=null, bd=Infinity;
  HITS.filter(h=>h.canvas===t).forEach(h=>{ const d=Math.hypot(h.x-x,h.y-y); if(d<h.r && d<bd){ bd=d; best=h; } });
  const pk=best?best.pick:null, key=pk?JSON.stringify(pk):null, now=performance.now();
  // Doppelklick oder doppeltes Antippen: näher ansehen bzw. Landeplätze zeigen
  if(key && lastTap.key===key && now-lastTap.t<450){ lastTap={key:null,t:0}; const dv=deeperView(pk); if(dv){ setView(dv); return; } }
  lastTap={key,t:now};
  S.ui.pick=pk;
  if(best && best.pick.type==='planet' && best.pick.planet!==homePlanet()) S.target=best.pick.planet;
  geaendert();
}

let lastTap={key:null,t:0};

function deeperView(pk){
  if(pk.type==='planet'){ const k=pk.planet; return moonsOf(k).length?{level:'sys',planet:k}:SITES[k]?{level:'body',planet:k,body:k}:null; }
  if(pk.type==='body') return SITES[pk.body]?{level:'body',planet:planetOfBody(pk.body),body:pk.body}:null;
  if(pk.type==='node'){ const b=pk.node.split('.')[0]; if(pk.node.endsWith('.orbit') && SITES[b]) return {level:'body',planet:planetOfBody(b),body:b}; }
  return null;
}

export function verdrahteKarte(){
  cv.addEventListener('click',onMapClick);
  sc.addEventListener('click',onMapClick);
}
