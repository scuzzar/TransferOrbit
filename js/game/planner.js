// Route search for the player: date-aware, checking fuel and deadlines.

import { km } from '../basics.js';
import { B, FUEL_SPOTS, POST_BY_ID, LAUNCH_FEE, M, bodyName, fmtCr, fuelHere, siteOf } from './world.js';
import { HOP_FEE_SHARE, transfer } from './physics.js';
import { S, cargoMass, cargoOrders, dvAvail, eng, homePlanet, postAt, locKey, targetName } from './state.js';
import { edgesFrom, idealTransfer, route } from './graph.js';
import { feeBlocked, localActions } from './actions.js';

// What a day is worth to the search, in m/s. "Economical" all but ignores time, so it
// takes every cheap detour there is. "Leave now" means it literally: it does not wait for
// a window, and it does not dawdle on the way either. Above 75 m/s per day the aerobraking
// step into low Earth orbit (40 days for 60 m/s) loses to the direct burn (1 day, 3006 m/s),
// which is the slowest choice the old, purely delta-v driven search used to make.
const DAY_COST = {eco:0.01, now:100};

// Markers for manoeuvres: delivery targets, the way towards the cargo, posts with orders
export function cargoHints(){
  const H={step:[], transfer:{}};
  if(!S.node) return H;
  const me={id:'@'+locKey(), node:S.node, site:S.site}, hereK=postAt();
  const byDest={};
  cargoOrders().forEach(o=>{ if(!hereK||hereK.id!==o.to) byDest[o.to]=(byDest[o.to]||0)+1; });
  Object.keys(byDest).forEach(id=>{
    const r=route(me,POST_BY_ID[id]); if(!r.first) return;
    const name=POST_BY_ID[id].name;
    if(r.first.leg){ const p=r.first.leg[1]; (H.transfer[p]=H.transfer[p]||[]).includes(name)||H.transfer[p].push(name); }
    else H.step.push({node:r.first.node, site:r.first.site, dv:r.first.dv, name, n:byDest[id], final: POST_BY_ID[id].node===r.first.node && (!POST_BY_ID[id].site||POST_BY_ID[id].site===r.first.site)});
  });
  return H;
}

export function planRoute(target, mode, start){
  start = start || (S.node ? {node:S.node, site:S.site, day:S.day} : null);
  if(!start) return null;
  const dayCost = DAY_COST[mode] ?? DAY_COST.eco;
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
      const nk=key(ed.node,ed.site), dv=cur.dv+ed.dv, days=cur.days+ed.days, c=dv+days*dayCost;
      if(!best[nk] || c<best[nk].c){ best[nk]={n:ed.node,s:ed.site,c,dv,days}; prev[nk]={k:ck,from:cur,ed}; q.push(best[nk]); }
    }
  }
  if(!goal) return null;
  const path=[]; let k=key(goal.n,goal.s);
  while(prev[k]){ path.unshift({from:prev[k].from, ed:prev[k].ed}); k=prev[k].k; }
  const steps=[]; let day=start.day, fee=0;
  path.forEach(({from,ed})=>{
    if(ed.wait>0){ steps.push({kind:'wait', leg:ed.leg, dv:0, days:ed.wait, label:`Wait for the window to ${toName(ed.leg[1])}`, until:day+ed.wait}); day+=ed.wait; }
    const days=ed.days-(ed.wait||0);
    if(ed.launch) fee+=Math.round(LAUNCH_FEE*(eng().dry+cargoMass()+S.fuel)*(ed.hop?HOP_FEE_SHARE:1));
    steps.push({kind:ed.leg?'leg':'move', node:ed.node, site:ed.site, leg:ed.leg, dv:ed.dv, days, label:stepLabel(from,ed)}); day+=days;
  });
  return {steps, dv:goal.dv, days:goal.days, arrive:start.day+goal.days, fee};
}

const toName = p => B[p].name;

function stepLabel(from,e){
  if(e.leg) return `Transfer to ${toName(e.leg[1])}`;
  const [fk,fl]=from.n.split('.'), [tk,tl]=e.node.split('.');
  if(tl==='surf'){ const st=siteOf(tk,e.site); if(fl==='surf') return `${e.launch?'Suborbital flight':'Hop'} to ${st?st.name:bodyName(tk)}`; return `Land at ${st?st.name:bodyName(tk)}`; }
  if(fl==='surf') return e.launch?'Ride a launcher to orbit':`Ascend to orbit${M[fk]?' around '+M[fk].name:''}`;
  if(fl==='orbit' && tl==='capt') return 'Up to high orbit';
  if(fl==='capt' && tk===fk) return e.dv<100?'Aerobrake into low orbit':'Down to low orbit';
  if(fl==='capt' && M[tk]) return tk==='moon'?'To the Moon':`To ${M[tk].name}`;
  if(M[fk] && tl==='capt') return `Back to high orbit of ${B[tk].name}`;
  return targetName({node:e.node});
}

export function nearestFuel(start){
  if(fuelHere(start.node,start.site)) return {dv:0, spot:null};
  let best={dv:Infinity, spot:null};
  FUEL_SPOTS.forEach(t=>{ const pl=planRoute(t,'eco',start); if(pl && pl.dv<best.dv) best={dv:pl.dv, spot:t}; });
  return best;
}

export function stepBlocker(st){
  if(st.kind==='leg'){ const hp=homePlanet(); if(S.node!==hp+'.capt') return 'Transfers start from high orbit.';
    return `The transfer currently costs ${km(transfer(hp,st.leg[1],S.day).total)} km/s, you have ${km(dvAvail())}.`; }
  const a=localActions().find(a=>a.to===st.node && (a.site||null)===(st.site||null));
  if(!a) return 'That manoeuvre is not possible from here.';
  if(a.dv>dvAvail()+0.5) return `It needs ${km(a.dv)} km/s, you have ${km(dvAvail())}.`;
  if(feeBlocked(a)) return `The launch fee of ${fmtCr(a.fee)} would bankrupt you.`;
  return 'Unknown reason.';
}
