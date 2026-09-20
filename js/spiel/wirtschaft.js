// Auftragsboerse: erzeugen, altern lassen, Fristen, Massengut.

import { randInt } from '../basis.js';
import { BULK, GOODS, HUBS, HUB_CAP, KBY, KONTORE, MAX_OPEN, MAX_ROUTE_DV, REGION, START_DAY, bodyOf } from './welt.js';
import { transfer } from './physik.js';
import { S } from './zustand.js';
import { rewardFor, route } from './graph.js';

export function newEconomy(){
  const eco={stock:{}, fwd:{}, demand:{}, orders:[], nextId:1, day:START_DAY-30};
  KONTORE.forEach(k=>{
    eco.stock[k.id]={}; k.makes.forEach(g=>eco.stock[k.id][g]=GOODS[g].lot[1]+Math.random()*2);
    eco.demand[k.id]={}; k.needs.forEach(g=>eco.demand[k.id][g]=2);
    // Drehkreuze starten mit etwas Umschlagware, damit es von Anfang an kurze Aufträge in der Region gibt
    if(k.hub){ eco.fwd[k.id]={water:3, food:3, mach:3, hab:1}; }
  });
  return eco;
}

const openCount = (k,g) => S.eco.orders.filter(o=>o.from===k.id && o.good===g && o.state==='open').length;

export function hubRoom(h){
  const stored=Object.values(S.eco.fwd[h.id]).reduce((a,b)=>a+b,0);
  const incoming=S.eco.orders.filter(o=>o.to===h.id).reduce((a,o)=>a+o.n,0);
  return HUB_CAP-stored-incoming;
}

function pickWeighted(list,w){
  const tot=list.reduce((s,x)=>s+w(x),0); let r=Math.random()*tot;
  for(const x of list){ r-=w(x); if(r<=0) return x; } return list[list.length-1];
}

function makeOrder(k,g,fwd,day){
  const eco=S.eco, G=GOODS[g], store=fwd?eco.fwd[k.id]:eco.stock[k.id], have=store[g]||0;
  if(have<G.lot[0] || openCount(k,g)>=MAX_OPEN) return;
  const cand = KONTORE.filter(c=>c.id!==k.id && c.needs.includes(g) && eco.demand[c.id][g]>0 &&
    (fwd ? REGION[bodyOf(c)]===k.hub : bodyOf(c)!==bodyOf(k)) && route(k,c).dv<=MAX_ROUTE_DV);
  if(!cand.length) return;
  const n=randInt(G.lot[0], Math.min(G.lot[1], Math.floor(have)));
  let to=pickWeighted(cand,c=>eco.demand[c.id][g]), transship=false;
  if(!fwd){
    const reg=REGION[bodyOf(to)];
    if(reg!==REGION[bodyOf(k)] && Math.random()<0.6){
      const h=HUBS[reg];
      if(h.id!==k.id && bodyOf(h)!==bodyOf(k) && hubRoom(h)>=n){ to=h; transship=true; }
    }
  }
  const r=route(k,to); if(!isFinite(r.dv)) return;
  if(!transship) eco.demand[to.id][g]--;
  const wait=legWait(r,day);
  store[g]=have-n;
  eco.orders.push({id:eco.nextId++, good:g, n, from:k.id, to:to.id, reward:rewardFor(r,g,n),
    dv:r.dv, days:r.days, deadline:day+wait+1.5*r.days+30, created:day, expires:day+90, state:'open', fwdOrder:fwd, transship});
}

// Wartezeit bis zum Fenster der ersten interplanetaren Etappe einer Route
export function legWait(r,day){ if(!r.legs.length) return 0; const [a,b]=r.legs[0], t=transfer(a,b,day); return t.d<0.04?0:t.wait; }

// Frist, wenn der Auftrag am Tag 'day' angenommen wird
export function freshDeadline(o,day){ const r=route(KBY[o.from],KBY[o.to]); return day+legWait(r,day)+1.5*o.days+30; }

function econTick(day){
  const eco=S.eco;
  KONTORE.forEach(k=>k.makes.forEach(g=>{ eco.stock[k.id][g]=Math.min(12,(eco.stock[k.id][g]||0)+1/GOODS[g].rate); }));
  if(Math.round(day-START_DAY)%60===0) KONTORE.forEach(k=>k.needs.forEach(g=>{ eco.demand[k.id][g]=Math.min(3,eco.demand[k.id][g]+1); }));
  // abgelaufene, nicht angenommene Aufträge verfallen
  eco.orders=eco.orders.filter(o=>{
    if(o.state!=='open' || day<=(o.expires??o.deadline)) return true;
    if(o.bulk){ eco.bulk[o.from][o.good]=(eco.bulk[o.from][o.good]||0)+o.n; }
    else { const src=o.fwdOrder?eco.fwd[o.from]:eco.stock[o.from]; src[o.good]=(src[o.good]||0)+o.n; }
    if(!o.transship) eco.demand[o.to][o.good]=Math.min(3,eco.demand[o.to][o.good]+1);
    return false;
  });
  KONTORE.forEach(k=>{
    k.makes.forEach(g=>makeOrder(k,g,false,day));
    if(k.hub) Object.keys(eco.fwd[k.id]).forEach(g=>makeOrder(k,g,true,day));
  });
  bulkTick(day);
}

// Großaufträge: Jeder Erzeuger füllt nebenher ein Großlager. Ist die Losgröße erreicht, entsteht ein Auftrag,
// der mehr Container hat, als die Kogge laden kann (7 bis 18).
function bulkTick(day){
  const eco=S.eco;
  if(!eco.bulk){ eco.bulk={}; eco.bulkN={}; }
  KONTORE.forEach(k=>k.makes.forEach(g=>{
    const B_=eco.bulk[k.id]=eco.bulk[k.id]||{}, N=eco.bulkN[k.id]=eco.bulkN[k.id]||{};
    if(!N[g]) N[g]=randInt(BULK.min,BULK.max);
    B_[g]=(B_[g]||0)+1/(GOODS[g].rate*BULK.slow);
    if(B_[g]<N[g] || eco.orders.some(o=>o.bulk && o.state==='open' && o.from===k.id && o.good===g)) return;
    const n=N[g];
    const cand=KONTORE.filter(c=>c.id!==k.id && c.needs.includes(g) && eco.demand[c.id][g]>0 && bodyOf(c)!==bodyOf(k) && route(k,c).dv<=MAX_ROUTE_DV);
    const hubs=Object.values(HUBS).filter(h=>h.id!==k.id && bodyOf(h)!==bodyOf(k) && hubRoom(h)>=n && route(k,h).dv<=MAX_ROUTE_DV);
    if(!cand.length && !hubs.length) return;
    let to, transship=false;
    if(cand.length && (!hubs.length || Math.random()<0.6)) to=pickWeighted(cand,c=>eco.demand[c.id][g]);
    else { to=hubs[Math.floor(Math.random()*hubs.length)]; transship=true; }
    const r=route(k,to); if(!isFinite(r.dv)) return;
    if(!transship) eco.demand[to.id][g]--;
    B_[g]-=n; N[g]=randInt(BULK.min,BULK.max);
    const wait=legWait(r,day);
    eco.orders.push({id:eco.nextId++, good:g, n, from:k.id, to:to.id, reward:Math.round(rewardFor(r,g,n)*BULK.premium/10)*10,
      dv:r.dv, days:r.days, deadline:day+wait+1.5*r.days+60, created:day, expires:day+BULK.life, state:'open', fwdOrder:false, transship, bulk:true});
  }));
}

export function econAdvance(toDay){ while(S.eco.day+1<=toDay){ S.eco.day++; econTick(S.eco.day); } }
