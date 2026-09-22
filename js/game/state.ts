// The game state S and the queries on it. Never writes anything by itself.

import { B, FUEL_PRICE, G0, GOODS, POSTS, LVL, M, SHIPS, SITES, bodyName, Post, siteOf } from './world.js';

export type Target = { node:string; site?:string|null };
export type Pick = { type:'planet'; planet:string } | { type:'body'; body:string } | { type:'node'; node:string; site?:string|null };
export type ViewLevel = { level:'sol' } | { level:'sys'; planet:string } | { level:'body'; planet:string; body:string };
export type OrderState = 'open'|'aboard';
export interface Order {
  id:number; good:string; n:number; from:string; to:string;
  reward:number; dv:number; days:number; deadline:number; created:number; expires:number;
  state:OrderState; fwdOrder:boolean; transship?:boolean; bulk?:boolean;
}
export interface Eco {
  stock:Record<string,Record<string,number>>;
  fwd:Record<string,Record<string,number>>;
  demand:Record<string,Record<string,number>>;
  orders:Order[];
  nextId:number;
  day:number;
  bulk?:Record<string,Record<string,number>>;
  bulkN?:Record<string,Record<string,number>>;
}

// Milestones of the run; refuel:<body>@<site> marks each depot used once
export interface Flags {
  delivered:number; marsLanded?:boolean; marsReturn?:boolean; hubDelivery?:boolean; bought?:boolean;
  [refuel:`refuel:${string}`]:boolean;
}

// The simulation itself: everything a save file needs to reproduce the game exactly.
export interface DomainState {
  day:number;
  node:string|null;
  site:string|null;
  ship:string;
  fuel:number;
  used:number;
  credits:number;
  visited:Set<string>;
  flags:Flags;
  target:string|null;       // the planet the transfer window on the solar system map points at
  over:boolean;
  eco:Eco;
  autoFill:boolean;
}

// Whether a manoeuvre is under way and along which path. Session-only: save()/saveSlot()
// refuse while busy is true, so there is never a transit to persist.
export interface ActionState {
  busy:boolean;
  transit:{ a:string; b:string; dep:number; arr:number; th0:number; th1:number }|null;
}

// What the screen is showing: open panel, selection, dialogs, the toast message.
export interface UIState {
  view:string; sel:Set<number>; tank:number|null; pick:Pick|null;
  route:{ target:Target; mode:string; strand?:boolean }|null;
  auto:{ target:Target; mode:string; start:string|null }|null;
  mapView:ViewLevel|null; mapKey:string|null; rmsg:boolean; back:string|null;
  msg:string|null;
}

// The shapes the map animation works with. They live here because RenderState holds
// them; map/geometry.ts builds them and re-exports the types.
export type Vec3 = [number,number,number];
// An orbital plane: inclination i and ascending node Om, both in degrees
export interface Plane { i:number; Om:number }
// The ship's orbit around a body; u is its position along the orbit in radians
export interface Orbit extends Plane { body:string; u:number }
export interface PathAt { p:Vec3; burn?:'pro'|'retro'|null; glow?:boolean; att?:string }
// Path of a manoeuvre in the body frame, t runs from 0 to 1
export interface BodyPath { b:string; finalOrb:Orbit|null; at:(t:number)=>PathAt; fade?:boolean }
export interface SysState { p:string; capU:number; lowU:number; moonU:number }
// Plan of a manoeuvre in the system view (angles only, independent of scale)
export type SysPlan =
  | { kind:'toMoon'; m:string; p0:number; aArr:number; final:{moonU:number} }
  | { kind:'fromMoon'; m:string; m0:number; aDep:number; final:{capU:number} }
  | { kind:'raise'; u0:number; final:{capU:number} }
  | { kind:'lower'; u0:number; aero:boolean; th:number; final:{lowU:number} };
// A manoeuvre: from where to where over which days, plus the pictures it is drawn with
export interface MoveSpec { from:Target; to:Target; d0:number; d1:number; aero:boolean; orb:Orbit|null }
export interface Move extends MoveSpec { path:BodyPath|null; sys:SysPlan|null }

// Per-frame interpolation caches the map animation reads and writes. Rebuilt from
// DomainState on demand, so there is nothing here worth saving.
export interface RenderState {
  move:Move|null;
  orb:Orbit|null;
  sys:SysState|null;
  anim:{ d0:number; d1:number }|null;
}

export interface GameState {
  domain:DomainState;
  action:ActionState;
  ui:UIState;
  render:RenderState;
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

export const locKey = ():string|null => S.domain.node ? S.domain.node+(S.domain.site?'@'+S.domain.site:'') : null;

export const postAt = ():Post|null => S.domain.node ? POSTS.find(k=>k.node===S.domain.node && (!k.site || k.site===S.domain.site)) || null : null;

export const fuelPrice = ():number|undefined => S.domain.node ? (FUEL_PRICE[locKey()!] ?? FUEL_PRICE[S.domain.node!]) : undefined;

export const here = ():[string|null,string|null] => S.domain.node ? (S.domain.node.split('.') as [string,string]) : [null,null];

export const homePlanet = ():string => { const [k]=here(); return (k && M[k]) ? M[k].parent : (k||''); };

export const nodeName = (node:string) => { const [k,l]=node.split('.');
  if(l==='surf' && S.domain.site){ const st=siteOf(k,S.domain.site); if(st) return `${st.name} (${M[k]?M[k].name:B[k].name})`; }
  if(M[k]) return l==='surf' ? (M[k].surfName||`the surface of ${M[k].name}`) : (M[k].orbitName||`orbit around ${M[k].name}`);
  return `${(LVL as Record<string,string>)[l]} of ${B[k].name}`; };

export const pickTarget = (p:Pick):Target => p.type==='planet' ? {node:p.planet+'.capt'} : p.type==='body' ? {node:p.body+(B[p.body]&&!SITES[p.body]?'.capt':'.orbit')} : {node:p.node, site:p.site||null};

export const atTarget = (t:Target) => S.domain.node===t.node && (!t.site || S.domain.site===t.site);

export function targetName(t:Target){
  const [b,l]=t.node.split('.');
  if(t.site){ const st=siteOf(b,t.site); return `${st?st.name:''} (${bodyName(b)})`; }
  if(l==='capt') return `High orbit of ${M[b]?M[b].name:B[b].name}`;
  return M[b] ? (M[b].orbitName||`orbit around ${M[b].name}`) : `Low orbit of ${B[b].name}`;
}
