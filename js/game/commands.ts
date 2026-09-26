// The commands. Everything that changes the game state lives here and reports
// afterwards with changed(); what the player should hear goes out through report().
// The objects in game/state.ts do each change and keep it consistent; the commands
// decide when: they check that a move is allowed, play its animation and report it.
// It knows nothing about the display and never touches what the screen shows.

import { changed, report, tick } from '../events.js';
import { ANIM, FAST, SLOW, dateStr, fmtDays, km, reduce, tons } from '../basics.js';
import { BODIES, BANKRUPT, GOODS, LandingSite, NAME_MAX, Node, NodeId, PlanetId, Preset, RESCUE_BASE, RESCUE_PER_T, RISK_AGE, SHIPS, ShipClass, ShipId, START_AGE, START_DAY, YEAR, YEAR_PRICE, fmtCr, isMoon, nodeOf, planetOfBody, splitNode } from './world.js';
import { cheapestFlight, transferCost } from './physics.js';
import { S, Autopilot, Docked, Entry, Game, InTransit, Leaderboard, Order, Plan, Player, Ship, setState, storeOf } from './state.js';
import { connectionsFrom, route } from './graph.js';
import { advanceMarket, newMarket } from './economy.js';
import { feeBlocked, localActions, LocalAction } from './actions.js';
import { Move, MoveSpec, SCENE, bodyPath, defaultOrb, resetScene, sysPlan, sysState } from '../map/geometry.js';
import { Leg, draftPlan, nearestFuel, replan, schedule, stepBlocker } from './planner.js';
import { parseSave } from './save.js';

// smallest ship that can carry n containers; none for more than the largest one holds
export const shipFor = (n:number):ShipClass|undefined => Object.values(SHIPS).filter(s=>s.slots>=n).sort((a,b)=>a.price-b.price)[0];

// A new game; the player keeps the name they gave themselves
export function newGame(name?:string){
  const start=nodeOf('earth.orbit');
  setState(new Game(START_DAY, new Player(20000, new Ship('cog', SHIPS.cog.cap, new Docked(start)), START_DAY-START_AGE*YEAR, name), newMarket()));
  resetScene();
  advanceMarket(S.market, START_DAY);
  report(`A Cog, fuelled up at the Orbital Shipyard, 20,000 Cr in the bank, and you are ${START_AGE}. Take on orders and get the cargo where it belongs, but mind the years: from ${RISK_AGE} on, every trip may be your last.`,'fresh');
}

export function arrive(node:NodeId, site:string|null){ S.player.ship.dock(nodeOf(node, site)); }

// Scroll the map into view if it is currently off screen
function showMap(el?:Element){
  const t = el || document.querySelector('.maptabs'); if(!t) return;
  const r=t.getBoundingClientRect();
  const visible = r.top>=0 && r.top < window.innerHeight*0.5;
  if(!visible) t.scrollIntoView({behavior: reduce?'auto':'smooth', block:'start'});
}

// The move an action sets off: path around the body, system orbit, time window.
// doAction then plays it out; anyone who only wants the picture sets it themselves.
export function planMove(a:LocalAction):Move{
  const p=S.player.ship.place, orb=SCENE.orb; if(!p) throw new Error('planMove while under way');
  const spec:MoveSpec={from:{node:p.node, site:p.site}, to:{node:a.to, site:a.site||null}, d0:S.day, d1:S.day+a.days, aero:!!a.aero,
    orb: orb?.body===p.body ? {...orb} : null};
  return {...spec, path:bodyPath(spec), sys:sysPlan(spec)};
}

export function doAction(a:LocalAction){
  const here=S.player.ship.place;
  if(!S.canAct || !here || a.dv>S.player.ship.dvAvail+0.5 || feeBlocked(a)) return;
  if(a.fee) S.player.charge(a.fee);
  S.player.ship.burn(a.dv);
// remember the move so the system and body views can show the ship under way
  const mv=planMove(a); SCENE.move=mv;
  S.player.ship.depart(new InTransit(a.via, S.day, S.day+a.days));
  changed();
  const [tb,tl]=splitNode(a.to);
  if(isMoon(tb) && tl==='orbit' && here.level!=='surface' || isMoon(here.body) && tl==='capt') showMap();
  const ms = mv.sys ? (mv.aero ? 3400 : 2400) : mv.path ? (a.to.endsWith('.surf')&&!a.hop ? 2600 : 1900) : Math.max(800, Math.min(1500, 400+a.days*20));
  animateTo(S.day+a.days, ms*SLOW, ()=>{
    const pth=mv.path, spl=mv.sys; SCENE.move=null;
    if(spl) Object.assign(sysState(planetOfBody(tb)), spl.final);
// orbit state for the 3D view: the launch orbit after lift-off, otherwise equatorial and in front
    if(tl==='orbit') SCENE.orb = pth && pth.finalOrb ? {...pth.finalOrb} : defaultOrb(tb); else if(tl==='surf') SCENE.orb=null;
    S.player.ship.dock(a.via.to); report(`${a.label}: ${km(a.dv)} km/s used. Now: ${S.player.ship.place?.label}.`);
    changed(); autoFill();
  });
}

// A transfer to planet b, leaving today and flying the given days; without them, the flight time
// that costs least today. It burns the exact cost. false if it does not happen.
export function doTransfer(b:PlanetId, flightDays?:number){
  const p=S.player.ship.place; if(!p || !S.canAct || p.node!==`${p.planet}.capt`) return false;
  const c=connectionsFrom(p).find(x=>x.window && x.to.planet===b), w=c?.window; if(!c || !w) return false;
  const a=p.planet, [f0,f1]=w.flightRange, tof=Math.max(f0,Math.min(f1,flightDays ?? cheapestFlight(a,b,S.day) ?? c.days));
  const t=transferCost(a,b,S.day,tof); if(!(t.total<=S.player.ship.dvAvail+0.5)) return false;
  S.player.ship.burn(Math.min(t.total,S.player.ship.dvAvail));
  const dep=S.day, arr=S.day+tof;
  S.player.ship.depart(new InTransit(c, dep, arr));
  report(`Under way to ${BODIES[b].name}. Arrival on ${dateStr(arr)}.`); changed(); showMap();
  animateTo(arr, 2800*SLOW, ()=>{
    S.player.ship.dock(c.to);
    report(`Arrived: high orbit of ${BODIES[b].name} after ${fmtDays(tof)}. Injection and capture cost ${km(t.total)} km/s.`);
    changed(); autoFill();
  });
  return true;
}

export function waitDays(n:number){
  if(!S.canAct) return; S.player.ship.busy=true; changed(); showMap();
  animateTo(S.day+n, Math.min(2400,350+n*5)*1.3, ()=>{ S.player.ship.busy=false; report(`${fmtDays(n)} passed.`); changed(); });
}

// "Always fill up": at every depot take on as much as the tank holds and the money allows
export function autoFill(){
  if(!S.player.autoFill || !S.canAct) return false;
  const r=refuelInfo(); if(!r || r.need<0.5 || r.max<0.5) return false;
  doRefuel(r.max); return true;
}

export function setAutoFill(on:boolean){
  S.player.autoFill=on;
  report(on?'Always fill up: on. At every depot the tank is filled as far as the money goes.':'Always fill up: off.'); changed(); autoFill();
}

// The dice for the player's death; tests replace it
export const fate={roll:()=>Math.random()};

// At the end of a stretch of time: did the player die in it? Rolled once for the whole stretch.
function survived(d0:number, d1:number){
  const p=S.player; if(p.out || fate.roll()>=p.deathChance(d0,d1)) return true;
  p.dead=true; return false;
}

// The player has died: the autopilot stops, the leaderboard keeps them
function die(){
  const p=S.player, age=Math.floor(p.ageOn(S.day)); p.ship.autopilot=null; ANIM.fast=false;
  const board=leaderboard(), rank=board.enter(p,S.day); keepBoard(board);
  report(`${p.name} died on ${dateStr(S.day)}, aged ${age}, with ${fmtCr(p.credits)} in the bank. ${rank?`Place ${rank} on the leaderboard.`:'Not enough for the leaderboard.'} Start again to have another go.`);
  changed();
}

function animateTo(target:number, ms:number, done:()=>void){
  const d0=S.day;
  const end=()=>{ const alive=survived(d0,target); done(); if(!alive) die(); };
// Straight to the target without animating: time-lapse tools and tests switch this on.
  if(ANIM.instant){ SCENE.anim=null; S.day=target; advanceMarket(S.market, S.day); end(); return; }
  SCENE.anim={d0, d1:target}; ANIM.active=true; ANIM.long=ms>1500; tick();
  let prog=0, last=performance.now();
  const step=(now:number)=>{
    const dt=Math.min(100,now-last); last=now;
    prog=Math.min(1, prog+dt/ms*(ANIM.fast?FAST:1));
    const p=prog, e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    S.day=d0+(target-d0)*e; tick();
    if(p<1) requestAnimationFrame(step);
    else { S.day=target; SCENE.anim=null; ANIM.active=false; if(!S.player.ship.autopilot) ANIM.fast=false; tick(); advanceMarket(S.market, S.day); end(); }
  };
  requestAnimationFrame(step);
}

export function deliverOrder(o:Order, silent?:boolean){
  if(!S.canAct || !S.player.ship.hold.includes(o)) return;
  const pay=o.payout(S.day); S.player.pay(pay); S.player.ship.unload(o);
  const hub=o.toHub ? S.market.hub(o.to) : null;
  if(hub) storeOf(hub.transship,o.good).stock+=o.containers;
  if(silent) return;
  report(`Delivered: ${o.containers} × ${GOODS[o.good].name}. ${fmtCr(pay)} credited${pay<o.reward?' (late)':''}.`); changed();
}

// Back to the post it came from, free of charge while the ship is still there
export function returnOrder(o:Order){
  if(!S.canAct || !S.player.ship.unload(o)) return;
  S.market.post(o.from).offer(o);
  report(`Returned: ${o.containers} × ${GOODS[o.good].name}. Free of charge, because you are still at the post it came from.`); changed();
}

export function abortOrder(o:Order){
  const pen=Math.round(o.reward*0.2);
  if(!S.canAct || !S.player.canAfford(pen) || !S.player.ship.hold.includes(o)) return;
  S.player.charge(pen); S.player.ship.unload(o);
  if(!o.toHub){ const d=S.market.post(o.to).industry.demand(o.good); d.level=Math.min(3,d.level+1); }
  report(`Order cancelled. Penalty ${fmtCr(pen)}, the cargo is lost.`); changed();
}

export function buyShip(id:ShipId){
  const net=SHIPS[id].price-0.7*S.player.ship.def.price;
  if(!S.canAct || !S.player.canAfford(net) || S.player.ship.slotsUsed>SHIPS[id].slots) return;
  S.player.ship.busy=true; changed();
  animateTo(S.day+5, 500, ()=>{
    S.player.charge(net); S.player.ship.swapTo(id);
    report(`New ship: ${S.player.ship.def.name} with ${S.player.ship.def.slots} cargo slots. ${fmtCr(net)} paid.`);
    S.player.ship.busy=false; changed();
  });
}

// The youth clinic: at the spaceports on the Earth's surface
export const clinicHere = () => { const p=S.player.ship.place; return !!p && p.body==='earth' && p instanceof LandingSite && p.port; };

// One more year before the risk of dying begins; takes no time. false if it does not happen.
export function buyYear(){
  if(!S.canAct || !clinicHere() || !S.player.canAfford(YEAR_PRICE)) return false;
  S.player.charge(YEAR_PRICE); S.player.bought+=1;
  report(`One more year: the risk now begins at ${RISK_AGE+S.player.bought}. ${fmtCr(YEAR_PRICE)} paid.`); changed();
  return true;
}

// The name the player goes by, on the leaderboard too
export function rename(name:string){
  const n=name.trim().slice(0,NAME_MAX); if(!n || n===S.player.name) return;
  S.player.name=n; changed();
}

export const strandCache:{key:string|null,val:boolean}={key:null,val:false};

export function stranded(){
  const me=S.player.ship.place, ship=S.player.ship; if(!S.canAct || !me) return false;
  const ri=refuelInfo();
  if(ri){ // a depot here, but no money
    if(!(ri.need>1 && ri.max<Math.min(ri.need,5)) || deliverables().length) return false;
    // Only stranded if the fuel on board is no longer enough for any order: not for the cargo aboard,
    // not for an open order from here, and not to reach another post that has orders.
    const key=['k',me.key,Math.round(ship.fuel*10),ship.cargoMass,ship.type,Math.floor(S.day/10)].join('|');
    if(strandCache.key!==key){
      const dv=ship.dvAvail, k=S.market.at(me);
      const cargoOk=ship.hold.length && ship.hold.every(o=>route(me,S.market.post(o.to)).dv<=dv+0.5);
      const hereOk=k && k.offers.some(o=>ship.dvWith(ship.fuel,ship.cargoMass+o.mass)>=o.dv);
// elsewhere: the approach plus the order's route must fit the fuel on board together
      const awayOk=!ship.hold.length && S.market.list.some(kk=>{ if(kk===k) return false; const d1=route(me,kk).dv; if(d1>dv+0.5) return false;
        return kk.offers.some(o=>d1+o.dv<=ship.dvWith(ship.fuel,o.mass)+0.5); });
      strandCache.key=key; strandCache.val=!(cargoOk||hereOk||awayOk);
    }
    return strandCache.val;
  }
  const key=[me.key,Math.round(ship.fuel*10),ship.cargoMass,ship.type,Math.floor(S.day/30)].join('|');
  if(strandCache.key!==key){ strandCache.key=key; strandCache.val=nearestFuel({node:me.node, site:me.site, day:S.day}).dv > ship.dvAvail+0.5; }
  return strandCache.val;
}

// Emergency refuelling: a tanker brings a full tank to you. Travel time depends on the hub's zone.
const RESCUE_DAYS: Record<string, number> = {shipyard:20, pavonis:90, valhalla:200};

export function rescueInfo(){
  const ri=refuelInfo(), ship=S.player.ship, amount=ship.def.cap-ship.fuel;
  if(ri) return {amount, cost:Math.round(2000+ri.price*amount), days:ri.days, lift:false, local:true};
  const cost=Math.round(RESCUE_BASE+RESCUE_PER_T*amount);
  const b=ship.place?.body, hub=b ? S.market.hubFor(b) : null, days=(hub ? RESCUE_DAYS[hub.id] : undefined) ?? 60;
// If not even a full tank allows any manoeuvre (the surface of Venus), the tanker lifts the ship into orbit
  const lift=!localActions().some(a=>a.to && a.dv<=ship.dvWith(ship.def.cap)+0.5);
  return {amount,cost,days,lift};
}

export function rescue(){
  if(!stranded()) return;
  const r=rescueInfo();
  S.player.charge(r.cost); S.player.ship.busy=true; changed(); showMap();
  animateTo(S.day+r.days, 900, ()=>{
    S.player.ship.fuel=S.player.ship.def.cap;
    const b=S.player.ship.place?.body; if(r.lift && b) S.player.ship.dock(nodeOf(`${b}.orbit`));
    S.player.ship.busy=false;
    if(S.player.credits<BANKRUPT){ S.player.bankrupt=true; report(`Bankrupt. Your balance stands at ${fmtCr(S.player.credits)}. Start again to have another go.`); }
    else if(r.local) report(`Fuelled on credit: ${tons(r.amount)} for ${fmtCr(r.cost)}. Your balance is ${fmtCr(S.player.credits)}.`);
    else report(`The tanker has arrived (${fmtDays(r.days)} travel): ${tons(r.amount)} for ${fmtCr(r.cost)}.${r.lift?' It also lifted you into orbit.':''} Your cargo is still aboard.`);
    changed();
  });
}

export function refuelInfo(){
  const p=S.player.ship.place; if(!p) return null;
  const d=p.depot; if(!d) return null;
  const days=d.fillDays, price=d.fuelPrice;
  const need=Math.max(0,S.player.ship.def.cap-S.player.ship.fuel), afford=Math.max(0,S.player.credits)/price;
  return {days, price, need, max:Math.min(need,afford), source: p instanceof LandingSite?(p.body==='earth'?'Refuelling at the spaceport':'Propellant from local ice'):'Orbital fuel depot'};
}

// false if nothing happens: no depot here, busy, or nothing to take on
export function doRefuel(amount:number){
  const r=refuelInfo(); if(!r || !S.canAct) return false;
  amount=Math.min(amount,r.max); if(amount<0.1) return false;
  const cost=Math.round(amount*r.price);
  S.player.ship.busy=true; changed();
  animateTo(S.day+r.days, Math.min(1200,300+r.days*15), ()=>{
    S.player.ship.refuel(amount); S.player.charge(cost);
    report(`Fuelled: ${tons(amount)} for ${fmtCr(cost)}. ${km(S.player.ship.dvAvail)} km/s available.`); S.player.ship.busy=false; changed();
  });
  return true;
}

// The most delta-v the cargo on board needs from here
export function routeNeedHere(){
  const me=S.player.ship.place; if(!me) return 0;
  const k=S.market.at(me);
  return S.player.ship.hold.reduce((mx:number,o:Order)=>Math.max(mx, o.to===k?.id?0:route(me,S.market.post(o.to)).dv),0);
}

export const deliverables = () => { const p=S.player.ship.place, k=p ? S.market.at(p) : null; return k ? S.player.ship.hold.filter(o=>o.to===k.id) : []; };

export function deliverAll(){ const list=deliverables(); if(!list.length||!S.canAct) return;
  let sum=0; list.forEach(o=>{ sum+=o.payout(S.day); deliverOrder(o,true); });
  report(`${list.length} ${list.length>1?'orders':'order'} delivered, ${fmtCr(sum)} credited.`); changed(); }

// Take the open orders with these ids aboard, all or none; false if they don't fit
export function acceptOrders(ids:Iterable<number>){
  const k=S.postHere; if(!k||!S.canAct) return false;
  const want=new Set(ids), list=k.offers.filter(o=>want.has(o.id));
  const n=list.reduce((s,o)=>s+o.containers,0); if(!list.length || S.player.ship.slotsUsed+n>S.player.ship.def.slots) return false;
  list.forEach(o=>{ o.created=S.day; k.withdraw(o); S.player.ship.load(o); });
  report(`${list.length} ${list.length>1?'orders':'order'} accepted, ${n} containers loaded.`); changed();
  return true;
}

const SAVE_KEY='transferorbit-v3', SLOT_KEY='transferorbit-slot1';
const OLD_SAVE_KEY='transferfenster-v2', OLD_SLOT_KEY='transferfenster-slot1';

export function save(){
  if(S.player.ship.underWay||!S.player.ship.place) return;
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(S.toSave())); }catch(e){}
}

let memSlot: string|null=null; // fallback for when the browser blocks localStorage

export function load(key?: string|null){
  try{
    const slot = key===SLOT_KEY;
    let t: string|null=null; try{ t=localStorage.getItem(key||SAVE_KEY) ?? localStorage.getItem(slot?OLD_SLOT_KEY:OLD_SAVE_KEY); }catch(e){}
    if(!t && slot) t=memSlot;
    if(!t) return false;
    const game=parseSave(JSON.parse(t)); if(!game) return false;
    setState(game);
    resetScene(); report('Game loaded.','fresh');
    return true;
  }catch(e){ return false; }
}

// Fly one step of a plan: a transfer that leaves later first waits for its day
export function execStep(l:Leg){
  if(!l || !S.canAct) return false;
  const st=l.step, leg=st.along.leg;
  if(leg){
    if(S.player.ship.place!==st.from) return false;
    if(l.dep>S.day+0.01){ waitDays(l.dep-S.day); return true; }
    return doTransfer(leg[1], st.flightDays ?? undefined);
  }
  const a=localActions().find(x=>x.via===st.along);
  if(!a || a.dv>S.player.ship.dvAvail+0.5 || feeBlocked(a)) return false;
  doAction(a); return true;
}

// The autopilot takes a plan, or drafts one from a preset
export function startAutopilot(target:Node, plan:Plan|Preset){
  const here=S.player.ship.place; if(!here) return;       // only from a place, never under way
  const p = typeof plan==='string' ? draftPlan(target, plan) : plan; if(!p) return;
  S.player.ship.autopilot=new Autopilot(target, p, here); changed();
  autoLater(200);
}

// arrived=true: stopped at the target or at a post with a delivery, a place worth looking at
export function stopAutopilot(msg?:string, arrived?:boolean){ S.player.ship.autopilot=null; if(!ANIM.active) ANIM.fast=false;
  if(msg) report(msg, arrived?'arrived':'info'); changed(); }

// The pauses between steps are for watching; tests running with ANIM.instant skip them
const autoLater = (ms:number) => setTimeout(autoTick, ANIM.instant?0:ms);

function autoTick(){
  const A=S.player.ship.autopilot; if(!A) return;
  if(S.player.ship.underWay){ autoLater(250); return; }
  if(S.player.out) return stopAutopilot();
  if(S.player.ship.isAt(A.target)) return stopAutopilot(`Autopilot: target reached, ${A.target.label}.${deliverables().length?' Cargo can be delivered here.':''}`,true);
  const here=S.player.ship.place, k=here ? S.market.at(here) : null;
  if(k && S.player.ship.place!==A.start && deliverables().length) return stopAutopilot(`Autopilot stopped: cargo can be delivered here at ${k.name}.`,true);
  replan(A.plan, A.target).forEach(m=>report(m));
  const st=schedule(A.plan)?.legs[0];
  if(!st) return stopAutopilot('Autopilot: no route found.');
  if(st.dv>S.player.ship.dvAvail+0.5) return stopAutopilot(`Autopilot stopped: "${st.label}" needs ${km(st.dv)} km/s, you have ${km(S.player.ship.dvAvail)}. Refuel or drop cargo.`);
  if(!execStep(st)) return stopAutopilot(`Autopilot stopped at "${st.label}": ${stepBlocker(st)}`);
  autoLater(300);
}

export function resetGame(){ S.player.ship.autopilot=null; if(S.player.ship.underWay){ report('Please wait a moment, the ship is under way.'); changed(); return; } try{ localStorage.removeItem(SAVE_KEY); }catch(e){} newGame(S.player.name); changed(); }

export function saveSlot(){
  if(S.player.ship.underWay||!S.player.ship.place){ report('Saving only works while the ship is stationary.'); changed(); return; }
  memSlot=JSON.stringify(S.toSave());
  try{ localStorage.setItem(SLOT_KEY, memSlot); report(`Saved: ${dateStr(S.day)}, ${fmtCr(S.player.credits)}.`); }
  catch(e){ report(`Saved for this session only: ${dateStr(S.day)}, ${fmtCr(S.player.credits)}. The browser does not allow permanent storage.`); }
  changed();
}

export function loadSlot(){
  if(S.player.ship.underWay) return;
  if(!load(SLOT_KEY)){ report('No saved game found.'); changed(); return; }
  report(`Game loaded: ${dateStr(S.day)}, ${fmtCr(S.player.credits)}.`); changed();
}

// The leaderboard outlives the game, so it is kept in a cookie of its own, apart from the save;
// where the browser refuses cookies, for this session only
const BOARD_KEY='transferorbit-leaderboard', BOARD_YEARS=10;
let memBoard=new Leaderboard();

const isEntry = (x:unknown):x is Entry => { if(typeof x!=='object' || x===null) return false;
  const e=x as Record<string,unknown>, num=(v:unknown)=>typeof v==='number' && Number.isFinite(v);
  return typeof e.name==='string' && num(e.age) && num(e.credits) && num(e.day) && num(e.bought); };

export function leaderboard():Leaderboard{
  try{
    const c=document.cookie.split('; ').find(x=>x.startsWith(BOARD_KEY+'='));
    if(c){ const list:unknown=JSON.parse(decodeURIComponent(c.slice(BOARD_KEY.length+1)));
      if(Array.isArray(list)) return new Leaderboard(list.filter(isEntry).map(e=>({...e, name:e.name.slice(0,NAME_MAX)}))); }
  }catch(e){}
  return new Leaderboard(memBoard.entries);
}

function keepBoard(b:Leaderboard){
  memBoard=b;
  try{ document.cookie=`${BOARD_KEY}=${encodeURIComponent(JSON.stringify(b.entries))}; max-age=${Math.round(BOARD_YEARS*YEAR*86400)}; path=/; SameSite=Lax`; }catch(e){}
}
