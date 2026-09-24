// Route planning for the player: a plan of steps, drafted from a preset, laid out by the date,
// changed step by step and planned again around what the player pinned.

import { dateStr, km, popMin } from '../basics.js';
import { BODIES, Connection, DAY_VALUE, DAY_VALUE_STEPS, DEPOT_LIST, LAUNCH_FEE, Node, NodeId, PlanetId, Preset, bodyName, fmtCr, fuelHere, isMoon, nodeOf, siteOf } from './world.js';
import { HOP_FEE_SHARE, bestTransfer, searchTransfer, transferCost } from './physics.js';
import { S, Plan, Step } from './state.js';
import { connectionsFrom, route } from './graph.js';
import { feeBlocked, localActions } from './actions.js';

// Markers for manoeuvres: delivery targets, the way towards the cargo, posts with orders
export interface StepHint { node:NodeId; site:string|null; dv:number; name:string; n:number; final:boolean }
export function cargoHints(){
  const H:{step:StepHint[]; transfer:Partial<Record<PlanetId,string[]>>}={step:[], transfer:{}};
  const me=S.player.ship.near; if(!me) return H;
  const hereK=S.market.at(me);
  const byDest: Record<string, number> = {};
  S.player.ship.hold.forEach(o=>{ if(!hereK||hereK.id!==o.to) byDest[o.to]=(byDest[o.to]||0)+1; });
  Object.entries(byDest).forEach(([id,n])=>{
    if(!S.market.has(id) || !n) return;
    const dest=S.market.post(id), r=route(me,dest); if(!r.first) return;
    const name=dest.name;
    if(r.first.leg){ const names=H.transfer[r.first.leg[1]]??=[]; if(!names.includes(name)) names.push(name); }
    else H.step.push({node:r.first.to.node, site:r.first.to.site, dv:r.first.dv, name, n, final: dest.node===r.first.to.node && (!dest.site||dest.site===r.first.to.site)});
  });
  return H;
}

// Where and when a plan starts: the ship's place today, unless another start is given
export interface Start { node:NodeId; site:string|null; day:number }
const shipStart = ():Start|null => { const p=S.player.ship.near; return p ? {node:p.node, site:p.site, day:S.day} : null; };

// The other connection that joins the same two places, such as burning down into low orbit
// next to aerobraking; null where there is only one
export const alternative = (c:Connection):Connection|null => connectionsFrom(c.from).find(x=>x!==c && x.to===c.to) ?? null;

// ── Searching the way ─────────────────────────────────────────────────────────
// The cheapest way from start to target for a preset: delta-v plus the days, each worth the
// preset's day value. A transfer on the way leaves and flies as the table says is best from the
// day the ship gets to it.
interface RNode { n:Node; c:number; days:number }
interface PlanEdge { c:Connection; dv:number; days:number; dep:number|null; flight:number|null }

function search(target:Node, k:number, start:Start): Step[]|null{
  const first:RNode={n:nodeOf(start.node,start.site), c:0, days:0};
  const best=new Map<Node, RNode>([[first.n,first]]), prev=new Map<Node, {from:RNode; ed:PlanEdge}>(), done=new Set<Node>(), q=[first];
  let goal:RNode|null=null;
  for(let cur=popMin(q); cur; cur=popMin(q)){
    if(done.has(cur.n)) continue; done.add(cur.n);
    if(cur.n===target){ goal=cur; break; }
    const day=start.day+cur.days;
    for(const c of connectionsFrom(cur.n)){
      const ed:PlanEdge={c, dv:c.dv, days:c.days, dep:null, flight:null}, leg=c.leg;
      if(leg){ const t=searchTransfer(leg[0],leg[1],day,k); if(!t) continue; ed.dv=t.dv; ed.days=t.dep-day+t.days; ed.dep=t.dep; ed.flight=t.days; }
      const days=cur.days+ed.days, cost=cur.c+ed.dv+ed.days*k, old=best.get(c.to);
      if(!old || cost<old.c){ const nd:RNode={n:c.to, c:cost, days}; best.set(c.to,nd); prev.set(c.to,{from:cur,ed}); q.push(nd); }
    }
  }
  if(!goal) return null;
  const steps:Step[]=[];
  for(let p=prev.get(goal.n); p; p=prev.get(p.from.n)) steps.unshift(new Step(p.ed.c, p.ed.dep, p.ed.flight));
  return steps;
}

// ── Choosing the times ────────────────────────────────────────────────────────
// Goes through the steps in order and gives every transfer that is not pinned its departure day
// and flight time from the preset, counted from the day the ship gets there. A pinned transfer
// stays as chosen unless it would leave before the ship arrives: then it loses its pin. The
// messages say which ones did.
function choose(plan:Plan, start:Start, k:number): string[]{
  const msgs:string[]=[];
  let day=start.day;
  for(const st of plan.steps){
    const leg=st.along.leg;
    if(!leg){ day+=st.along.days; continue; }
    if(st.pinned && st.leaveOn!==null && st.flightDays!==null){
      if(st.leaveOn>=day-1e-6){ day=st.leaveOn+st.flightDays; continue; }
      st.pinned=false;
      msgs.push(`Your choice for the transfer to ${BODIES[leg[1]].name} no longer fits: the ship only gets there on ${dateStr(day)}. It has been planned afresh.`);
    }
    const t=bestTransfer(leg[0],leg[1],day,k); if(!t) continue;
    // an earlier choice that is still as good stays, so the plan does not flicker between equals
    if(st.leaveOn!==null && st.flightDays!==null && st.leaveOn>=day-1e-6){
      const old=transferCost(leg[0],leg[1],st.leaveOn,st.flightDays).total+k*(st.leaveOn-day+st.flightDays), now=t.dv+k*(t.dep-day+t.days);
      if(old<=now+Math.max(1,0.002*now)){ day=st.leaveOn+st.flightDays; continue; }
    }
    st.leaveOn=t.dep; st.flightDays=t.days; day=t.dep+t.days;
  }
  return msgs;
}

// The day values a preset tries in turn: its own first, then lower ones down to economical, as
// long as the plan needs more delta-v than the ship has
const ladder = (p:Preset) => DAY_VALUE_STEPS.filter(k=>k<=DAY_VALUE[p]);
const needs = (plan:Plan, st:Start) => schedule(plan, st)?.dv ?? Infinity;
const budgetOf = (st:Start) => { const p=S.player.ship.near; return p && p.node===st.node && p.site===st.site ? S.player.ship.dvAvail+0.5 : Infinity; };

// A first draft: the way and the times as the preset has them, nothing pinned
export function draftPlan(target:Node, preset:Preset, start?:Start|null): Plan|null{
  const st=start||shipStart(); if(!st) return null;
  let plan:Plan|null=null;
  for(const k of ladder(preset)){
    const steps=search(target, k, st); if(!steps) return plan;
    plan=new Plan(preset, steps); choose(plan, st, k);
    if(needs(plan,st)<=budgetOf(st)) break;
  }
  return plan;
}

// Planning again, after the player changed a step or the ship flew one. Steps the ship has
// flown are dropped, so the plan starts where the ship is. Up to the last pinned step the way
// stays as it is; after it, the way is searched afresh from where and when the ship will then be.
// Returns what the player should be told.
export function replan(plan:Plan, target:Node, start?:Start|null): string[]{
  const st=start||shipStart(); if(!st) return [];
  const here=nodeOf(st.node,st.site);
  if(plan.steps[0]?.to===here && plan.steps[0].from!==here) plan.steps.shift();
  const fresh=plan.steps.length>0 && plan.steps[0]?.from!==here;     // not where the plan thinks: start afresh
  let last=-1; if(!fresh) plan.steps.forEach((s,i)=>{ if(s.pinned) last=i; });
  const keep=plan.steps.slice(0,last+1);
  let tried:{steps:Step[]; msgs:string[]}|null=null;
  for(const k of ladder(plan.preset)){
    // on copies, so a step that stays is still the same object afterwards
    const head=new Plan(plan.preset, keep.map(s=>new Step(s.along,s.leaveOn,s.flightDays,s.pinned))), msgs=choose(head, st, k);
    const end=keep.at(-1)?.to ?? here;
    let day=st.day; head.steps.forEach(s=>{ day = s.along.leg ? (s.leaveOn??day)+(s.flightDays??s.along.days) : day+s.along.days; });
    const rest = end===target ? [] : (search(target, k, {node:end.node, site:end.site, day}) ?? []);
    const trial=new Plan(plan.preset, [...head.steps, ...rest]); msgs.push(...choose(trial, st, k));
    tried={steps:trial.steps, msgs};
    if(needs(trial,st)<=budgetOf(st)) break;
  }
  if(!tried) return [];
  const steps=tried.steps.map((s,i)=>{ const o=keep[i]; if(!o) return s; o.along=s.along; o.leaveOn=s.leaveOn; o.flightDays=s.flightDays; o.pinned=s.pinned; return o; });
  plan.steps.splice(0, plan.steps.length, ...steps);
  return tried.msgs;
}

// The player's changes to a step. Each pins it; the caller plans again afterwards.
export function pinTransfer(plan:Plan, i:number, dep:number, days:number){
  const s=plan.steps[i]; if(!s || !s.along.leg) return;
  s.leaveOn=dep; s.flightDays=days; s.pinned=true;
}
export function switchStep(plan:Plan, i:number){
  const s=plan.steps[i], alt=s ? alternative(s.along) : null; if(!s || !alt) return;
  s.along=alt; s.pinned=true;
}
export function unpin(plan:Plan, i:number){ const s=plan.steps[i]; if(s) s.pinned=false; }

// ── Laying the plan out by the date ───────────────────────────────────────────
// A step as it falls: when the ship gets to it, when it leaves and arrives, what it burns (the
// exact cost for a transfer) and the launch fee
export interface Leg {
  step:Step; kind:'transfer'|'move'; label:string;
  ready:number; dep:number; arr:number; wait:number;
  dv:number; days:number; fee:number;
  alt:Connection|null;
}
export interface Schedule { plan:Plan; legs:Leg[]; dv:number; days:number; arrive:number; fee:number; start:Start }

export function schedule(plan:Plan, start?:Start|null): Schedule|null{
  const st=start||shipStart(); if(!st) return null;
  const legs:Leg[]=[], ship=S.player.ship, mass=ship.def.dry+ship.cargoMass+ship.fuel;
  let day=st.day, from=nodeOf(st.node,st.site), dv=0, fee=0;
  for(const s of plan.steps){
    const c=s.along, leg=c.leg, label=stepLabel(from,c), alt=alternative(c);
    if(leg){
      const dep=Math.max(day, s.leaveOn??day), days=s.flightDays??c.days, cost=transferCost(leg[0],leg[1],dep,days).total;
      legs.push({step:s, kind:'transfer', label, ready:day, dep, arr:dep+days, wait:dep-day, dv:cost, days:dep+days-day, fee:0, alt});
      day=dep+days; dv+=cost;
    } else {
      const f=c.launchFee ? Math.round(LAUNCH_FEE*mass*(c.hop?HOP_FEE_SHARE:1)) : 0;
      legs.push({step:s, kind:'move', label, ready:day, dep:day, arr:day+c.days, wait:0, dv:c.dv, days:c.days, fee:f, alt});
      day+=c.days; dv+=c.dv; fee+=f;
    }
    from=c.to;
  }
  return {plan, legs, dv, days:day-st.day, arrive:day, fee, start:st};
}

// What is left of a plan: under way, from where and when the flight in progress arrives
export function remaining(plan:Plan): Schedule|null{
  const tr=S.player.ship.transit; if(!tr) return schedule(plan);
  const rest=plan.steps.slice(plan.steps.findIndex(s=>s.along===tr.along)+1);
  return schedule(new Plan(plan.preset, rest), {node:tr.along.to.node, site:tr.along.to.site, day:tr.arr});
}

// A first draft, laid out: what the order board, the depot search and the bots ask for
export function planRoute(target:Node, preset:Preset, start?:Start|null): Schedule|null{
  const plan=draftPlan(target, preset, start); return plan ? schedule(plan, start) : null;
}

const toName = (p:PlanetId) => BODIES[p].name;

function stepLabel(from:Node, e:Connection){
  const leg=e.leg; if(leg) return `Transfer to ${toName(leg[1])}`;
  const fk=from.body, fl=from.level, tk=e.to.body, tl=e.to.level;
  if(tl==='surface'){ const st=siteOf(tk,e.to.site); if(fl==='surface') return `${e.launchFee?'Suborbital flight':'Hop'} to ${st?st.name:bodyName(tk)}`; return `Land at ${st?st.name:bodyName(tk)}`; }
  if(fl==='surface') return e.launchFee?'Ride a launcher to orbit':`Ascend to orbit${isMoon(fk)?' around '+BODIES[fk].name:''}`;
  if(fl==='lowOrbit' && tl==='highOrbit') return 'Up to high orbit';
  if(fl==='highOrbit' && tk===fk) return e.dv<100?'Aerobrake into low orbit':'Down to low orbit';
  if(fl==='highOrbit' && isMoon(tk)) return tk==='moon'?'To the Moon':`To ${BODIES[tk].name}`;
  if(isMoon(fk) && tl==='highOrbit') return `Back to high orbit of ${bodyName(tk)}`;
  return e.to.label;
}

export function nearestFuel(start:Start):{dv:number; spot:Node|null}{
  if(fuelHere(start.node,start.site)) return {dv:0, spot:null};
  let best:{dv:number; spot:Node|null}={dv:Infinity, spot:null};
  DEPOT_LIST.forEach(d=>{ const pl=planRoute(d.at,'economical',start); if(pl && pl.dv<best.dv) best={dv:pl.dv, spot:d.at}; });
  return best;
}

// Why a step cannot be flown right now
export function stepBlocker(l:Leg){
  const p=S.player.ship.place, dv=S.player.ship.dvAvail, leg=l.step.along.leg;
  if(leg){ if(!p || p!==l.step.from) return 'Transfers start from high orbit.';
    if(l.dep>S.day+0.01) return `Waiting until ${dateStr(l.dep)} to leave.`;
    return `The transfer costs ${km(l.dv)} km/s, you have ${km(dv)}.`; }
  const a=localActions().find(a2=>a2.via===l.step.along);
  if(!a) return 'That manoeuvre is not possible from here.';
  if(a.dv>dv+0.5) return `It needs ${km(a.dv)} km/s, you have ${km(dv)}.`;
  if(a.fee && feeBlocked(a)) return `The launch fee of ${fmtCr(a.fee)} would bankrupt you.`;
  return 'Unknown reason.';
}
