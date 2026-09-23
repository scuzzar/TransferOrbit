// Route search for the player: date-aware, checking fuel and deadlines.

import { km } from '../basics.js';
import { B, FUEL_SPOTS, POST_BY_ID, LAUNCH_FEE, M, NodeId, PlanetId, PostId, bodyName, fmtCr, fuelHere, isMoon, isPost, siteOf, splitNode } from './world.js';
import { HOP_FEE_SHARE, transfer } from './physics.js';
import { S, RouteMode, cargoMass, cargoOrders, dvAvail, eng, homePlanet, postAt, locKey, targetName, Target } from './state.js';
import { edgesFrom, idealTransfer, route, Edge } from './graph.js';
import { feeBlocked, localActions } from './actions.js';

export interface FuelSpot { node:NodeId; site:string|null }

// What a day is worth to the search, in m/s. "Economical" all but ignores time, so it
// takes every cheap detour there is. "Leave now" means it literally: it does not wait for
// a window, and it does not dawdle on the way either. Above 75 m/s per day the aerobraking
// step into low Earth orbit (40 days for 60 m/s) loses to the direct burn (1 day, 3006 m/s),
// which is the slowest choice the old, purely delta-v driven search used to make.
const DAY_COST: Record<RouteMode, number> = {eco:0.01, now:100};

// Markers for manoeuvres: delivery targets, the way towards the cargo, posts with orders
export function cargoHints(){
  const H={step:[] as {node:NodeId;site:string|null;dv:number;name:string;n:number;final:boolean}[], transfer:{} as Partial<Record<PlanetId,string[]>>};
  if(!S.domain.node) return H;
  const me={id:'@'+locKey()!, node:S.domain.node, site:S.domain.site}, hereK=postAt();
  const byDest: Partial<Record<PostId, number>> = {};
  cargoOrders().forEach(o=>{ if(!hereK||hereK.id!==o.to) byDest[o.to]=(byDest[o.to]||0)+1; });
  Object.entries(byDest).forEach(([id,n])=>{
    if(!isPost(id) || !n) return;
    const dest=POST_BY_ID[id], r=route(me,dest); if(!r.first) return;
    const name=dest.name;
    if(r.first.leg){ const names=H.transfer[r.first.leg[1]]??=[]; if(!names.includes(name)) names.push(name); }
    else H.step.push({node:r.first.node, site:r.first.site, dv:r.first.dv, name, n, final: dest.node===r.first.node && (!dest.site||dest.site===r.first.site)});
  });
  return H;
}

// wait: for the window of the transfer that follows; leg: the transfer itself; move: anything else
export type PlanStep = { dv:number; days:number; label:string } & (
  | { kind:'wait'; leg:[PlanetId,PlanetId]; until:number }
  | { kind:'leg'; node:NodeId; site:string|null; leg:[PlanetId,PlanetId] }
  | { kind:'move'; node:NodeId; site:string|null });
export interface PlanResult {
  steps: PlanStep[]; dv:number; days:number; arrive:number; fee:number;
}
interface Start { node:NodeId; site:string|null; day:number }
interface RNode { n:NodeId; s:string|null; c:number; dv:number; days:number }
// an edge as the search takes it: a transfer may start with a wait for its window
interface PlanEdge extends Edge { wait?:number }

export function planRoute(target:Target, mode:RouteMode, start?:Start|null): PlanResult|null{
  start = start || (S.domain.node ? {node:S.domain.node, site:S.domain.site, day:S.domain.day} : null);
  if(!start) return null;
  const dayCost = DAY_COST[mode];
  const key=(n:NodeId,s:string|null)=>n+'|'+(s||'');
  const best=new Map<string, RNode>();
  const prev=new Map<string, {k:string; from:RNode; ed:PlanEdge}>();
  const done=new Set<string>();
  const first:RNode={n:start.node,s:start.site,c:0,dv:0,days:0}, q=[first]; best.set(key(start.node,start.site),first);
  let goal:RNode|null=null;
  while(q.length){
    q.sort((a,b)=>a.c-b.c); const cur=q.shift()!, ck=key(cur.n,cur.s);
    if(done.has(ck)) continue; done.add(ck);
    if(cur.n===target.node && (!target.site || cur.s===target.site)){ goal=cur; break; }
    for(const ed0 of edgesFrom(cur.n,cur.s)){
      const ed:PlanEdge={...ed0}, day=start.day+cur.days;
      if(ed.leg){ const [a,b]=ed.leg, t=transfer(a,b,day);
        if(mode==='now'){ ed.dv=t.total; ed.days=t.tof; ed.wait=0; }
        else { const id=idealTransfer(a,b); ed.wait=t.d<0.04?0:t.wait; ed.dv=id.total; ed.days=ed.wait+id.tof; } }
      const nk=key(ed.node,ed.site), dv=cur.dv+ed.dv, days=cur.days+ed.days, c=dv+days*dayCost;
      const old=best.get(nk);
      if(!old || c<old.c){ const nd:RNode={n:ed.node,s:ed.site,c,dv,days}; best.set(nk,nd); prev.set(nk,{k:ck,from:cur,ed}); q.push(nd); }
    }
  }
  if(!goal) return null;
  const path: {from:RNode; ed:PlanEdge}[] = [];
  for(let p=prev.get(key(goal.n,goal.s)); p; p=prev.get(p.k)) path.unshift({from:p.from, ed:p.ed});
  const steps:PlanStep[]=[]; let day=start.day, fee=0;
  path.forEach(({from,ed})=>{
    if(ed.leg && ed.wait){ steps.push({kind:'wait', leg:ed.leg, dv:0, days:ed.wait, label:`Wait for the window to ${toName(ed.leg[1])}`, until:day+ed.wait}); day+=ed.wait; }
    const days=ed.days-(ed.wait||0), label=stepLabel(from,ed);
    if(ed.launch) fee+=Math.round(LAUNCH_FEE*(eng().dry+cargoMass()+S.domain.fuel)*(ed.hop?HOP_FEE_SHARE:1));
    if(ed.leg) steps.push({kind:'leg', node:ed.node, site:ed.site, leg:ed.leg, dv:ed.dv, days, label});
    else steps.push({kind:'move', node:ed.node, site:ed.site, dv:ed.dv, days, label});
    day+=days;
  });
  return {steps, dv:goal.dv, days:goal.days, arrive:start.day+goal.days, fee};
}

const toName = (p:PlanetId) => B[p].name;

function stepLabel(from:RNode, e:Edge){
  if(e.leg) return `Transfer to ${toName(e.leg[1])}`;
  const [fk,fl]=splitNode(from.n), [tk,tl]=splitNode(e.node);
  if(tl==='surf'){ const st=siteOf(tk,e.site); if(fl==='surf') return `${e.launch?'Suborbital flight':'Hop'} to ${st?st.name:bodyName(tk)}`; return `Land at ${st?st.name:bodyName(tk)}`; }
  if(fl==='surf') return e.launch?'Ride a launcher to orbit':`Ascend to orbit${isMoon(fk)?' around '+M[fk].name:''}`;
  if(fl==='orbit' && tl==='capt') return 'Up to high orbit';
  if(fl==='capt' && tk===fk) return e.dv<100?'Aerobrake into low orbit':'Down to low orbit';
  if(fl==='capt' && isMoon(tk)) return tk==='moon'?'To the Moon':`To ${M[tk].name}`;
  if(isMoon(fk) && tl==='capt') return `Back to high orbit of ${bodyName(tk)}`;
  return targetName({node:e.node});
}

export function nearestFuel(start:Start){
  if(fuelHere(start.node,start.site)) return {dv:0, spot:null as FuelSpot|null};
  let best={dv:Infinity, spot:null as FuelSpot|null};
  FUEL_SPOTS.forEach(t=>{ const pl=planRoute(t,'eco',start); if(pl && pl.dv<best.dv) best={dv:pl.dv, spot:t}; });
  return best;
}

export function stepBlocker(st:PlanStep){
  if(st.kind==='wait') return 'Waiting for the transfer window.';
  if(st.kind==='leg'){ const hp=homePlanet(); if(!hp || S.domain.node!==`${hp}.capt`) return 'Transfers start from high orbit.';
    return `The transfer currently costs ${km(transfer(hp,st.leg[1],S.domain.day).total)} km/s, you have ${km(dvAvail())}.`; }
  const a=localActions().find(a2=>a2.to===st.node && (a2.site||null)===(st.site||null));
  if(!a) return 'That manoeuvre is not possible from here.';
  if(a.dv>dvAvail()+0.5) return `It needs ${km(a.dv)} km/s, you have ${km(dvAvail())}.`;
  if(feeBlocked(a)) return `The launch fee of ${fmtCr(a.fee!)} would bankrupt you.`;
  return 'Unknown reason.';
}
