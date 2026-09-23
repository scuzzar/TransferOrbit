// The game state S and the queries on it. Never writes anything by itself.

import { B, FUEL_PRICE, G0, GOODS, GoodId, POSTS, LVL, M, NodeId, PlanetId, PostId, SHIPS, ShipId, bodyName, isMoon, Post, siteOf, splitNode } from './world.js';

export type Target = { node:NodeId; site?:string|null };
export type RouteMode = 'eco'|'now';
export type OrderState = 'open'|'aboard';
export interface Order {
  id:number; good:GoodId; n:number; from:PostId; to:PostId;
  reward:number; dv:number; days:number; deadline:number; created:number; expires:number;
  state:OrderState; fwdOrder:boolean; transship?:boolean; bulk?:boolean;
}
// Amounts per post and good. stock and demand have a row for every post, the rest only
// where something is stored.
export type Amounts = Partial<Record<GoodId,number>>;
export interface Eco {
  stock:Record<PostId,Amounts>;
  fwd:Partial<Record<PostId,Amounts>>;
  demand:Record<PostId,Amounts>;
  orders:Order[];
  nextId:number;
  day:number;
  bulk?:Partial<Record<PostId,Amounts>>;
  bulkN?:Partial<Record<PostId,Amounts>>;
}

// Milestones of the run; refuel:<body>@<site> marks each depot used once
export interface Flags {
  delivered:number; marsLanded?:boolean; marsReturn?:boolean; hubDelivery?:boolean; bought?:boolean;
  [refuel:`refuel:${string}`]:boolean;
}

// The simulation itself: everything a save file needs to reproduce the game exactly.
export interface DomainState {
  day:number;
  node:NodeId|null;
  site:string|null;
  ship:ShipId;
  fuel:number;
  used:number;
  credits:number;
  visited:Set<string>;
  flags:Flags;
  target:PlanetId|null;     // the planet the transfer window on the solar system map points at
  over:boolean;
  eco:Eco;
  autoFill:boolean;
}

// Whether a manoeuvre is under way, along which path, and where the autopilot is headed.
// Session-only: save()/saveSlot() refuse while busy is true, so there is never a transit
// to persist, and a loaded game starts with the autopilot off.
export interface ActionState {
  busy:boolean;
  transit:{ a:PlanetId; b:PlanetId; dep:number; arr:number; th0:number; th1:number }|null;
  auto:{ target:Target; mode:RouteMode; start:string|null }|null;
}

// The game: the simulation and what it is doing right now. What the screen shows lives
// in ui/state.ts, the map animation's caches in map/geometry.ts.
export interface GameState {
  domain:DomainState;
  action:ActionState;
}

export let S:GameState;

export function setState(next:GameState){ S=next; }

export const eng = () => SHIPS[S.domain.ship];

export const cargoOrders = ():Order[] => S.domain.eco.orders.filter(o=>o.state==='aboard');

export const cargoMass = () => cargoOrders().reduce((s,o)=>s+o.n*GOODS[o.good].m,0);

export const slotsUsed = () => cargoOrders().reduce((s,o)=>s+o.n,0);

export const dvWith = (f:number, cm:number) => eng().isp*G0*Math.log((eng().dry+cm+f)/(eng().dry+cm));

export const dvOf = (f:number) => dvWith(f,cargoMass());

export const dvAvail = () => dvOf(S.domain.fuel);

export function burn(dv:number){
  const cm=cargoMass(), m=(eng().dry+cm+S.domain.fuel)/Math.exp(dv/(eng().isp*G0));
  S.domain.fuel=Math.max(0,m-eng().dry-cm); S.domain.used+=dv;
}

export const locOf = (node:NodeId, site:string|null) => node+(site?'@'+site:'');

export const locKey = ():string|null => S.domain.node ? locOf(S.domain.node,S.domain.site) : null;

// The ship's place as a start for route(); null while under way
export const shipPlace = () => { const n=S.domain.node; return n ? {id:'@'+locOf(n,S.domain.site), node:n, site:S.domain.site} : null; };

export const postAt = ():Post|null => S.domain.node ? POSTS.find(k=>k.node===S.domain.node && (!k.site || k.site===S.domain.site)) || null : null;

export const fuelPrice = ():number|undefined => { const n=S.domain.node; return n ? (FUEL_PRICE[locOf(n,S.domain.site)] ?? FUEL_PRICE[n]) : undefined; };

export const here = () => S.domain.node ? splitNode(S.domain.node) : [null,null] as const;

// The planet the ship is at (a moon counts as its planet); null while under way
export const homePlanet = ():PlanetId|null => { const [k]=here(); return !k ? null : isMoon(k) ? M[k].parent : k; };

export const nodeName = (node:NodeId) => { const [k,l]=splitNode(node);
  if(l==='surf' && S.domain.site){ const st=siteOf(k,S.domain.site); if(st) return `${st.name} (${bodyName(k)})`; }
  if(isMoon(k)) return l==='surf' ? (M[k].surfName||`the surface of ${M[k].name}`) : (M[k].orbitName||`orbit around ${M[k].name}`);
  return `${LVL[l]} of ${B[k].name}`; };

export const atTarget = (t:Target) => S.domain.node===t.node && (!t.site || S.domain.site===t.site);

export function targetName(t:Target){
  const [b,l]=splitNode(t.node);
  if(t.site){ const st=siteOf(b,t.site); return `${st?st.name:''} (${bodyName(b)})`; }
  if(l==='capt') return `High orbit of ${bodyName(b)}`;
  return isMoon(b) ? (M[b].orbitName||`orbit around ${M[b].name}`) : `Low orbit of ${B[b].name}`;
}
