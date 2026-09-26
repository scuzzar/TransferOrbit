// The game state S: the player, their ship, the market and its trading posts, as objects
// that relate the way the things in the game do. Never writes anything by itself; the
// commands decide when a method runs. docs/domain-model.md draws the whole picture.

import { BodyId, Connection, G0, GOODS, GoodId, Node, NodeId, PlanetId, Preset, RISK_AGE, RISK_DOUBLING, RISK_RATE, SHIPS, ShipId, YEAR, bodyName, isGood } from './world.js';

// Amounts per good, as a save writes the stores and demands
export type Amounts = Partial<Record<GoodId,number>>;

// Where the ship is: docked at a node, or in transit along a connection. Every manoeuvre is a
// transit, a landing as much as a transfer to another planet.
export abstract class Location {}
export class Docked extends Location {
  readonly at:Node;
  constructor(at:Node){ super(); this.at=at; }
}
export class InTransit extends Location {
  readonly along:Connection;
  readonly dep:number; readonly arr:number;     // departure and arrival day
  constructor(along:Connection, dep:number, arr:number){ super(); this.along=along; this.dep=dep; this.arr=arr; }
  // the two planets of the trip; the same one for a manoeuvre within a planet's system
  get from():PlanetId { return this.along.from.planet; }
  get to():PlanetId { return this.along.to.planet; }
}

// One step of a plan, along one connection. A transfer step says when it leaves and how long it
// flies. A step the player changed is pinned: planning again leaves it as it is.
export class Step {
  along:Connection;
  leaveOn:number|null;          // a transfer: its departure day
  flightDays:number|null;       // a transfer: its flight time
  pinned:boolean;
  constructor(along:Connection, leaveOn:number|null=null, flightDays:number|null=null, pinned=false){
    this.along=along; this.leaveOn=leaveOn; this.flightDays=flightDays; this.pinned=pinned;
  }
  get from():Node { return this.along.from; }
  get to():Node { return this.along.to; }
}

// The way to a target, step by step from where the ship is. The preset made the first draft.
export class Plan {
  preset:Preset;
  readonly steps:Step[];
  constructor(preset:Preset, steps:Step[]){ this.preset=preset; this.steps=steps; }
  get pinned(){ return this.steps.some(s=>s.pinned); }
}

// The autopilot flies its plan from where the trip began to its target; a delivery at the start is
// no reason to stop, for the whole trip
export class Autopilot {
  readonly target:Node;
  readonly plan:Plan;
  readonly start:Node;
  constructor(target:Node, plan:Plan, start:Node){ this.target=target; this.plan=plan; this.start=start; }
}

// Paid in full up to the deadline, then 2% less per day, down to a quarter
export const lateFactor = (deadline:number, day:number): number => day<=deadline ? 1 : Math.max(0.25, 1-0.02*(day-deadline));

export interface OrderSpec {
  id:number; good:GoodId; containers:number; from:StarportId; to:StarportId;
  reward:number; dv:number; days:number; deadline:number; created:number; expires:number;
  fromHubStore:boolean; toHub:boolean; isBulk?:boolean;
}

// An order lies at the post it comes from until the ship takes it aboard. Where it lies is
// its state: in a post's offers it is offered, in the ship's hold it is aboard (Game.stateOf).
export type OrderState = 'offered'|'aboard';
export class Order {
  readonly id:number; readonly good:GoodId; readonly containers:number;
  readonly from:StarportId; readonly to:StarportId;
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
  get mass(){ return this.containers*GOODS[this.good].mass; }
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
// bulk orders, and a demand per good it needs. Game state: what it makes and needs may change.
export class Industry {
  makes:GoodId[];
  needs:GoodId[];
  readonly stores:PerGood<Store>;
  readonly bulk:PerGood<Store>;
  readonly demands:PerGood<Demand>;
  constructor(goods:{makes:readonly GoodId[]; needs:readonly GoodId[]}, rows:{stores:PerGood<Store>; bulk?:PerGood<Store>; demands:PerGood<Demand>}){
    this.makes=[...goods.makes]; this.needs=[...goods.needs];
    this.stores=rows.stores; this.bulk=rows.bulk??new Map(); this.demands=rows.demands;
  }
  levelOf(g:GoodId){ return this.demands.get(g)?.level ?? 0; }
  // the demand for a good, made at level 0 the first time it is needed
  demand(g:GoodId):Demand { let d=this.demands.get(g); if(!d){ d=new Demand(g); this.demands.set(g,d); } return d; }
}

// A starport is game state: its name, where it lies and its industry may change during a game,
// and a new game takes them from the starport table in world.ts. It offers orders.
export type StarportId = string;
export class Starport {
  readonly id:StarportId;
  name:string;
  at:Node;                      // the node it lies at
  readonly industry:Industry;
  readonly offers:Order[]=[];
  constructor(id:StarportId, name:string, at:Node, industry:Industry){ this.id=id; this.name=name; this.at=at; this.industry=industry; }
  // the ids of its place, as route() takes them
  get node():NodeId { return this.at.node; }
  get site():string|null { return this.at.site; }
  offer(o:Order){ insertById(this.offers,o); }
  withdraw(o:Order){ return removeFrom(this.offers,o); }
}

// A hub also takes goods for transhipment and passes them on as short orders in its zone of
// influence, and its shipyard sells ships
export class Hub extends Starport {
  readonly transship:PerGood<Store>;
  zone:BodyId[];
  sells:ShipId[];
  constructor(id:StarportId, name:string, at:Node, industry:Industry, hub:{zone:readonly BodyId[]; sells:readonly ShipId[]; transship:PerGood<Store>}){
    super(id,name,at,industry); this.zone=[...hub.zone]; this.sells=[...hub.sells]; this.transship=hub.transship;
  }
  get stored(){ return totalStock(this.transship); }
}

// Where a starport lies, and its name with it, as the screen shows them
// on a moon, its planet in brackets
export const postPlace = (k:Starport):string => k.at.node==='earth.orbit' ? 'Earth orbit' : k.at.level==='highOrbit' ? `high orbit of ${bodyName(k.at.body)}` :
  k.at.body!==k.at.planet ? `${bodyName(k.at.body)} (${bodyName(k.at.planet)})` : bodyName(k.at.body);
export const postLabel = (k:Starport):string => `${k.name}, ${postPlace(k)}`;

export class Market {
  readonly posts:Map<StarportId,Starport>;   // in the order they were founded
  nextId:number;
  simulatedTo:number;           // the last day the market has been run up to
  constructor(posts:Iterable<Starport>, nextId:number, simulatedTo:number){
    this.posts=new Map([...posts].map(k=>[k.id,k])); this.nextId=nextId; this.simulatedTo=simulatedTo;
  }
  // every starport, in the order they were founded
  get list():Starport[] { return [...this.posts.values()]; }
  get hubs():Hub[] { return this.list.filter((k):k is Hub=>k instanceof Hub); }
  has(id:string):boolean { return this.posts.has(id); }
  post(id:StarportId):Starport { const k=this.posts.get(id); if(!k) throw new Error(`No starport ${id}`); return k; }
  // the starport at a node in this game, if there is one there: the world does not point back
  at(n:Node):Starport|null { return this.list.find(p=>p.at===n) ?? null; }
  hub(id:StarportId):Hub|null { const p=this.posts.get(id); return p instanceof Hub ? p : null; }
  // the hub in whose zone of influence a body lies
  hubFor(b:BodyId):Hub|null { return this.hubs.find(h=>h.zone.includes(b)) ?? null; }
  // every open order, in id order
  get offers():Order[] { return this.list.flatMap(k=>k.offers).sort((a,b)=>a.id-b.id); }
}

export class Ship {
  type:ShipId;
  fuel:number;                  // tonnes of propellant
  dvUsed=0;                     // delta-v burned so far, m/s
  location:Location;
  readonly hold:Order[]=[];     // the orders aboard, in id order
  autopilot:Autopilot|null=null;
  busy=false;                   // time passes at a place: waiting, refuelling, the shipyard, a rescue
  constructor(type:ShipId, fuel:number, location:Location){ this.type=type; this.fuel=fuel; this.location=location; }
  get def(){ return SHIPS[this.type]; }
  // where the ship is docked; null while in transit
  get place():Node|null { return this.location instanceof Docked ? this.location.at : null; }
  get transit():InTransit|null { return this.location instanceof InTransit ? this.location : null; }
  // where the ship is, or the node a manoeuvre within a planet's system leaves from; null on the
  // way to another planet. For the map and the panels, which keep showing where it lifted off.
  get near():Node|null { const t=this.transit; return this.place ?? (t && !t.along.window ? t.along.from : null); }
  // something is going on: time passes at a place, or the ship is under way
  get underWay(){ return this.busy || this.transit!==null; }
  isAt(n:Node){ return this.place===n; }
  dock(n:Node){ this.location=new Docked(n); }
  depart(t:InTransit){ this.location=t; }

  get cargoMass(){ return this.hold.reduce((s,o)=>s+o.containers*GOODS[o.good].mass,0); }
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

// The risk of dying from `from` to `to` years past the risk age: the rate RISK_RATE·2^(t/RISK_DOUBLING)
// a year, summed over the stretch. Nothing before the risk age.
export function deathChance(from:number, to:number):number {
  const a=Math.max(0,from), b=Math.max(0,to); if(b<=a) return 0;
  const k=RISK_RATE*RISK_DOUBLING/Math.LN2, grow=(t:number)=>Math.pow(2,t/RISK_DOUBLING);
  return 1-Math.exp(-k*(grow(b)-grow(a)));
}
// The yearly risk t years past the risk age
export const yearlyRisk = (t:number):number => t<0 ? 0 : 1-Math.exp(-RISK_RATE*Math.pow(2,t/RISK_DOUBLING));

// The player and the ship they own. How old they are follows from the day; from the risk age on,
// plus the years bought, they may die.
export class Player {
  name:string;
  born:number;                  // the day they were born
  bought=0;                     // years bought at the youth clinic
  credits:number;
  bankrupt=false;
  dead=false;
  autoFill=false;               // "always fill up" at every depot
  readonly ship:Ship;
  constructor(credits:number, ship:Ship, born:number, name='Pilot'){ this.credits=credits; this.ship=ship; this.born=born; this.name=name; }
  pay(n:number){ this.credits+=n; }
  charge(n:number){ this.credits-=n; }
  canAfford(n:number){ return n<=this.credits; }
  // the game is over for them: bankrupt or dead
  get out(){ return this.bankrupt || this.dead; }
  ageOn(day:number){ return (day-this.born)/YEAR; }
  // the day from which they may die
  get riskFrom(){ return this.born+(RISK_AGE+this.bought)*YEAR; }
  // years past the risk age on a day; negative before it
  pastRisk(day:number){ return (day-this.riskFrom)/YEAR; }
  // the chance of dying between two days
  deathChance(d0:number, d1:number){ return deathChance(this.pastRisk(d0), this.pastRisk(d1)); }
}

export interface SaveOrder extends Omit<OrderSpec,'isBulk'> { state:'open'|'aboard'; isBulk?:boolean }
// A starport as a save keeps it; hub is there for a hub only
export interface SaveStarport {
  id:StarportId; name:string; node:NodeId; site:string|null; makes:GoodId[]; needs:GoodId[];
  hub?:{zone:BodyId[]; sells:ShipId[]};
}
export interface SaveMarket {
  starports:SaveStarport[];
  produced:Record<StarportId,Amounts>; need:Record<StarportId,Amounts>; hubStore:Record<StarportId,Amounts>;
  orders:SaveOrder[]; nextId:number; simulatedTo:number;
  bulkStore?:Record<StarportId,Amounts>;
}
// A save as written; game/save.ts reads it back
export interface SaveObj {
  day:number; node:NodeId; site:string|null; ship:ShipId; fuel:number; dvUsed:number; credits:number;
  bankrupt:boolean; autoFill:boolean; market:SaveMarket;
  name:string; born:number; bought:number; dead:boolean;
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
  // nothing under way, neither bankrupt nor dead: the player may give an order
  get canAct(){ return !this.player.ship.underWay && !this.player.out; }
  // the trading post the ship is docked at
  get postHere():Starport|null { const n=this.player.ship.place; return n ? this.market.at(n) : null; }
  // every order in the game, offered or aboard, in id order
  get orders():Order[] { return [...this.market.offers, ...this.player.ship.hold].sort((a,b)=>a.id-b.id); }
  // where an order lies is its state; null for one that is no longer in the game
  stateOf(o:Order):OrderState|null {
    if(this.player.ship.hold.includes(o)) return 'aboard';
    return this.market.post(o.from).offers.includes(o) ? 'offered' : null;
  }

  toSave():SaveObj {
    const ship=this.player.ship, p=ship.place; if(!p) throw new Error('Saving while in transit');
    const m=this.market;
    // a table of the posts that have something in it; an empty row is left out, as it always was
    const rows=(f:(t:Starport)=>Amounts|null)=>{ const r:Record<StarportId,Amounts>={};
      m.list.forEach(k=>{ const a=f(k); if(a && Object.keys(a).length) r[k.id]=a; }); return r; };
    const every=(f:(t:Starport)=>Amounts)=>Object.fromEntries(m.list.map(k=>[k.id,f(k)]));
    const starports=m.list.map((k):SaveStarport=>({id:k.id, name:k.name, node:k.at.node, site:k.at.site,
      makes:[...k.industry.makes], needs:[...k.industry.needs], ...(k instanceof Hub?{hub:{zone:[...k.zone], sells:[...k.sells]}}:{})}));
    // an industry keeps the rows of the goods it deals in now; a good it gave up leaves no trace
    const only=(a:Amounts, goods:readonly GoodId[])=>Object.fromEntries(Object.entries(a).filter(([g])=>goods.includes(g as GoodId)));
    const stock=(x:Store)=>x.stock, bulkStore=rows(t=>only(toAmounts(t.industry.bulk,stock),t.industry.makes));
    const orders=[...m.offers.map(o=>saveOrder(o,'open')), ...ship.hold.map(o=>saveOrder(o,'aboard'))].sort((a,b)=>a.id-b.id);
    return {day:this.day, node:p.node, site:p.site, ship:ship.type, fuel:ship.fuel, dvUsed:ship.dvUsed, credits:this.player.credits,
      bankrupt:this.player.bankrupt, autoFill:this.player.autoFill,
      name:this.player.name, born:this.player.born, bought:this.player.bought, dead:this.player.dead,
      market:{starports, produced:every(k=>only(toAmounts(k.industry.stores,stock),k.industry.makes)),
        need:every(k=>only(toAmounts(k.industry.demands,d=>d.level),k.industry.needs)),
        hubStore:rows(t=>t instanceof Hub ? toAmounts(t.transship,stock) : null), orders,
        nextId:m.nextId, simulatedTo:m.simulatedTo,
        // a market that has never been run has no bulk tables yet
        ...(Object.keys(bulkStore).length?{bulkStore}:{})}};
  }
}

export let S:Game;

export function setState(next:Game){ S=next; }
