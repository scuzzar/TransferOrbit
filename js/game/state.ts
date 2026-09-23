// The game state S and the queries on it. Never writes anything by itself.

import { B, FUEL_PRICE, G0, GOODS, GoodId, POSTS, LVL, M, NodeId, PlanetId, PostId, SHIPS, ShipId, bodyName, isMoon, Post, siteOf, splitNode } from './world.js';

export type Target = { node:NodeId; site?:string|null };
export type RouteMode = 'eco'|'now';
export type OrderState = 'open'|'aboard';
export interface Order {
  id:number; good:GoodId; containers:number; from:PostId; to:PostId;
  reward:number; dv:number; days:number; deadline:number; created:number; expires:number;
  state:OrderState;
  fromHubStore:boolean;   // made from a hub's store, a regional follow-up of a transhipment
  toHub?:boolean;         // ends at a hub, whose store takes the goods, instead of at a customer
  isBulk?:boolean;        // more containers than the Cog carries
}
// Amounts per post and good. produced and need have a row for every post, the rest only
// where something is stored.
export type Amounts = Partial<Record<GoodId,number>>;
export interface Market {
  produced:Record<PostId,Amounts>;              // made by a post and not yet handed out as an order
  need:Record<PostId,Amounts>;                  // how badly a post wants a good, 0 to 3: where orders go
  hubStore:Partial<Record<PostId,Amounts>>;     // goods delivered to a hub, waiting to be passed on in the region
  bulkStore?:Partial<Record<PostId,Amounts>>;   // fills slowly beside produced; a full lot becomes a bulk order
  bulkLot?:Partial<Record<PostId,Amounts>>;     // the lot size the next bulk order waits for, 7 to 18
  orders:Order[];
  nextId:number;
  simulatedTo:number;                           // the last day the market has been run up to
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
  dvUsed:number;            // delta-v burned so far, m/s
  credits:number;
  visited:Set<string>;
  flags:Flags;
  windowPlanet:PlanetId|null;   // the planet the transfer window on the solar system map points at
  bankrupt:boolean;
  market:Market;
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

export const cargoOrders = ():Order[] => S.domain.market.orders.filter(o=>o.state==='aboard');

export const cargoMass = () => cargoOrders().reduce((s,o)=>s+o.containers*GOODS[o.good].m,0);

export const slotsUsed = () => cargoOrders().reduce((s,o)=>s+o.containers,0);

export const dvWith = (f:number, cm:number) => eng().isp*G0*Math.log((eng().dry+cm+f)/(eng().dry+cm));

export const dvOf = (f:number) => dvWith(f,cargoMass());

export const dvAvail = () => dvOf(S.domain.fuel);

export function burn(dv:number){
  const cm=cargoMass(), m=(eng().dry+cm+S.domain.fuel)/Math.exp(dv/(eng().isp*G0));
  S.domain.fuel=Math.max(0,m-eng().dry-cm); S.domain.dvUsed+=dv;
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
