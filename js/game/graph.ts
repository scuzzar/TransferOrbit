// The connections between the places, and the route graph behind pricing: idealised cost
// between two places.

import { B, BodyId, Connection, GOODS, GoodId, RATE_MASS, RATE_DAY, RATE_MASS_DAY, LAUNCH_FEE, M, Node, NodeId, PlanetId, SHIP_MASS_SHARE, PLANETS, SITES, START_DAY, V_EXHAUST, hasAtm, isMoon, moonsOf, nodeOf, rotPenalty, siteOf } from './world.js';
import { popMin } from '../basics.js';
import { captDv, hopCost, transfer } from './physics.js';

const idealCache: Record<string, {total:number; tof:number}> = {};

export function idealTransfer(a: PlanetId, b: PlanetId){
  const key=a+'>'+b; if(idealCache[key]) return idealCache[key];
  const t0=transfer(a,b,START_DAY), t=transfer(a,b,START_DAY+t0.wait);
  return idealCache[key]={total:t.total, tof:t.tof};
}

// The connections that lead out of a node, built once per node. The order matters: it breaks
// ties in the route searches.
const OUT = new Map<Node, Connection[]>();
export function connectionsFrom(from:Node): Connection[]{
  const hit=OUT.get(from); if(hit) return hit;
  const k=from.body, l=from.level, site=from.site, E:Connection[]=[];
  const e=(n:NodeId, s:string|null, dv:number, days:number, launch=false, window=false)=>E.push(new Connection(from, nodeOf(n,s), dv, days, launch, window));
  const lat=(body:BodyId, s:string|null)=>{const st=siteOf(body,s); return st?st.lat:0;};
  const lands=(body:BodyId, down:number)=>(SITES[body]||[]).forEach(st=>e(`${body}.surf`,st.id,down+(hasAtm(body)?0:rotPenalty(body,st.lat)),0.2));
  if(l==='surface' && site) (SITES[k]||[]).forEach(st=>{ if(st.id===site) return; const h=hopCost(k,site,st.id); e(`${k}.surf`,st.id,h.dv,h.days,h.launcher); });
  if(isMoon(k)){
    const m=M[k];
    if(l==='surface') e(`${k}.orbit`,null,m.up+rotPenalty(k,lat(k,site)),0.2);
    else { lands(k,m.down); e(`${m.parent}.capt`,null,m.xfer,m.days); }
  } else {
    const b=B[k];
    const sf=b.surf;
    if(l==='surface' && sf){ const pen=rotPenalty(k,lat(k,site)); e(`${k}.orbit`,null,sf.launcher?pen:sf.up+pen,sf.launcher?1:0.2,!!sf.launcher); }
    if(l==='lowOrbit'){ if(b.surf) lands(k,b.surf.down); e(`${k}.capt`,null,captDv(k),1); }
    if(l==='highOrbit'){
      e(`${k}.orbit`,null,captDv(k),1); if(b.atm) e(`${k}.orbit`,null,60,40);
      moonsOf(k).forEach(m=>e(`${m}.orbit`,null,M[m].xfer,M[m].days));
      PLANETS.filter(p=>p!==k).forEach(p=>{const t=idealTransfer(k,p); e(`${p}.capt`,null,t.total,t.tof,false,true);});
    }
  }
  OUT.set(from,E);
  return E;
}

// launch: the route rides a launcher up from a surface; first: its first connection
export interface RouteResult { dv:number; days:number; legs:[PlanetId,PlanetId][]; launch:boolean; first:Connection|null }
const routeCache: Record<string, RouteResult> = {};
// Anything route() can start or end at: a trading post, or the ship's node ('@'+key)
export interface RoutePoint { id:string; node:NodeId; site:string|null }

export function route(from: RoutePoint, to: RoutePoint): RouteResult{
  const key=from.id+'>'+to.id, hit=routeCache[key]; if(hit) return hit;
  const start=nodeOf(from.node, from.site), goalNode=nodeOf(to.node, to.site);
  const dist=new Map<Node, {c:number; dv:number; days:number}>(), prev=new Map<Node, {n:Node; ed:Connection}>(), done=new Set<Node>();
  const q=[{n:start,c:0}]; dist.set(start,{c:0,dv:0,days:0});
  let goal:Node|null=null;
  for(let cur=popMin(q); cur; cur=popMin(q)){
    const d=dist.get(cur.n);
    if(done.has(cur.n) || !d) continue; done.add(cur.n);
    if(cur.n===goalNode){ goal=cur.n; break; }
    for(const ed of connectionsFrom(cur.n)){
      const c=d.dv+ed.dv + (d.days+ed.days)*0.01, old=dist.get(ed.to);
      if(!old || c<old.c){ dist.set(ed.to,{c,dv:d.dv+ed.dv,days:d.days+ed.days}); prev.set(ed.to,{n:cur.n,ed}); q.push({n:ed.to,c}); }
    }
  }
  const end=goal ? dist.get(goal) : undefined;
  if(!goal || !end) return routeCache[key]={dv:Infinity,days:0,legs:[],launch:false,first:null};
  const legs: [PlanetId,PlanetId][] = []; let launch=false, first: Connection|null = null;
  for(let p=prev.get(goal); p; p=prev.get(p.n)){ const {ed}=p; if(ed.leg) legs.unshift(ed.leg); if(ed.launchFee && !ed.hop) launch=true; first=ed; }
  return routeCache[key]={dv:end.dv, days:end.days, legs, launch, first};
}

export function rewardFor(r: {dv:number; days:number; launch:boolean}, good: GoodId, n: number): number{
  const G=GOODS[good], mass=SHIP_MASS_SHARE+n*G.mass;
  let R = RATE_MASS*mass*(Math.exp(r.dv/V_EXHAUST)-1) + RATE_DAY*r.days + RATE_MASS_DAY*mass*r.days + 0.1*n*G.value;
  if(r.launch) R += LAUNCH_FEE*(mass+20); // share of the Earth launch fee
  return Math.round(R*rewardLuck()/10)*10;
}

// Luck factor: usually 0.9-1.2; rarely (8%) 1.4-1.9, with high values rarer than low ones
const LUCK = {p:0.08, min:1.4, max:1.9} as const;

const rewardLuck = () => Math.random()<LUCK.p ? LUCK.min+(LUCK.max-LUCK.min)*Math.random()**2 : 0.9+Math.random()*0.3;
