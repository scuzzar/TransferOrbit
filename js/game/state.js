// The game state S and the queries on it. Never writes anything by itself.

import { B, FUEL_PRICE, G0, GOODS, POSTS, LVL, M, SHIPS, SITES, bodyName, siteOf } from './world.js';

// A new game state (restart, load). Through the live binding S every module
// sees the new state immediately.
export function setState(next){ S=next; }

export let S;

export const eng = () => SHIPS[S.ship];

export const cargoOrders = () => S.eco.orders.filter(o=>o.state==='aboard');

export const cargoMass = () => cargoOrders().reduce((s,o)=>s+o.n*GOODS[o.good].m,0);

export const slotsUsed = () => cargoOrders().reduce((s,o)=>s+o.n,0);

export const dvWith = (f,cm) => eng().isp*G0*Math.log((eng().dry+cm+f)/(eng().dry+cm));

export const dvOf = f => dvWith(f,cargoMass());

export const dvAvail = () => dvOf(S.fuel);

export function burn(dv){
  const cm=cargoMass(), m=(eng().dry+cm+S.fuel)/Math.exp(dv/(eng().isp*G0));
  S.fuel=Math.max(0,m-eng().dry-cm); S.used+=dv;
}

export const locKey = () => S.node ? S.node+(S.site?'@'+S.site:'') : null;

export const postAt = () => S.node ? POSTS.find(k=>k.node===S.node && (!k.site || k.site===S.site)) : null;

export const fuelPrice = () => S.node ? (FUEL_PRICE[locKey()] ?? FUEL_PRICE[S.node]) : undefined;

export const here = () => S.node ? S.node.split('.') : [null,null];

export const homePlanet = () => { const [k]=here(); return k && M[k] ? M[k].parent : k; };

export const nodeName = node => { const [k,l]=node.split('.');
  if(l==='surf' && S.site){ const st=siteOf(k,S.site); if(st) return `${st.name} (${M[k]?M[k].name:B[k].name})`; }
  if(M[k]) return l==='surf' ? (M[k].surfName||`the surface of ${M[k].name}`) : (M[k].orbitName||`orbit around ${M[k].name}`);
  return `${LVL[l]} of ${B[k].name}`; };

export const pickTarget = p => p.type==='planet' ? {node:p.planet+'.capt'} : p.type==='body' ? {node:p.body+(B[p.body]&&!SITES[p.body]?'.capt':'.orbit')} : {node:p.node, site:p.site||null};

export const atTarget = t => S.node===t.node && (!t.site || S.site===t.site);

export function targetName(t){
  const [b,l]=t.node.split('.');
  if(t.site){ const st=siteOf(b,t.site); return `${st?st.name:''} (${bodyName(b)})`; }
  if(l==='capt') return `High orbit of ${M[b]?M[b].name:B[b].name}`;
  return M[b] ? (M[b].orbitName||`orbit around ${M[b].name}`) : `Low orbit of ${B[b].name}`;
}
