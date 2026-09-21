// The game state S and the queries on it. Never writes anything by itself.

import { B, FUEL_PRICE, G0, GOODS, POSTS, LVL, M, SHIPS, SITES, bodyName, Post, siteOf } from './world.js';

export type Target = { node:string; site?:string|null };
export type Pick = { type:'planet'|'body'|'node'; planet?:string; body?:string; node?:string; site?:string|null };
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
export interface GameState {
  day:number;
  node:string|null;
  site:string|null;
  ship:string;
  fuel:number;
  used:number;
  credits:number;
  visited:Set<string>;
  flags:Record<string,any>;
  target:string|Target|null;
  busy:boolean;
  transit:{ a:string; b:string; dep:number; arr:number; th0:number; th1:number }|null;
  over:boolean;
  ui:{ view:string; sel:Set<number>; tank:number|null; pick:Pick|null; route:{ target:Target; mode:string }|null; auto:{ target:Target; mode:string; start:string|null }|null; mapView:ViewLevel|null; mapKey:string|null; rmsg:boolean; back:string|null };
  msg:string|null;
  eco:Eco;
  move:{ body:string; u:number; [k:string]:any }|null;
  orb:{ body:string; u:number; [k:string]:any }|null;
  sys:{ p:string; capU:number; lowU:number; moonU:number }|null;
  anim:{ d0:number; d1:number }|null;
  autoFill:boolean;
  [k:string]:any;
}

export let S:GameState;

export function setState(next:GameState){ S=next; }

export const eng = () => SHIPS[S.ship];

export const cargoOrders = ():Order[] => S.eco.orders.filter(o=>o.state==='aboard');

export const cargoMass = () => cargoOrders().reduce((s,o)=>s+o.n*GOODS[o.good].m,0);

export const slotsUsed = () => cargoOrders().reduce((s,o)=>s+o.n,0);

export const dvWith = (f:number, cm:number) => eng().isp*G0*Math.log((eng().dry+cm+f)/(eng().dry+cm));

export const dvOf = (f:number) => dvWith(f,cargoMass());

export const dvAvail = () => dvOf(S.fuel);

export function burn(dv:number){
  const cm=cargoMass(), m=(eng().dry+cm+S.fuel)/Math.exp(dv/(eng().isp*G0));
  S.fuel=Math.max(0,m-eng().dry-cm); S.used+=dv;
}

export const locKey = ():string|null => S.node ? S.node+(S.site?'@'+S.site:'') : null;

export const postAt = ():Post|null => S.node ? POSTS.find(k=>k.node===S.node && (!k.site || k.site===S.site)) || null : null;

export const fuelPrice = ():number|undefined => S.node ? (FUEL_PRICE[locKey()!] ?? FUEL_PRICE[S.node!]) : undefined;

export const here = ():[string|null,string|null] => S.node ? (S.node.split('.') as [string,string]) : [null,null];

export const homePlanet = ():string => { const [k]=here(); return (k && M[k]) ? M[k].parent : (k||''); };

export const nodeName = (node:string) => { const [k,l]=node.split('.');
  if(l==='surf' && S.site){ const st=siteOf(k,S.site); if(st) return `${st.name} (${M[k]?M[k].name:B[k].name})`; }
  if(M[k]) return l==='surf' ? (M[k].surfName||`the surface of ${M[k].name}`) : (M[k].orbitName||`orbit around ${M[k].name}`);
  return `${(LVL as Record<string,string>)[l]} of ${B[k].name}`; };

export const pickTarget = (p:Pick):Target => p.type==='planet' ? {node:p.planet!+'.capt'} : p.type==='body' ? {node:p.body!+(B[p.body!]&&!SITES[p.body!]?'.capt':'.orbit')} : {node:p.node!, site:p.site||null};

export const atTarget = (t:Target) => S.node===t.node && (!t.site || S.site===t.site);

export function targetName(t:Target){
  const [b,l]=t.node.split('.');
  if(t.site){ const st=siteOf(b,t.site); return `${st?st.name:''} (${bodyName(b)})`; }
  if(l==='capt') return `High orbit of ${M[b]?M[b].name:B[b].name}`;
  return M[b] ? (M[b].orbitName||`orbit around ${M[b].name}`) : `Low orbit of ${B[b].name}`;
}
