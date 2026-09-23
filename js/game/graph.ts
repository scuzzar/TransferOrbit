// The route graph behind pricing: idealised cost between two places.

import { B, BodyId, GOODS, GoodId, RATE_MASS, RATE_DAY, RATE_MASS_DAY, LAUNCH_FEE, M, NodeId, PlanetId, SHIP_MASS_SHARE, PLANETS, SITES, START_DAY, V_EXHAUST, hasAtm, isMoon, moonsOf, rotPenalty, siteOf, splitNode } from './world.js';
import { popMin } from '../basics.js';
import { captDv, hopCost, transfer } from './physics.js';
import { S, Order } from './state.js';

const idealCache: Record<string, {total:number; tof:number}> = {};

export function idealTransfer(a: PlanetId, b: PlanetId){
  const key=a+'>'+b; if(idealCache[key]) return idealCache[key];
  const t0=transfer(a,b,START_DAY), t=transfer(a,b,START_DAY+t0.wait);
  return idealCache[key]={total:t.total, tof:t.tof};
}

// hop: between two sites of one body; launch: on a launcher (fee); leg: an interplanetary transfer
export interface Edge { node:NodeId; site:string|null; dv:number; days:number; hop?:boolean; launch?:boolean; leg?:[PlanetId,PlanetId] }

export function edgesFrom(node: NodeId, site: string|null): Edge[]{
  const [k,l]=splitNode(node); const E: Edge[]=[];
  const e=(n:NodeId, s:string|null, dv:number, days:number, x:Pick<Edge,'hop'|'launch'|'leg'>={})=>E.push({node:n,site:s||null,dv,days,...x});
  const lat=(body:BodyId, s:string|null)=>{const st=siteOf(body,s); return st?st.lat:0;};
  const lands=(body:BodyId, down:number)=>(SITES[body]||[]).forEach(st=>e(`${body}.surf`,st.id,down+(hasAtm(body)?0:rotPenalty(body,st.lat)),0.2));
  if(l==='surf' && site) (SITES[k]||[]).forEach(st=>{ if(st.id===site) return; const h=hopCost(k,site,st.id); e(`${k}.surf`,st.id,h.dv,h.days,{hop:true,launch:h.launcher}); });
  if(isMoon(k)){
    const m=M[k];
    if(l==='surf') e(`${k}.orbit`,null,m.up+rotPenalty(k,lat(k,site)),0.2);
    else { lands(k,m.down); e(`${m.parent}.capt`,null,m.xfer,m.days); }
  } else {
    const b=B[k];
    const sf=b.surf;
    if(l==='surf' && sf){ const pen=rotPenalty(k,lat(k,site)); e(`${k}.orbit`,null,sf.launcher?pen:sf.up+pen,sf.launcher?1:0.2,{launch:!!sf.launcher}); }
    if(l==='orbit'){ if(b.surf) lands(k,b.surf.down); e(`${k}.capt`,null,captDv(k),1); }
    if(l==='capt'){
      e(`${k}.orbit`,null,captDv(k),1); if(b.atm) e(`${k}.orbit`,null,60,40);
      moonsOf(k).forEach(m=>e(`${m}.orbit`,null,M[m].xfer,M[m].days));
      PLANETS.filter(p=>p!==k).forEach(p=>{const t=idealTransfer(k,p); e(`${p}.capt`,null,t.total,t.tof,{leg:[k,p]});});
    }
  }
  return E;
}

export interface RouteResult { dv:number; days:number; legs:[PlanetId,PlanetId][]; launch:boolean; first:Edge|null }
const routeCache: Record<string, RouteResult> = {};
interface Place { id:string; node:NodeId; site:string|null }

export function route(from: Place, to: Place): RouteResult{
  const key=from.id+'>'+to.id, hit=routeCache[key]; if(hit) return hit;
  const startSite = from.site || (from.node==='earth.surf' ? 'kourou' : null);
  const sk=(n:NodeId, s:string|null)=>n+'|'+(s||'');
  const dist=new Map<string, {c:number; dv:number; days:number}>(), prev=new Map<string, {k:string; ed:Edge}>(), done=new Set<string>();
  const q=[{n:from.node,s:startSite,c:0}]; dist.set(sk(from.node,startSite),{c:0,dv:0,days:0});
  let goal:string|null=null;
  for(let cur=popMin(q); cur; cur=popMin(q)){
    const ck=sk(cur.n,cur.s), d=dist.get(ck);
    if(done.has(ck) || !d) continue; done.add(ck);
    if(cur.n===to.node && (!to.site || cur.s===to.site)){ goal=ck; break; }
    for(const ed of edgesFrom(cur.n,cur.s)){
      const nk=sk(ed.node,ed.site), c=d.dv+ed.dv + (d.days+ed.days)*0.01, old=dist.get(nk);
      if(!old || c<old.c){ dist.set(nk,{c,dv:d.dv+ed.dv,days:d.days+ed.days}); prev.set(nk,{k:ck,ed}); q.push({n:ed.node,s:ed.site,c}); }
    }
  }
  const end=goal ? dist.get(goal) : undefined;
  if(!goal || !end) return routeCache[key]={dv:Infinity,days:0,legs:[],launch:false,first:null};
  const legs: [PlanetId,PlanetId][] = []; let launch=false, first: Edge|null = null;
  for(let p=prev.get(goal); p; p=prev.get(p.k)){ const {ed}=p; if(ed.leg) legs.unshift(ed.leg); if(ed.launch && !ed.hop) launch=true; first=ed; }
  return routeCache[key]={dv:end.dv, days:end.days, legs, launch, first};
}

export function rewardFor(r: {dv:number; days:number; launch:boolean}, good: GoodId, n: number): number{
  const G=GOODS[good], mass=SHIP_MASS_SHARE+n*G.m;
  let R = RATE_MASS*mass*(Math.exp(r.dv/V_EXHAUST)-1) + RATE_DAY*r.days + RATE_MASS_DAY*mass*r.days + 0.1*n*G.w;
  if(r.launch) R += LAUNCH_FEE*(mass+20); // share of the Earth launch fee
  return Math.round(R*rewardLuck()/10)*10;
}

// Luck factor: usually 0.9-1.2; rarely (8%) 1.4-1.9, with high values rarer than low ones
const LUCK = {p:0.08, min:1.4, max:1.9} as const;

const rewardLuck = () => Math.random()<LUCK.p ? LUCK.min+(LUCK.max-LUCK.min)*Math.random()**2 : 0.9+Math.random()*0.3;

export const lateFactor = (o: Pick<Order,'deadline'>, day: number): number => day<=o.deadline ? 1 : Math.max(0.25, 1-0.02*(day-o.deadline));

export const payout = (o: Pick<Order,'deadline'|'reward'>): number => Math.round(o.reward*lateFactor(o,S.domain.day));
