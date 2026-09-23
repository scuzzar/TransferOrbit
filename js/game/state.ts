// The game state S: the player, their ship, the market and its trading posts, as objects
// that relate the way the things in the game do. Never writes anything by itself; the
// commands decide when a method runs. docs/domain-model.md draws the whole picture.

import { G0, GOODS, GoodId, Node, NodeId, POSTS, PlanetId, Post, PostId, SHIPS, ShipId, byPost, isGood } from './world.js';

export type RouteMode = 'eco'|'now';
// Amounts per good, as a save writes the stores and demands
export type Amounts = Partial<Record<GoodId,number>>;

// Where the ship is: docked at a node, or on an interplanetary transfer between two planets
export class Docked {
  readonly at:Node;
  constructor(at:Node){ this.at=at; }
}
export class InTransit {
  readonly from:PlanetId; readonly to:PlanetId;
  readonly dep:number; readonly arr:number;     // departure and arrival day
  readonly th0:number; readonly th1:number;     // the two planets' angles then, for drawing the arc
  constructor(t:{from:PlanetId; to:PlanetId; dep:number; arr:number; th0:number; th1:number}){
    this.from=t.from; this.to=t.to; this.dep=t.dep; this.arr=t.arr; this.th0=t.th0; this.th1=t.th1;
  }
}
export type Location = Docked|InTransit;

export class Autopilot {
  readonly target:Node;
  readonly mode:RouteMode;
  start:Node|null;        // the place it started from; a delivery there is no reason to stop
  constructor(target:Node, mode:RouteMode, start:Node|null){ this.target=target; this.mode=mode; this.start=start; }
}

// Paid in full up to the deadline, then 2% less per day, down to a quarter
export const lateFactor = (deadline:number, day:number): number => day<=deadline ? 1 : Math.max(0.25, 1-0.02*(day-deadline));

export interface OrderSpec {
  id:number; good:GoodId; containers:number; from:PostId; to:PostId;
  reward:number; dv:number; days:number; deadline:number; created:number; expires:number;
  fromHubStore:boolean; toHub:boolean; isBulk?:boolean;
}

// An order lies at the post it comes from until the ship takes it aboard. Where it lies is
// its state: in a post's offers it is open, in the ship's hold it is aboard.
export class Order {
  readonly id:number; readonly good:GoodId; readonly containers:number;
  readonly from:PostId; readonly to:PostId;
  readonly reward:number;
  readonly dv:number; readonly days:number;     // the route's delta-v and travel time, for pricing and display
  deadline:number; created:number; expires:number;
  readonly fromHubStore:boolean;                // made from a hub's store, a regional follow-up of a transhipment
  readonly toHub:boolean;                       // ends at a hub, whose store takes the goods, instead of at a customer
  readonly isBulk:boolean;                      // more containers than the Cog carries
  constructor(o:OrderSpec){
    this.id=o.id; this.good=o.good; this.containers=o.containers; this.from=o.from; this.to=o.to;
    this.reward=o.reward; this.dv=o.dv; this.days=o.days; this.deadline=o.deadline; this.created=o.created; this.expires=o.expires;
    this.fromHubStore=o.fromHubStore; this.toHub=o.toHub; this.isBulk=o.isBulk===true;
  }
  get mass(){ return this.containers*GOODS[this.good].m; }
  lateFactor(day:number){ return lateFactor(this.deadline,day); }
  payout(day:number){ return Math.round(this.reward*this.lateFactor(day)); }
}

// Keep a list of orders in id order, which is the order they were made in
function insertById(list:Order[], o:Order){ const i=list.findIndex(x=>x.id>o.id); if(i<0) list.push(o); else list.splice(i,0,o); }
function removeFrom(list:Order[], o:Order){ const i=list.indexOf(o); if(i>=0) list.splice(i,1); return i>=0; }

// Containers of one good lying in store
export class Store {
  readonly good:GoodId;
  stock:number;
  constructor(good:GoodId, stock=0){ this.good=good; this.stock=stock; }
}

// How keen a starport is to get a good, 0 to 3: the keener, the likelier orders go there
export class Demand {
  readonly good:GoodId;
  level:number;
  constructor(good:GoodId, level=0){ this.good=good; this.level=level; }
}

// Stores or demands, one per good, in the order they came about
export type PerGood<T> = Map<GoodId,T>;
// The store of a good, made empty the first time it is needed
export function storeOf(m:PerGood<Store>, g:GoodId):Store { let s=m.get(g); if(!s){ s=new Store(g); m.set(g,s); } return s; }
export const stockOf = (m:PerGood<Store>, g:GoodId) => m.get(g)?.stock ?? 0;
export const totalStock = (m:PerGood<Store>) => [...m.values()].reduce((a,s)=>a+s.stock,0);
// Amounts as a save writes them, and back
export const toAmounts = <T extends {good:GoodId}>(m:PerGood<T>, f:(x:T)=>number):Amounts => Object.fromEntries([...m.values()].map(x=>[x.good,f(x)]));
export function storesFrom(a:Amounts):PerGood<Store> { const m:PerGood<Store>=new Map(); for(const [g,n] of Object.entries(a)) if(isGood(g) && n!==undefined) m.set(g,new Store(g,n)); return m; }
export function demandsFrom(a:Amounts):PerGood<Demand> { const m:PerGood<Demand>=new Map(); for(const [g,n] of Object.entries(a)) if(isGood(g) && n!==undefined) m.set(g,new Demand(g,n)); return m; }

// What a starport makes and needs: a store per good it makes for ordinary orders and one for
// bulk orders, and a demand per good it needs
export class Industry {
  readonly makes:readonly GoodId[];
  readonly needs:readonly GoodId[];
  readonly stores:PerGood<Store>;
  readonly bulk:PerGood<Store>;
  readonly demands:PerGood<Demand>;
  readonly bulkLot:Map<GoodId,number>;   // the lot size the next bulk order waits for, 7 to 18
  constructor(def:{makes:readonly GoodId[]; needs:readonly GoodId[]}, rows:{stores:PerGood<Store>; bulk?:PerGood<Store>; demands:PerGood<Demand>; bulkLot?:Map<GoodId,number>}){
    this.makes=def.makes; this.needs=def.needs;
    this.stores=rows.stores; this.bulk=rows.bulk??new Map(); this.demands=rows.demands; this.bulkLot=rows.bulkLot??new Map();
  }
  levelOf(g:GoodId){ return this.demands.get(g)?.level ?? 0; }
  // the demand for a good, made at level 0 the first time it is needed
  demand(g:GoodId):Demand { let d=this.demands.get(g); if(!d){ d=new Demand(g); this.demands.set(g,d); } return d; }
}

// A starport as the game runs it: the fixed definition from world.ts, its industry and the
// orders it offers
export class Starport {
  readonly def:Post;
  readonly industry:Industry;
  readonly offers:Order[]=[];
  constructor(def:Post, industry:Industry){ this.def=def; this.industry=industry; }
  get id():PostId { return this.def.id; }
  offer(o:Order){ insertById(this.offers,o); }
  withdraw(o:Order){ return removeFrom(this.offers,o); }
}

// A hub also takes goods for transhipment and passes them on as short orders in its zone
export class Hub extends Starport {
  readonly transship:PerGood<Store>;
  constructor(def:Post, industry:Industry, transship:PerGood<Store>){ super(def,industry); this.transship=transship; }
  get stored(){ return totalStock(this.transship); }
}

export class Market {
  readonly posts:Record<PostId,Starport>;
  nextId:number;
  simulatedTo:number;           // the last day the market has been run up to
  constructor(posts:Record<PostId,Starport>, nextId:number, simulatedTo:number){ this.posts=posts; this.nextId=nextId; this.simulatedTo=simulatedTo; }
  post(id:PostId){ return this.posts[id]; }
  hub(id:PostId):Hub|null { const p=this.posts[id]; return p instanceof Hub ? p : null; }
  // every open order, in id order
  get offers():Order[] { return POSTS.flatMap(k=>this.posts[k.id].offers).sort((a,b)=>a.id-b.id); }
}

export class Ship {
  type:ShipId;
  fuel:number;                  // tonnes of propellant
  dvUsed=0;                     // delta-v burned so far, m/s
  location:Location;
  readonly hold:Order[]=[];     // the orders aboard, in id order
  autopilot:Autopilot|null=null;
  busy=false;                   // a manoeuvre, a wait, a refuelling is under way
  constructor(type:ShipId, fuel:number, location:Location){ this.type=type; this.fuel=fuel; this.location=location; }
  get def(){ return SHIPS[this.type]; }
  // where the ship is docked; null while in transit
  get place():Node|null { return this.location instanceof Docked ? this.location.at : null; }
  get transit():InTransit|null { return this.location instanceof InTransit ? this.location : null; }
  isAt(n:Node){ return this.place===n; }
  dock(n:Node){ this.location=new Docked(n); }
  depart(t:InTransit){ this.location=t; }

  get cargoMass(){ return this.hold.reduce((s,o)=>s+o.containers*GOODS[o.good].m,0); }
  get slotsUsed(){ return this.hold.reduce((s,o)=>s+o.containers,0); }
  get slotsFree(){ return this.def.slots-this.slotsUsed; }
  // Tsiolkovsky: the delta-v a given tank and cargo allow
  dvWith(fuel:number, cargo=this.cargoMass){ const d=this.def; return d.isp*G0*Math.log((d.dry+cargo+fuel)/(d.dry+cargo)); }
  get dvAvail(){ return this.dvWith(this.fuel); }
  // the propellant a burn of dv needs
  fuelFor(dv:number, cargo=this.cargoMass){ const d=this.def; return (d.dry+cargo)*(Math.exp(dv/(d.isp*G0))-1); }
  burn(dv:number){
    const d=this.def, cm=this.cargoMass, m=(d.dry+cm+this.fuel)/Math.exp(dv/(d.isp*G0));
    this.fuel=Math.max(0,m-d.dry-cm); this.dvUsed+=dv;
  }
  refuel(tons:number){ this.fuel=Math.min(this.def.cap,this.fuel+tons); }
  swapTo(id:ShipId){ this.type=id; this.fuel=Math.min(this.fuel,this.def.cap); }
  load(o:Order){ insertById(this.hold,o); }
  unload(o:Order){ return removeFrom(this.hold,o); }
}

// The player and the ship they own
export class Player {
  credits:number;
  bankrupt=false;
  autoFill=false;               // "always fill up" at every depot
  readonly ship:Ship;
  constructor(credits:number, ship:Ship){ this.credits=credits; this.ship=ship; }
  pay(n:number){ this.credits+=n; }
  charge(n:number){ this.credits-=n; }
  canAfford(n:number){ return n<=this.credits; }
}

export interface SaveOrder extends Omit<OrderSpec,'isBulk'> { state:'open'|'aboard'; isBulk?:boolean }
export interface SaveMarket {
  produced:Record<PostId,Amounts>; need:Record<PostId,Amounts>; hubStore:Partial<Record<PostId,Amounts>>;
  orders:SaveOrder[]; nextId:number; simulatedTo:number;
  bulkStore?:Partial<Record<PostId,Amounts>>; bulkLot?:Partial<Record<PostId,Amounts>>;
}
// A save as written; game/save.ts reads it back
export interface SaveObj {
  day:number; node:NodeId; site:string|null; ship:ShipId; fuel:number; dvUsed:number; credits:number;
  bankrupt:boolean; autoFill:boolean; market:SaveMarket;
}

const saveOrder = (o:Order, state:SaveOrder['state']):SaveOrder => ({id:o.id, good:o.good, containers:o.containers, from:o.from, to:o.to,
  reward:o.reward, dv:o.dv, days:o.days, deadline:o.deadline, created:o.created, expires:o.expires, state, fromHubStore:o.fromHubStore,
  toHub:o.toHub, ...(o.isBulk?{isBulk:true}:{})});

// The game: the day, the player with their ship, and the market. What the screen shows lives
// in ui/state.ts, the map animation's caches in map/geometry.ts.
export class Game {
  day:number;                   // days since 1 January 2000
  readonly player:Player;
  readonly market:Market;
  constructor(day:number, player:Player, market:Market){ this.day=day; this.player=player; this.market=market; }
  // nothing under way and not bankrupt: the player may give an order
  get canAct(){ return !this.player.ship.busy && !this.player.bankrupt; }
  // the trading post the ship is docked at
  get postHere():Starport|null { const k=this.player.ship.place?.post; return k ? this.market.post(k.id) : null; }
  // every order in the game, open or aboard, in id order
  get orders():Order[] { return [...this.market.offers, ...this.player.ship.hold].sort((a,b)=>a.id-b.id); }

  toSave():SaveObj {
    const ship=this.player.ship, p=ship.place; if(!p) throw new Error('Saving while in transit');
    const m=this.market;
    // a table of the posts that have something in it; an empty row is left out, as it always was
    const rows=(f:(t:Starport)=>Amounts|null)=>{ const r:Partial<Record<PostId,Amounts>>={};
      POSTS.forEach(k=>{ const a=f(m.posts[k.id]); if(a && Object.keys(a).length) r[k.id]=a; }); return r; };
    const stock=(x:Store)=>x.stock, bulkStore=rows(t=>toAmounts(t.industry.bulk,stock)),
      bulkLot=rows(t=>Object.fromEntries(t.industry.bulkLot));
    const orders=[...m.offers.map(o=>saveOrder(o,'open')), ...ship.hold.map(o=>saveOrder(o,'aboard'))].sort((a,b)=>a.id-b.id);
    return {day:this.day, node:p.node, site:p.site, ship:ship.type, fuel:ship.fuel, dvUsed:ship.dvUsed, credits:this.player.credits,
      bankrupt:this.player.bankrupt, autoFill:this.player.autoFill,
      market:{produced:byPost(k=>toAmounts(m.posts[k.id].industry.stores,stock)), need:byPost(k=>toAmounts(m.posts[k.id].industry.demands,d=>d.level)),
        hubStore:rows(t=>t instanceof Hub ? toAmounts(t.transship,stock) : null), orders,
        nextId:m.nextId, simulatedTo:m.simulatedTo,
        // a market that has never been run has no bulk tables yet
        ...(Object.keys(bulkStore).length?{bulkStore}:{}), ...(Object.keys(bulkLot).length?{bulkLot}:{})}};
  }
}

export let S:Game;

export function setState(next:Game){ S=next; }
