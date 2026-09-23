// The game state S: the player, their ship, the market and its trading posts, as objects
// that relate the way the things in the game do. Never writes anything by itself; the
// commands decide when a method runs. docs/domain-model.md draws the whole picture.

import { B, BodyId, FUEL_PRICE, G0, GOODS, GoodId, LVL, Level, M, NodeId, POSTS, PlanetId, Post, PostId, SHIPS, ShipId, bodyName, byPost, isMoon, siteOf, splitNode } from './world.js';

export type Target = { node:NodeId; site?:string|null };
export type RouteMode = 'eco'|'now';
// Amounts per good: what a post has made, how badly it needs something, what a hub stores
export type Amounts = Partial<Record<GoodId,number>>;

export const locOf = (node:NodeId, site:string|null) => node+(site?'@'+site:'');

// A place in the solar system: a node and, on a surface, the landing site. A value: it never
// changes, a ship that moves gets a new one.
export class Place {
  readonly node:NodeId;
  readonly site:string|null;
  constructor(node:NodeId, site:string|null=null){ this.node=node; this.site=node.endsWith('.surf') ? site : null; }
  get body():BodyId { return splitNode(this.node)[0]; }
  get level():Level { return splitNode(this.node)[1]; }
  // the planet it belongs to; a moon counts as its planet
  get planet():PlanetId { const b=this.body; return isMoon(b) ? M[b].parent : b; }
  get key():string { return locOf(this.node,this.site); }
  // the place as a start for route()
  get id():string { return '@'+this.key; }
  get post():Post|null { return POSTS.find(k=>k.node===this.node && (!k.site || k.site===this.site)) || null; }
  get fuelPrice():number|undefined { return FUEL_PRICE[this.key] ?? FUEL_PRICE[this.node]; }
  get name():string {
    const b=this.body, l=this.level;
    if(l==='surf' && this.site){ const st=siteOf(b,this.site); if(st) return `${st.name} (${bodyName(b)})`; }
    if(isMoon(b)) return l==='surf' ? (M[b].surfName||`the surface of ${M[b].name}`) : (M[b].orbitName||`orbit around ${M[b].name}`);
    return `${LVL[l]} of ${B[b].name}`;
  }
  is(t:Target){ return this.node===t.node && (!t.site || this.site===t.site); }
}

export function targetName(t:Target){
  const [b,l]=splitNode(t.node);
  if(t.site){ const st=siteOf(b,t.site); return `${st?st.name:''} (${bodyName(b)})`; }
  if(l==='capt') return `High orbit of ${bodyName(b)}`;
  return isMoon(b) ? (M[b].orbitName||`orbit around ${M[b].name}`) : `Low orbit of ${B[b].name}`;
}

// Where the ship is: docked at a place, or on an interplanetary transfer between two planets
export class Docked {
  readonly place:Place;
  constructor(place:Place){ this.place=place; }
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
  readonly target:Target;
  readonly mode:RouteMode;
  start:string|null;      // the place it started from; a delivery there is no reason to stop
  constructor(target:Target, mode:RouteMode, start:string|null){ this.target=target; this.mode=mode; this.start=start; }
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

export interface PostRows { produced:Amounts; need:Amounts; bulkStore?:Amounts; bulkLot?:Amounts }

// A trading post as the game runs it: the fixed definition from world.ts plus what it has
// made, what it needs and the orders it offers.
export class TradingPost {
  readonly def:Post;
  produced:Amounts;             // made and not yet handed out as an order
  need:Amounts;                 // how badly the post wants a good, 0 to 3: where orders go
  bulkStore:Amounts;            // fills slowly beside produced; a full lot becomes a bulk order
  bulkLot:Amounts;              // the lot size the next bulk order waits for, 7 to 18
  readonly offers:Order[]=[];
  constructor(def:Post, rows:PostRows){
    this.def=def; this.produced=rows.produced; this.need=rows.need; this.bulkStore=rows.bulkStore??{}; this.bulkLot=rows.bulkLot??{};
  }
  get id():PostId { return this.def.id; }
  needOf(g:GoodId){ return this.need[g]??0; }
  offer(o:Order){ insertById(this.offers,o); }
  withdraw(o:Order){ return removeFrom(this.offers,o); }
}

// A hub also stores goods delivered to it, and passes them on as short regional orders
export class Hub extends TradingPost {
  store:Amounts;
  constructor(def:Post, rows:PostRows, store:Amounts){ super(def,rows); this.store=store; }
  get stored(){ return Object.values(this.store).reduce((a,b)=>a+b,0); }
}

export class Market {
  readonly posts:Record<PostId,TradingPost>;
  nextId:number;
  simulatedTo:number;           // the last day the market has been run up to
  constructor(posts:Record<PostId,TradingPost>, nextId:number, simulatedTo:number){ this.posts=posts; this.nextId=nextId; this.simulatedTo=simulatedTo; }
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
  get place():Place|null { return this.location instanceof Docked ? this.location.place : null; }
  get transit():InTransit|null { return this.location instanceof InTransit ? this.location : null; }
  isAt(t:Target){ return !!this.place?.is(t); }
  dock(p:Place){ this.location=new Docked(p); }
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
  get postHere():TradingPost|null { const k=this.player.ship.place?.post; return k ? this.market.post(k.id) : null; }
  // every order in the game, open or aboard, in id order
  get orders():Order[] { return [...this.market.offers, ...this.player.ship.hold].sort((a,b)=>a.id-b.id); }

  toSave():SaveObj {
    const ship=this.player.ship, p=ship.place; if(!p) throw new Error('Saving while in transit');
    const m=this.market;
    // a table of the posts that have something in it; an empty row is left out, as it always was
    const rows=(f:(t:TradingPost)=>Amounts|null)=>{ const r:Partial<Record<PostId,Amounts>>={};
      POSTS.forEach(k=>{ const a=f(m.posts[k.id]); if(a && Object.keys(a).length) r[k.id]=a; }); return r; };
    const bulkStore=rows(t=>t.bulkStore), bulkLot=rows(t=>t.bulkLot);
    const orders=[...m.offers.map(o=>saveOrder(o,'open')), ...ship.hold.map(o=>saveOrder(o,'aboard'))].sort((a,b)=>a.id-b.id);
    return {day:this.day, node:p.node, site:p.site, ship:ship.type, fuel:ship.fuel, dvUsed:ship.dvUsed, credits:this.player.credits,
      bankrupt:this.player.bankrupt, autoFill:this.player.autoFill,
      market:{produced:byPost(k=>m.posts[k.id].produced), need:byPost(k=>m.posts[k.id].need), hubStore:rows(t=>t instanceof Hub ? t.store : null), orders,
        nextId:m.nextId, simulatedTo:m.simulatedTo,
        // a market that has never been run has no bulk tables yet
        ...(Object.keys(bulkStore).length?{bulkStore}:{}), ...(Object.keys(bulkLot).length?{bulkLot}:{})}};
  }
}

export let S:Game;

export function setState(next:Game){ S=next; }
