// The order board: creating orders, ageing them, deadlines, bulk cargo.

import { randInt } from '../basics.js';
import { BULK, GOODS, GoodId, HUBS, HUB_CAP, POST_BY_ID, POSTS, PostId, MAX_OPEN, MAX_ROUTE_DV, REGION, START_DAY, Post, bodyOf, byPost, isGood } from './world.js';
import { transfer } from './physics.js';
import { S, Amounts, Market, Order } from './state.js';
import { rewardFor, route, RouteResult } from './graph.js';

export function newMarket(): Market {
  const produced=byPost(k=>{ const a:Amounts={}; k.makes.forEach(g=>a[g]=GOODS[g].lot[1]+Math.random()*2); return a; });
  const need=byPost(k=>{ const a:Amounts={}; k.needs.forEach(g=>a[g]=2); return a; });
  const market: Market = {produced, need, hubStore:{}, orders:[], nextId:1, simulatedTo:START_DAY-30};
  // Hubs start with something in store so there are short regional orders from day one
  POSTS.forEach(k=>{ if(k.hub) market.hubStore[k.id]={water:3, food:3, mach:3, hab:1}; });
  return market;
}

const openCount = (k:Post, g:GoodId) => S.domain.market.orders.filter(o=>o.from===k.id && o.good===g && o.state==='open').length;

export function hubRoom(h:Post){
  const stored=Object.values(S.domain.market.hubStore[h.id]??{}).reduce((a,b)=>a+b,0);
  const incoming=S.domain.market.orders.filter(o=>o.to===h.id).reduce((a,o)=>a+o.containers,0);
  return HUB_CAP-stored-incoming;
}

function pickWeighted<T>(list:[T,...T[]], w:(x:T)=>number):T{
  const tot=list.reduce((s,x)=>s+w(x),0); let r=Math.random()*tot;
  let pick=list[0]; for(const x of list){ pick=x; r-=w(x); if(r<=0) break; } return pick;
}
const nonEmpty = <T,>(a:T[]):a is [T,...T[]] => a.length>0;
const need = (k:Post, g:GoodId) => S.domain.market.need[k.id][g]??0;

function makeOrder(k:Post, g:GoodId, fromHubStore:boolean, day:number){
  const market=S.domain.market, G=GOODS[g], store=fromHubStore?market.hubStore[k.id]:market.produced[k.id], have=store?.[g]||0;
  if(!store || have<G.lot[0] || openCount(k,g)>=MAX_OPEN) return;
  const cand = POSTS.filter(c=>c.id!==k.id && c.needs.includes(g) && need(c,g)>0 &&
    (fromHubStore ? REGION[bodyOf(c)]===k.hub : bodyOf(c)!==bodyOf(k)) && route(k,c).dv<=MAX_ROUTE_DV);
  if(!nonEmpty(cand)) return;
  const n=randInt(G.lot[0], Math.min(G.lot[1], Math.floor(have)));
  let to=pickWeighted(cand,c=>need(c,g)), toHub=false;
  if(!fromHubStore){
    const reg=REGION[bodyOf(to)];
    if(reg!==REGION[bodyOf(k)] && Math.random()<0.6){
      const h=HUBS[reg];
      if(h.id!==k.id && bodyOf(h)!==bodyOf(k) && hubRoom(h)>=n){ to=h; toHub=true; }
    }
  }
  const r=route(k,to); if(!isFinite(r.dv)) return;
  if(!toHub) market.need[to.id][g]=need(to,g)-1;
  const wait=legWait(r,day);
  store[g]=have-n;
  market.orders.push({id:market.nextId++, good:g, containers:n, from:k.id, to:to.id, reward:rewardFor(r,g,n),
    dv:r.dv, days:r.days, deadline:day+wait+1.5*r.days+30, created:day, expires:day+90, state:'open', fromHubStore, toHub});
}

// Wait until the window of a route's first interplanetary leg
export function legWait(r:RouteResult, day:number){ const leg=r.legs[0]; if(!leg) return 0; const t=transfer(leg[0],leg[1],day); return t.d<0.04?0:t.wait; }

// Deadline if the order is accepted on day 'day'
export function freshDeadline(o:Order, day:number){ const r=route(POST_BY_ID[o.from],POST_BY_ID[o.to]); return day+legWait(r,day)+1.5*o.days+30; }

// Add n to one amount, creating the row if needed
const addTo = (t:Partial<Record<PostId,Amounts>>, k:PostId, g:GoodId, n:number) => { const a=t[k]??={}; a[g]=(a[g]||0)+n; };

function marketTick(day:number){
  const market=S.domain.market;
  POSTS.forEach(k=>k.makes.forEach(g=>{ market.produced[k.id][g]=Math.min(12,(market.produced[k.id][g]||0)+1/GOODS[g].rate); }));
  if(Math.round(day-START_DAY)%60===0) POSTS.forEach(k=>k.needs.forEach(g=>{ market.need[k.id][g]=Math.min(3,need(k,g)+1); }));
  // orders that expired without being accepted are dropped
  market.orders=market.orders.filter(o=>{
    if(o.state!=='open' || day<=(o.expires??o.deadline)) return true;
    addTo(o.isBulk ? (market.bulkStore??={}) : o.fromHubStore ? market.hubStore : market.produced, o.from, o.good, o.containers);
    if(!o.toHub) market.need[o.to][o.good]=Math.min(3,need(POST_BY_ID[o.to],o.good)+1);
    return false;
  });
  POSTS.forEach(k=>{
    k.makes.forEach(g=>makeOrder(k,g,false,day));
    if(k.hub) Object.keys(market.hubStore[k.id]??{}).filter(isGood).forEach(g=>makeOrder(k,g,true,day));
  });
  bulkTick(day);
}

// Bulk orders: every producer fills a bulk store on the side. Once the lot size is reached,
// an order appears with more containers than the Cog can carry (7 to 18).
function bulkTick(day:number){
  const market=S.domain.market, bulkStore=market.bulkStore??={}, bulkLot=market.bulkLot??={};
  POSTS.forEach(k=>k.makes.forEach(g=>{
    const B_=bulkStore[k.id]??={}, N=bulkLot[k.id]??={};
    const n=N[g]??=randInt(BULK.min,BULK.max);
    const have=B_[g]=(B_[g]||0)+1/(GOODS[g].rate*BULK.slow);
    if(have<n || market.orders.some(o=>o.isBulk && o.state==='open' && o.from===k.id && o.good===g)) return;
    const cand=POSTS.filter(c=>c.id!==k.id && c.needs.includes(g) && need(c,g)>0 && bodyOf(c)!==bodyOf(k) && route(k,c).dv<=MAX_ROUTE_DV);
    const hubs=Object.values(HUBS).filter((h)=>h.id!==k.id && bodyOf(h)!==bodyOf(k) && hubRoom(h)>=n && route(k,h).dv<=MAX_ROUTE_DV);
    let to:Post, toHub=false;
    if(nonEmpty(cand) && (!hubs.length || Math.random()<0.6)) to=pickWeighted(cand,c=>need(c,g));
    else if(nonEmpty(hubs)){ to=pickWeighted(hubs,()=>1); toHub=true; }
    else return;
    const r=route(k,to); if(!isFinite(r.dv)) return;
    if(!toHub) market.need[to.id][g]=need(to,g)-1;
    B_[g]=have-n; N[g]=randInt(BULK.min,BULK.max);
    const wait=legWait(r,day);
    market.orders.push({id:market.nextId++, good:g, containers:n, from:k.id, to:to.id, reward:Math.round(rewardFor(r,g,n)*BULK.premium/10)*10,
      dv:r.dv, days:r.days, deadline:day+wait+1.5*r.days+60, created:day, expires:day+BULK.life, state:'open', fromHubStore:false, toHub, isBulk:true});
  }));
}

export function marketAdvance(toDay:number){ while(S.domain.market.simulatedTo+1<=toDay){ S.domain.market.simulatedTo++; marketTick(S.domain.market.simulatedTo); } }
