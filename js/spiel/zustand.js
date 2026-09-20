// Der Spielstand S und die Abfragen darauf. Schreibt nichts von sich aus.

import { B, FUEL_PRICE, G0, GOODS, KONTORE, LVL, M, SHIPS, SITES, bodyName, planetGen, siteOf } from './welt.js';

// Neuer Spielstand (Neustart, Laden). Alle Module sehen über die Bindung S
// sofort den neuen Stand.
export function setzeStand(neu){ S=neu; }

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

export const kontorAt = () => S.node ? KONTORE.find(k=>k.node===S.node && (!k.site || k.site===S.site)) : null;

export const fuelPrice = () => S.node ? (FUEL_PRICE[locKey()] ?? FUEL_PRICE[S.node]) : undefined;

export const here = () => S.node ? S.node.split('.') : [null,null];

export const homePlanet = () => { const [k]=here(); return k && M[k] ? M[k].parent : k; };

export const nodeName = node => { const [k,l]=node.split('.');
  if(l==='surf' && S.site){ const st=siteOf(k,S.site); if(st) return `${st.name} (${M[k]?M[k].name:B[k].name})`; }
  if(M[k]) return l==='surf' ? (M[k].surfName||`Oberfläche von ${M[k].name}`) : (M[k].orbitName||`Orbit um ${M[k].name}`);
  return `${LVL[l]} ${planetGen(k)}`; };

export const pickTarget = p => p.type==='planet' ? {node:p.planet+'.capt'} : p.type==='body' ? {node:p.body+(B[p.body]&&!SITES[p.body]?'.capt':'.orbit')} : {node:p.node, site:p.site||null};

export const atTarget = t => S.node===t.node && (!t.site || S.site===t.site);

export function targetName(t){
  const [b,l]=t.node.split('.');
  if(t.site){ const st=siteOf(b,t.site); return `${st?st.name:''} (${bodyName(b)})`; }
  if(l==='capt') return `Hoher Orbit ${M[b]?'um '+M[b].name:planetGen(b)}`;
  return M[b] ? (M[b].orbitName||`Orbit um ${M[b].name}`) : `Niedriger Orbit ${planetGen(b)}`;
}
