// Der Wegegraph für die Preisbildung: idealisierte Kosten zwischen zwei Orten.

import { B, GOODS, K_T, K_Z, K_ZT, LAUNCH_FEE, M, M_S, PLANETS, SITES, START_DAY, V_E, hasAtm, moonsOf, rotPenalty, siteOf } from './welt.js';
import { captDv, hopCost, transfer } from './physik.js';
import { S } from './zustand.js';

const idealCache = {};

export function idealTransfer(a,b){
  const key=a+'>'+b; if(idealCache[key]) return idealCache[key];
  const t0=transfer(a,b,START_DAY), t=transfer(a,b,START_DAY+t0.wait);
  return idealCache[key]={total:t.total, tof:t.tof};
}

export function edgesFrom(node,site){
  const [k,l]=node.split('.'); const E=[];
  const e=(n,s,dv,days,x={})=>E.push({node:n,site:s||null,dv,days,...x});
  const lat=(body,s)=>{const st=siteOf(body,s); return st?st.lat:0;};
  const lands=(body,down)=>(SITES[body]||[]).forEach(st=>e(body+'.surf',st.id,down+(hasAtm(body)?0:rotPenalty(body,st.lat)),0.2));
  if(l==='surf' && site) (SITES[k]||[]).forEach(st=>{ if(st.id===site) return; const h=hopCost(k,site,st.id); e(k+'.surf',st.id,h.dv,h.days,{hop:true,launch:h.launcher}); });
  if(M[k]){
    const m=M[k];
    if(l==='surf') e(k+'.orbit',null,m.up+rotPenalty(k,lat(k,site)),0.2);
    else { lands(k,m.down); e(m.parent+'.capt',null,m.xfer,m.days); }
  } else {
    const b=B[k];
    if(l==='surf'){ const pen=rotPenalty(k,lat(k,site)); e(k+'.orbit',null,b.surf.launcher?pen:b.surf.up+pen,b.surf.launcher?1:0.2,{launch:!!b.surf.launcher}); }
    if(l==='orbit'){ if(b.surf) lands(k,b.surf.down); e(k+'.capt',null,captDv(k),1); }
    if(l==='capt'){
      e(k+'.orbit',null,captDv(k),1); if(b.atm) e(k+'.orbit',null,60,40);
      moonsOf(k).forEach(m=>e(m+'.orbit',null,M[m].xfer,M[m].days));
      PLANETS.filter(p=>p!==k).forEach(p=>{const t=idealTransfer(k,p); e(p+'.capt',null,t.total,t.tof,{leg:[k,p]});});
    }
  }
  return E;
}

const routeCache = {};

export function route(from,to){
  const key=from.id+'>'+to.id; if(routeCache[key]) return routeCache[key];
  const startSite = from.site || (from.node==='earth.surf' ? 'kourou' : null);
  const sk=(n,s)=>n+'|'+(s||'');
  const dist={}, prev={}, done=new Set();
  const q=[{n:from.node,s:startSite,c:0}]; dist[sk(from.node,startSite)]={c:0,dv:0,days:0};
  let goal=null;
  while(q.length){
    q.sort((a,b)=>a.c-b.c); const cur=q.shift(), ck=sk(cur.n,cur.s);
    if(done.has(ck)) continue; done.add(ck);
    if(cur.n===to.node && (!to.site || cur.s===to.site)){ goal=ck; break; }
    for(const ed of edgesFrom(cur.n,cur.s)){
      const nk=sk(ed.node,ed.site), d=dist[ck];
      const c=d.dv+ed.dv + (d.days+ed.days)*0.01;
      if(!dist[nk] || c<dist[nk].c){ dist[nk]={c,dv:d.dv+ed.dv,days:d.days+ed.days}; prev[nk]={k:ck,ed}; q.push({n:ed.node,s:ed.site,c}); }
    }
  }
  if(!goal) return routeCache[key]={dv:Infinity,days:0,legs:[],launch:false};
  const legs=[]; let launch=false, k=goal, first=null;
  while(prev[k]){ if(prev[k].ed.leg) legs.unshift(prev[k].ed.leg); if(prev[k].ed.launch && !prev[k].ed.hop) launch=true; first=prev[k].ed; k=prev[k].k; }
  return routeCache[key]={dv:dist[goal].dv, days:dist[goal].days, legs, launch, first};
}

export function rewardFor(r,good,n){
  const G=GOODS[good], mass=M_S+n*G.m;
  let R = K_T*mass*(Math.exp(r.dv/V_E)-1) + K_Z*r.days + K_ZT*mass*r.days + 0.1*n*G.w;
  if(r.launch) R += LAUNCH_FEE*(mass+20); // Anteil an der Erdstartgebühr
  return Math.round(R*rewardLuck()/10)*10;
}

// Zufallsfaktor: meist 0,9–1,2; selten (8 %) 1,4–1,9, hohe Werte seltener als niedrige
const LUCK = {p:0.08, min:1.4, max:1.9};

const rewardLuck = () => Math.random()<LUCK.p ? LUCK.min+(LUCK.max-LUCK.min)*Math.random()**2 : 0.9+Math.random()*0.3;

export const lateFactor = (o,day) => day<=o.deadline ? 1 : Math.max(0.25, 1-0.02*(day-o.deadline));

export const payout = o => Math.round(o.reward*lateFactor(o,S.day));
