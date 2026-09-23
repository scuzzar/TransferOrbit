// Reading a save back: old ids and field names are mapped first, then the JSON is checked
// and rebuilt, object by object, into a Game. Writing is Game.toSave() in game/state.ts.

import { GoodId, PostId, byPost, isGood, isNode, isPost, isShip, nodeAt } from './world.js';
import { Amounts, Docked, Game, Hub, Industry, Market, Order, Player, Ship, Starport, demandsFrom, storesFrom } from './state.js';

// Saves written before the code was translated carry the old German ids, and saves
// written before the state got readable names carry the old field names. One lookup
// per kind is enough for both. Runs before the check below, which would otherwise
// reject an old save outright.
const OLD_IDS: Record<'ship'|'site'|'post', Record<string,string>> = {
  ship: {kogge:'cog', holk:'hulk', hulk:'galleon', karacke:'carrack'},
  site: {nordpol:'northpole', tigerstreifen:'tigerstripes', aeqator:'equator'},
  // the Earth's one post became four starports: its orders and stores go to Kourou
  post: {erde:'kourou', earth:'kourou', werft:'shipyard', marsnord:'marsnorth', ceresnord:'ceresnorth'},
};
const OLD_FIELDS: Record<'domain'|'market'|'order', Record<string,string>> = {
  domain: {used:'dvUsed', over:'bankrupt', eco:'market'},
  market: {stock:'produced', demand:'need', fwd:'hubStore', bulk:'bulkStore', bulkN:'bulkLot', day:'simulatedTo'},
  order: {n:'containers', fwdOrder:'fromHubStore', transship:'toHub', bulk:'isBulk'},
};

type Raw = Record<string, unknown>;
const isObj = (x:unknown):x is Raw => typeof x==='object' && x!==null && !Array.isArray(x);
const isNum = (x:unknown):x is number => typeof x==='number' && Number.isFinite(x);
const isStr = (x:unknown):x is string => typeof x==='string';
const isBool = (x:unknown):x is boolean => typeof x==='boolean';

// Move old field names to the new ones, in place; a field already under its new name wins
function renameFields(o:Raw, names:Record<string,string>){
  for(const [old,now] of Object.entries(names)) if(old in o){ if(!(now in o)) o[now]=o[old]; delete o[old]; }
}

function migrate(o:Raw){
  renameFields(o, OLD_FIELDS.domain);
  if(isObj(o.market)){ renameFields(o.market, OLD_FIELDS.market);
    if(Array.isArray(o.market.orders)) o.market.orders.forEach(x=>{ if(isObj(x)) renameFields(x, OLD_FIELDS.order); }); }
  const site = (s:string) => OLD_IDS.site[s] || s, post = (p:string) => OLD_IDS.post[p] || p;
  if(isStr(o.ship)) o.ship = OLD_IDS.ship[o.ship] || o.ship;
  if(isStr(o.site)) o.site = site(o.site);
  const market = o.market; if(!isObj(market)) return o;
  if(Array.isArray(market.orders)) market.orders.forEach(x=>{ if(isObj(x) && isStr(x.from) && isStr(x.to)){ x.from = post(x.from); x.to = post(x.to); } });
  for(const field of ['produced','need','hubStore','bulkStore']){ const m=market[field]; if(isObj(m))
    market[field] = Object.fromEntries(Object.entries(m).map(([k,v])=>[post(k),v])); }
  return o;
}

// An order and where it lies, or null if anything is missing or unknown
function parseOrder(x:unknown):{order:Order; aboard:boolean}|null{
  if(!isObj(x)) return null;
  const {id,containers,reward,dv,days,deadline,created,expires,good,from,to,state}=x;
  if(!isNum(id) || !isNum(containers) || !isNum(reward) || !isNum(dv) || !isNum(days) || !isNum(deadline) || !isNum(created) || !isNum(expires)) return null;
  if(!isGood(good) || !isPost(from) || !isPost(to) || (state!=='open' && state!=='aboard')) return null;
  const order=new Order({id, good, containers, from, to, reward, dv, days, deadline, created, expires,
    fromHubStore:x.fromHubStore===true, toHub:isBool(x.toHub) && x.toHub, isBulk:isBool(x.isBulk) && x.isBulk});
  return {order, aboard:state==='aboard'};
}

// post -> good -> amount, keeping only known posts and goods; null if it isn't such a table
function parseTable(x:unknown):Partial<Record<PostId,Amounts>>|null{
  if(!isObj(x)) return null;
  const t:Partial<Record<PostId,Amounts>>={};
  for(const [k,row] of Object.entries(x)){
    if(!isObj(row) || !Object.values(row).every(isNum)) return null;
    if(!isPost(k)) continue;
    const a:Amounts=t[k]={}; for(const [g,v] of Object.entries(row)) if(isGood(g) && isNum(v)) a[g]=v;
  }
  return t;
}

// Only the goods an industry deals in
const only = (a:Amounts|undefined, goods:readonly GoodId[]):Amounts => Object.fromEntries(Object.entries(a??{}).filter(([g])=>isGood(g) && goods.includes(g)));

// The market with its posts and their open orders, and the orders aboard. Posts added since
// the save start empty; a row for a good the industry does not deal in is dropped.
function parseMarket(e:unknown):{market:Market; aboard:Order[]}|null{
  if(!isObj(e) || !isNum(e.nextId) || !isNum(e.simulatedTo) || !Array.isArray(e.orders)) return null;
  const orders=e.orders.map(parseOrder), produced=parseTable(e.produced), hubStore=parseTable(e.hubStore), need=parseTable(e.need);
  // older saves also kept the size the next bulk order waited for (bulkLot); the game draws it anew
  const bulkStore=e.bulkStore===undefined ? {} : parseTable(e.bulkStore);
  if(!produced || !hubStore || !need || !bulkStore) return null;
  const posts=byPost(k=>{
    const industry=new Industry(k, {stores:storesFrom(only(produced[k.id],k.makes)), demands:demandsFrom(only(need[k.id],k.needs)),
      bulk:storesFrom(only(bulkStore[k.id],k.makes))});
    return k.hub ? new Hub(k, industry, storesFrom(hubStore[k.id]??{})) : new Starport(k, industry);
  });
  const market=new Market(posts, e.nextId, e.simulatedTo), aboard:Order[]=[];
  for(const o of orders){ if(!o) return null; if(o.aboard) aboard.push(o.order); else market.post(o.order.from).offer(o.order); }
  return {market, aboard};
}

// Unchecked JSON from localStorage -> a game, or null if it isn't a usable save. Fields
// added after a save was written get their defaults; old ids and field names are mapped first.
// What older saves kept beyond the game (visited places, milestones, the window planet) is left.
export function parseSave(raw:unknown):Game|null{
  if(!isObj(raw)) return null;
  const o=migrate(raw), m=parseMarket(o.market);
  if(!m || !isNode(o.node) || !isShip(o.ship) || !isNum(o.day) || !isNum(o.fuel) || !isNum(o.credits)) return null;
  const at=nodeAt(o.node, isStr(o.site)?o.site:null); if(!at) return null;
  const ship=new Ship(o.ship, o.fuel, new Docked(at));
  ship.dvUsed=isNum(o.dvUsed)?o.dvUsed:0;
  m.aboard.forEach(x=>ship.load(x));
  const player=new Player(o.credits, ship); player.bankrupt=o.bankrupt===true; player.autoFill=o.autoFill===true;
  return new Game(o.day, player, m.market);
}
