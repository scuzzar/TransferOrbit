// The order board: creating orders, ageing them, deadlines, bulk cargo.

import { randInt } from '../basics.js';
import { BULK, GOODS, GoodId, HUB_CAP, MAX_OPEN, MAX_ROUTE_DV, SHIP_IDS, STARPORT_TABLE, START_DAY, ZONES, nodeOf } from './world.js';
import { transfer } from './physics.js';
import { Demand, Hub, Industry, Market, Order, PerGood, Starport, Store, stockOf, storeOf } from './state.js';
import { rewardFor, route, RouteResult } from './graph.js';

// A new game founds its starports from the starport table
export function newMarket(): Market {
  const posts=STARPORT_TABLE.map(k=>{
    const stores:PerGood<Store>=new Map(), demands:PerGood<Demand>=new Map();
    k.makes.forEach(g=>stores.set(g,new Store(g,GOODS[g].lot[1]+Math.random()*2)));
    k.needs.forEach(g=>demands.set(g,new Demand(g,2)));
    const industry=new Industry(k, {stores, demands}), at=nodeOf(k.node, k.site);
    // Hubs start with something in store so there are short regional orders from day one
    const start:[GoodId,number][]=[['water',3],['food',3],['mach',3],['hab',1]];
    return k.hub ? new Hub(k.id, k.name, at, industry, {zone:ZONES[k.id]??[], sells:SHIP_IDS, transship:new Map(start.map(([g,n])=>[g,new Store(g,n)]))})
      : new Starport(k.id, k.name, at, industry);
  });
  return new Market(posts, 1, START_DAY-30);
}

// The market works on the market it is given, never on the game as a whole: what the ship
// carries is none of its business.
let M:Market;
const bodyOf = (k:Starport) => k.at.body;

const openCount = (k:Starport, g:GoodId) => k.offers.filter(o=>o.good===g).length;

// Room left in a hub: its capacity less what it stores and what the orders on offer would bring
// it. What the ship carries towards it does not count, so a delivery may fill it past the top.
export function hubRoom(market:Market, h:Starport){
  const stored=market.hub(h.id)?.stored ?? 0;
  const incoming=market.offers.filter(o=>o.to===h.id).reduce((a,o)=>a+o.containers,0);
  return HUB_CAP-stored-incoming;
}

function pickWeighted<T>(list:[T,...T[]], w:(x:T)=>number):T{
  const tot=list.reduce((s,x)=>s+w(x),0); let r=Math.random()*tot;
  let pick=list[0]; for(const x of list){ pick=x; r-=w(x); if(r<=0) break; } return pick;
}
const nonEmpty = <T,>(a:T[]):a is [T,...T[]] => a.length>0;
const need = (k:Starport, g:GoodId) => k.industry.levelOf(g);
const setNeed = (k:Starport, g:GoodId, level:number) => { k.industry.demand(g).level=level; };

function makeOrder(k:Starport, g:GoodId, fromHubStore:boolean, day:number){
  const market=M, G=GOODS[g], store=fromHubStore?market.hub(k.id)?.transship:k.industry.stores, have=store?stockOf(store,g):0;
  if(!store || have<G.lot[0] || openCount(k,g)>=MAX_OPEN) return;
  const cand = market.list.filter(c=>c.id!==k.id && c.industry.needs.includes(g) && need(c,g)>0 &&
    (fromHubStore ? market.hubFor(bodyOf(c))===k : bodyOf(c)!==bodyOf(k)) && route(k,c).dv<=MAX_ROUTE_DV);
  if(!nonEmpty(cand)) return;
  const n=randInt(G.lot[0], Math.min(G.lot[1], Math.floor(have)));
  let to=pickWeighted(cand,c=>need(c,g)), toHub=false;
  if(!fromHubStore){
    const h=market.hubFor(bodyOf(to));
    if(h && h!==market.hubFor(bodyOf(k)) && Math.random()<0.6){
      if(h.id!==k.id && bodyOf(h)!==bodyOf(k) && hubRoom(M,h)>=n){ to=h; toHub=true; }
    }
  }
  const r=route(k,to); if(!isFinite(r.dv)) return;
  if(!toHub) setNeed(to,g,need(to,g)-1);
  const wait=legWait(r,day);
  storeOf(store,g).stock=have-n;
  k.offer(new Order({id:market.nextId++, good:g, containers:n, from:k.id, to:to.id, reward:rewardFor(r,g,n),
    dv:r.dv, days:r.days, deadline:day+wait+1.5*r.days+30, created:day, expires:day+90, fromHubStore, toHub}));
}

// Wait until the window of a route's first interplanetary leg
export function legWait(r:RouteResult, day:number){ const leg=r.legs[0]; if(!leg) return 0; const t=transfer(leg[0],leg[1],day); return t.d<0.04?0:t.wait; }

// Deadline if the order is accepted on day 'day'
export function freshDeadline(market:Market, o:Order, day:number){ const r=route(market.post(o.from),market.post(o.to)); return day+legWait(r,day)+1.5*o.days+30; }

// Add n to one store
const addTo = (m:PerGood<Store>, g:GoodId, n:number) => { storeOf(m,g).stock+=n; };

function marketTick(day:number){
  const market=M;
  const posts=market.list;
  posts.forEach(k=>k.industry.makes.forEach(g=>{ const s=storeOf(k.industry.stores,g); s.stock=Math.min(12,s.stock+1/GOODS[g].rate); }));
  if(Math.round(day-START_DAY)%60===0) posts.forEach(k=>k.industry.needs.forEach(g=>setNeed(k,g,Math.min(3,need(k,g)+1))));
  // orders that expired without being accepted are dropped, and their goods go back where they came from
  posts.forEach(p=>{ const k=p;
    p.offers.filter(o=>day>o.expires).forEach(o=>{
      p.withdraw(o);
      const hub=market.hub(k.id);
      addTo(o.isBulk ? p.industry.bulk : o.fromHubStore && hub ? hub.transship : p.industry.stores, o.good, o.containers);
      const to=market.has(o.to) ? market.post(o.to) : null;
      if(!o.toHub && to) setNeed(to,o.good,Math.min(3,need(to,o.good)+1));
    });
  });
  posts.forEach(k=>{
    k.industry.makes.forEach(g=>makeOrder(k,g,false,day));
    const hub=market.hub(k.id); if(hub) [...hub.transship.keys()].forEach(g=>makeOrder(k,g,true,day));
  });
  bulkTick(day);
}

// Is a bulk order ready, with this much in the bulk store after a day that added step? The order
// takes the whole containers in store, and their number spreads evenly around the good's bulkLot,
// as wide as BULK.min and BULK.max allow, so it averages bulkLot. Each day the chance is that of
// the size falling within that day's growth, given it has not fallen before: nothing needs
// remembering from one day to the next.
export function bulkRange(g:GoodId):[number,number]{
  const L=GOODS[g].bulkLot+0.5, w=Math.min(L-BULK.min, BULK.max+1-L); return [L-w, L+w];
}
export function bulkChance(g:GoodId, have:number, step:number){
  const [a,b]=bulkRange(g);
  if(have<BULK.min) return 0;
  if(have>=b) return 1;
  const F=(x:number)=>Math.min(1,Math.max(0,(x-a)/(b-a))), before=F(have-step);
  return before>=1 ? 1 : (F(have)-before)/(1-before);
}

// Bulk orders: every producer fills a bulk store on the side. Once enough is in it, a daily test
// decides whether an order appears that takes it all, with more containers than the Cog carries.
function bulkTick(day:number){
  const market=M;
  market.list.forEach(k=>k.industry.makes.forEach(g=>{
    const p=k, bs=storeOf(p.industry.bulk,g), step=1/(GOODS[g].rate*BULK.slow);
    const have=bs.stock+=step;
    if(have<BULK.min || p.offers.some(o=>o.isBulk && o.good===g)) return;
    if(Math.random()>=bulkChance(g,have,step)) return;
    // what piled up while an earlier bulk order was on offer: one order's worth, the rest stays
    const [a,b]=bulkRange(g), n=Math.min(BULK.max, Math.floor(have>=b ? a+Math.random()*(b-a) : have));
    const cand=market.list.filter(c=>c.id!==k.id && c.industry.needs.includes(g) && need(c,g)>0 && bodyOf(c)!==bodyOf(k) && route(k,c).dv<=MAX_ROUTE_DV);
    const hubs=market.hubs.filter((h)=>h.id!==k.id && bodyOf(h)!==bodyOf(k) && hubRoom(M,h)>=n && route(k,h).dv<=MAX_ROUTE_DV);
    let to:Starport, toHub=false;
    if(nonEmpty(cand) && (!hubs.length || Math.random()<0.6)) to=pickWeighted(cand,c=>need(c,g));
    else if(nonEmpty(hubs)){ to=pickWeighted(hubs,()=>1); toHub=true; }
    else return;
    const r=route(k,to); if(!isFinite(r.dv)) return;
    if(!toHub) setNeed(to,g,need(to,g)-1);
    bs.stock=have-n;
    const wait=legWait(r,day);
    p.offer(new Order({id:market.nextId++, good:g, containers:n, from:k.id, to:to.id, reward:Math.round(rewardFor(r,g,n)*BULK.premium/10)*10,
      dv:r.dv, days:r.days, deadline:day+wait+1.5*r.days+60, created:day, expires:day+BULK.life, fromHubStore:false, toHub, isBulk:true}));
  }));
}

// Run the market day by day up to toDay
export function advanceMarket(market:Market, toDay:number){
  M=market; while(market.simulatedTo+1<=toDay){ market.simulatedTo++; marketTick(market.simulatedTo); } }
