// Route search for the player: date-aware, checking fuel and deadlines.

import { km, popMin } from '../basics.js';
import { B, DEPOT_LIST, POST_BY_ID, LAUNCH_FEE, M, Node, NodeId, PlanetId, PostId, bodyName, fmtCr, fuelHere, isMoon, isPost, nodeOf, siteOf } from './world.js';
import { HOP_FEE_SHARE, transfer } from './physics.js';
import { S, RouteMode } from './state.js';
import { Connection, connectionsFrom, idealTransfer, route } from './graph.js';
import { feeBlocked, localActions } from './actions.js';


// What a day is worth to the search, in m/s. "Economical" all but ignores time, so it
// takes every cheap detour there is. "Leave now" means it literally: it does not wait for
// a window, and it does not dawdle on the way either. Above 75 m/s per day the aerobraking
// step into low Earth orbit (40 days for 60 m/s) loses to the direct burn (1 day, 3006 m/s),
// which is the slowest choice the old, purely delta-v driven search used to make.
const DAY_COST: Record<RouteMode, number> = {eco:0.01, now:100};

// Markers for manoeuvres: delivery targets, the way towards the cargo, posts with orders
export interface StepHint { node:NodeId; site:string|null; dv:number; name:string; n:number; final:boolean }
export function cargoHints(){
  const H:{step:StepHint[]; transfer:Partial<Record<PlanetId,string[]>>}={step:[], transfer:{}};
  const me=S.player.ship.place; if(!me) return H;
  const hereK=me.post;
  const byDest: Partial<Record<PostId, number>> = {};
  S.player.ship.hold.forEach(o=>{ if(!hereK||hereK.id!==o.to) byDest[o.to]=(byDest[o.to]||0)+1; });
  Object.entries(byDest).forEach(([id,n])=>{
    if(!isPost(id) || !n) return;
    const dest=POST_BY_ID[id], r=route(me,dest); if(!r.first) return;
    const name=dest.name;
    if(r.first.leg){ const names=H.transfer[r.first.leg[1]]??=[]; if(!names.includes(name)) names.push(name); }
    else H.step.push({node:r.first.to.node, site:r.first.to.site, dv:r.first.dv, name, n, final: dest.node===r.first.to.node && (!dest.site||dest.site===r.first.to.site)});
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
interface RNode { n:Node; c:number; dv:number; days:number }
// a connection as the search takes it: a transfer costs what it costs on the day, or waits for its window
interface PlanEdge { c:Connection; dv:number; days:number; wait:number }

export function planRoute(target:Node, mode:RouteMode, start?:Start|null): PlanResult|null{
  const p=S.player.ship.place;
  start = start || (p ? {node:p.node, site:p.site, day:S.day} : null);
  if(!start) return null;
  const dayCost = DAY_COST[mode];
  const best=new Map<Node, RNode>();
  const prev=new Map<Node, {from:RNode; ed:PlanEdge}>();
  const done=new Set<Node>();
  const first:RNode={n:nodeOf(start.node,start.site),c:0,dv:0,days:0}, q=[first]; best.set(first.n,first);
  let goal:RNode|null=null;
  for(let cur=popMin(q); cur; cur=popMin(q)){
    if(done.has(cur.n)) continue; done.add(cur.n);
    if(cur.n===target){ goal=cur; break; }
    for(const c0 of connectionsFrom(cur.n)){
      const ed:PlanEdge={c:c0, dv:c0.dv, days:c0.days, wait:0}, day=start.day+cur.days, leg=c0.leg;
      if(leg){ const [a,b]=leg, t=transfer(a,b,day);
        if(mode==='now'){ ed.dv=t.total; ed.days=t.tof; ed.wait=0; }
        else { const id=idealTransfer(a,b); ed.wait=t.d<0.04?0:t.wait; ed.dv=id.total; ed.days=ed.wait+id.tof; } }
      const to=c0.to, dv=cur.dv+ed.dv, days=cur.days+ed.days, c=dv+days*dayCost;
      const old=best.get(to);
      if(!old || c<old.c){ const nd:RNode={n:to,c,dv,days}; best.set(to,nd); prev.set(to,{from:cur,ed}); q.push(nd); }
    }
  }
  if(!goal) return null;
  const path: {from:RNode; ed:PlanEdge}[] = [];
  for(let p=prev.get(goal.n); p; p=prev.get(p.from.n)) path.unshift(p);
  const steps:PlanStep[]=[]; let day=start.day, fee=0;
  path.forEach(({from,ed})=>{
    const c=ed.c, leg=c.leg, to=c.to;
    if(leg && ed.wait){ steps.push({kind:'wait', leg, dv:0, days:ed.wait, label:`Wait for the window to ${toName(leg[1])}`, until:day+ed.wait}); day+=ed.wait; }
    const days=ed.days-ed.wait, label=stepLabel(from.n,c);
    if(c.launchFee) fee+=Math.round(LAUNCH_FEE*(S.player.ship.def.dry+S.player.ship.cargoMass+S.player.ship.fuel)*(c.hop?HOP_FEE_SHARE:1));
    if(leg) steps.push({kind:'leg', node:to.node, site:to.site, leg, dv:ed.dv, days, label});
    else steps.push({kind:'move', node:to.node, site:to.site, dv:ed.dv, days, label});
    day+=days;
  });
  return {steps, dv:goal.dv, days:goal.days, arrive:start.day+goal.days, fee};
}

const toName = (p:PlanetId) => B[p].name;

function stepLabel(from:Node, e:Connection){
  const leg=e.leg; if(leg) return `Transfer to ${toName(leg[1])}`;
  const fk=from.body, fl=from.level, tk=e.to.body, tl=e.to.level;
  if(tl==='surf'){ const st=siteOf(tk,e.to.site); if(fl==='surf') return `${e.launchFee?'Suborbital flight':'Hop'} to ${st?st.name:bodyName(tk)}`; return `Land at ${st?st.name:bodyName(tk)}`; }
  if(fl==='surf') return e.launchFee?'Ride a launcher to orbit':`Ascend to orbit${isMoon(fk)?' around '+M[fk].name:''}`;
  if(fl==='orbit' && tl==='capt') return 'Up to high orbit';
  if(fl==='capt' && tk===fk) return e.dv<100?'Aerobrake into low orbit':'Down to low orbit';
  if(fl==='capt' && isMoon(tk)) return tk==='moon'?'To the Moon':`To ${M[tk].name}`;
  if(isMoon(fk) && tl==='capt') return `Back to high orbit of ${bodyName(tk)}`;
  return e.to.label;
}

export function nearestFuel(start:Start):{dv:number; spot:Node|null}{
  if(fuelHere(start.node,start.site)) return {dv:0, spot:null};
  let best:{dv:number; spot:Node|null}={dv:Infinity, spot:null};
  DEPOT_LIST.forEach(d=>{ const pl=planRoute(d.at,'eco',start); if(pl && pl.dv<best.dv) best={dv:pl.dv, spot:d.at}; });
  return best;
}

export function stepBlocker(st:PlanStep){
  if(st.kind==='wait') return 'Waiting for the transfer window.';
  const p=S.player.ship.place, dv=S.player.ship.dvAvail;
  if(st.kind==='leg'){ if(!p || p.node!==`${p.planet}.capt`) return 'Transfers start from high orbit.';
    return `The transfer currently costs ${km(transfer(p.planet,st.leg[1],S.day).total)} km/s, you have ${km(dv)}.`; }
  const a=localActions().find(a2=>a2.to===st.node && (a2.site||null)===(st.site||null));
  if(!a) return 'That manoeuvre is not possible from here.';
  if(a.dv>dv+0.5) return `It needs ${km(a.dv)} km/s, you have ${km(dv)}.`;
  if(a.fee && feeBlocked(a)) return `The launch fee of ${fmtCr(a.fee)} would bankrupt you.`;
  return 'Unknown reason.';
}
