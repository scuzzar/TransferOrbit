// Wegsuche für den Spieler: datumsabhaengig, mit Sprit- und Fristpruefung.

import { km } from '../basis.js';
import { B, FUEL_SPOTS, KBY, LAUNCH_FEE, M, bodyName, fmtCr, fuelHere, planetGen, siteOf } from './welt.js';
import { HOP_FEE_SHARE, transfer } from './physik.js';
import { S, cargoMass, cargoOrders, dvAvail, eng, homePlanet, kontorAt, locKey, targetName } from './zustand.js';
import { edgesFrom, idealTransfer, route } from './graph.js';
import { feeBlocked, localActions } from './aktionen.js';

// Markierungen für Manöver: Lieferziele, Richtung zur Fracht, Kontore mit Aufträgen
export function cargoHints(){
  const H={step:[], transfer:{}};
  if(!S.node) return H;
  const me={id:'@'+locKey(), node:S.node, site:S.site}, hereK=kontorAt();
  const byDest={};
  cargoOrders().forEach(o=>{ if(!hereK||hereK.id!==o.to) byDest[o.to]=(byDest[o.to]||0)+1; });
  Object.keys(byDest).forEach(id=>{
    const r=route(me,KBY[id]); if(!r.first) return;
    const name=KBY[id].name;
    if(r.first.leg){ const p=r.first.leg[1]; (H.transfer[p]=H.transfer[p]||[]).includes(name)||H.transfer[p].push(name); }
    else H.step.push({node:r.first.node, site:r.first.site, dv:r.first.dv, name, n:byDest[id], final: KBY[id].node===r.first.node && (!KBY[id].site||KBY[id].site===r.first.site)});
  });
  return H;
}

export function planRoute(target, mode, start){
  start = start || (S.node ? {node:S.node, site:S.site, day:S.day} : null);
  if(!start) return null;
  const key=(n,s)=>n+'|'+(s||''), best={}, prev={}, done=new Set();
  const q=[{n:start.node,s:start.site,c:0,dv:0,days:0}]; best[key(start.node,start.site)]=q[0];
  let goal=null;
  while(q.length){
    q.sort((a,b)=>a.c-b.c); const cur=q.shift(), ck=key(cur.n,cur.s);
    if(done.has(ck)) continue; done.add(ck);
    if(cur.n===target.node && (!target.site || cur.s===target.site)){ goal=cur; break; }
    for(const ed0 of edgesFrom(cur.n,cur.s)){
      const ed={...ed0}, day=start.day+cur.days;
      if(ed.leg){ const [a,b]=ed.leg, t=transfer(a,b,day);
        if(mode==='now'){ ed.dv=t.total; ed.days=t.tof; ed.wait=0; }
        else { const id=idealTransfer(a,b); ed.wait=t.d<0.04?0:t.wait; ed.dv=id.total; ed.days=ed.wait+id.tof; } }
      const nk=key(ed.node,ed.site), dv=cur.dv+ed.dv, days=cur.days+ed.days, c=dv+days*0.01;
      if(!best[nk] || c<best[nk].c){ best[nk]={n:ed.node,s:ed.site,c,dv,days}; prev[nk]={k:ck,from:cur,ed}; q.push(best[nk]); }
    }
  }
  if(!goal) return null;
  const path=[]; let k=key(goal.n,goal.s);
  while(prev[k]){ path.unshift({from:prev[k].from, ed:prev[k].ed}); k=prev[k].k; }
  const steps=[]; let day=start.day, fee=0;
  path.forEach(({from,ed})=>{
    if(ed.wait>0){ steps.push({kind:'wait', leg:ed.leg, dv:0, days:ed.wait, label:`Auf das Fenster ${zuName(ed.leg[1])} warten`, until:day+ed.wait}); day+=ed.wait; }
    const days=ed.days-(ed.wait||0);
    if(ed.launch) fee+=Math.round(LAUNCH_FEE*(eng().dry+cargoMass()+S.fuel)*(ed.hop?HOP_FEE_SHARE:1));
    steps.push({kind:ed.leg?'leg':'move', node:ed.node, site:ed.site, leg:ed.leg, dv:ed.dv, days, label:stepLabel(from,ed)}); day+=days;
  });
  return {steps, dv:goal.dv, days:goal.days, arrive:start.day+goal.days, fee};
}

const zuName = p => (p==='venus'||p==='earth'?'zur ':'zum ')+B[p].name;

function stepLabel(from,e){
  if(e.leg) return `Transfer ${zuName(e.leg[1])}`;
  const [fk,fl]=from.n.split('.'), [tk,tl]=e.node.split('.');
  if(tl==='surf'){ const st=siteOf(tk,e.site); if(fl==='surf') return `${e.launch?'Suborbitaler Flug':'Hüpfer'} nach ${st?st.name:bodyName(tk)}`; return `Landen: ${st?st.name:bodyName(tk)}`; }
  if(fl==='surf') return e.launch?'Mit Trägerrakete in den Orbit':`Aufstieg in den Orbit${M[fk]?' um '+M[fk].name:''}`;
  if(fl==='orbit' && tl==='capt') return 'In den hohen Orbit';
  if(fl==='capt' && tk===fk) return e.dv<100?'Aerobremsen in den niedrigen Orbit':'Abstieg in den niedrigen Orbit';
  if(fl==='capt' && M[tk]) return tk==='moon'?'Zum Mond':`Zum Mond ${M[tk].name}`;
  if(M[fk] && tl==='capt') return `Zurück in den hohen Orbit ${planetGen(tk)}`;
  return targetName({node:e.node});
}

export function nearestFuel(start){
  if(fuelHere(start.node,start.site)) return {dv:0, spot:null};
  let best={dv:Infinity, spot:null};
  FUEL_SPOTS.forEach(t=>{ const pl=planRoute(t,'eco',start); if(pl && pl.dv<best.dv) best={dv:pl.dv, spot:t}; });
  return best;
}

export function stepBlocker(st){
  if(st.kind==='leg'){ const hp=homePlanet(); if(S.node!==hp+'.capt') return 'Transfers starten aus dem hohen Orbit.';
    return `Der Transfer kostet gerade ${km(transfer(hp,st.leg[1],S.day).total)} km/s, du hast ${km(dvAvail())}.`; }
  const a=localActions().find(a=>a.to===st.node && (a.site||null)===(st.site||null));
  if(!a) return 'Dieses Manöver ist von hier nicht möglich.';
  if(a.dv>dvAvail()+0.5) return `Es braucht ${km(a.dv)} km/s, du hast ${km(dvAvail())}.`;
  if(feeBlocked(a)) return `Die Startgebühr von ${fmtCr(a.fee)} würde dich in den Konkurs treiben.`;
  return 'Unbekannter Grund.';
}
