// The commands. Everything that changes the game state lives here and reports
// afterwards with changed(). It knows nothing about the display.

import { changed, tick } from '../events.js';
import { ANIM, FAST, SLOW, dateStr, fmtDays, isDesk, km, reduce, tons } from '../basics.js';
import { B, BANKRUPT, DEPOTS, G0, GOODS, POST_BY_ID, POSTS, M, REGION, RESCUE_BASE, RESCUE_PER_T, SHIPS, ShipDef, START_DAY, fmtCr, planetOfBody, siteOf } from './world.js';
import { theta, transfer } from './physics.js';
import { S, DomainState, Eco, Flags, atTarget, burn, cargoMass, cargoOrders, dvAvail, dvWith, eng, fuelPrice, here, homePlanet, postAt, locKey, nodeName, setState, slotsUsed, targetName, Order } from './state.js';
import { payout, route } from './graph.js';
import { econAdvance, freshDeadline, newEconomy } from './economy.js';
import { feeBlocked, localActions, LocalAction } from './actions.js';
import { Move, MoveSpec, bodyPath, defaultOrb, sysPlan, sysState } from '../map/geometry.js';
import { nearestFuel, planRoute, stepBlocker, PlanStep } from './planner.js';

// A save as written: the domain with visited as an array, since JSON has no Set
type SaveObj = Omit<DomainState,'visited'> & { visited:string[] };

// smallest ship that can carry n containers
export const shipFor = (n:number):ShipDef => Object.values(SHIPS).filter(s=>s.slots>=n).sort((a,b)=>a.price-b.price)[0];

export function newGame(){
  setState({
    domain:{day:START_DAY, node:'earth.orbit', site:null, ship:'cog', fuel:SHIPS.cog.cap, used:0, credits:20000,
      visited:new Set(['earth.orbit']), flags:{delivered:0}, target:'mars', over:false, autoFill:false, eco:newEconomy()},
    action:{busy:false, transit:null},
    ui:{view:'main', sel:new Set<number>(), tank:null, pick:null, route:null, auto:null, mapView:null, mapKey:null, rmsg:false, back:null,
      msg:'A Cog, fuelled up at the Orbital Shipyard, 20,000 Cr in the bank. Take on orders and get the cargo where it belongs.'},
    render:{move:null, orb:null, sys:null, anim:null},
  });
  econAdvance(START_DAY);
// orders from the run-up period start with a full deadline
  S.domain.eco.orders.forEach(o=>{ const sh=START_DAY-o.created; o.deadline+=sh; o.expires+=sh; o.created=START_DAY; });
}

export function arrive(node:string, site:string){
  S.domain.node=node; S.domain.visited.add(node);
  S.domain.site = node.endsWith('.surf') ? site : null;
  if(site) S.domain.visited.add(node.split('.')[0]+'@'+site);
  if(node==='mars.surf') S.domain.flags.marsLanded=true;
  if(S.domain.flags.marsLanded && node.startsWith('earth.')) S.domain.flags.marsReturn=true;
}

// Scroll the map into view if it is currently off screen
function showMap(el?:Element){
  const t = (el || document.querySelector('.maptabs')) as HTMLElement;
  const r=t.getBoundingClientRect();
  const visible = r.top>=0 && r.top < window.innerHeight*0.5;
  if(!visible) t.scrollIntoView({behavior: reduce?'auto':'smooth', block:'start'});
}

// The move an action sets off: path around the body, system orbit, time window.
// doAction then plays it out; anyone who only wants the picture sets it themselves.
export function planMove(a:LocalAction):Move{
  const node=S.domain.node!, orb=S.render.orb;
  const spec:MoveSpec={from:{node, site:S.domain.site}, to:{node:a.to, site:a.site||null}, d0:S.domain.day, d1:S.domain.day+a.days, aero:!!a.aero,
    orb: orb?.body===node.split('.')[0] ? {...orb} : null};
  return {...spec, path:bodyPath(spec), sys:sysPlan(spec)};
}

export function doAction(a:LocalAction){
  if(S.action.busy || S.domain.over || a.dv>dvAvail()+0.5 || feeBlocked(a)) return;
  if(a.fee) S.domain.credits-=a.fee;
  burn(a.dv); S.action.busy=true;
// remember the move so the system and body views can show the ship under way
  const mv=planMove(a); S.render.move=mv;
  changed();
  if(a.to && (M[a.to.split('.')[0]] && a.to.endsWith('.orbit') && !S.domain.node!.endsWith('.surf') || M[here()[0]!] && a.to.endsWith('.capt'))) showMap();
  const ms = mv.sys ? (mv.aero ? 3400 : 2400) : mv.path ? (a.to.endsWith('.surf')&&!a.hop ? 2600 : 1900) : Math.max(800, Math.min(1500, 400+a.days*20));
  animateTo(S.domain.day+a.days, ms*SLOW, ()=>{
    const pth=mv.path, spl=mv.sys; S.render.move=null;
    if(spl) Object.assign(sysState(planetOfBody(a.to.split('.')[0])), spl.final);
// orbit state for the 3D view: the launch orbit after lift-off, otherwise equatorial and in front
    if(a.to.endsWith('.orbit')){ const tb=a.to.split('.')[0]; S.render.orb = pth && pth.finalOrb ? {...pth.finalOrb} : defaultOrb(tb); } else if(a.to.endsWith('.surf')) S.render.orb=null;
    arrive(a.to,a.site as string); S.ui.msg=`${a.label}: ${km(a.dv)} km/s used. Now: ${nodeName(a.to)}.`;
    S.action.busy=false; changed(); autoFill();
  });
}

export function doTransfer(b:string){
  const a=homePlanet(); if(S.action.busy || S.domain.over || S.domain.node!==a+'.capt') return;
  const t=transfer(a,b,S.domain.day); if(t.total>dvAvail()) return;
  burn(t.total);
  const dep=S.domain.day, arr=S.domain.day+t.tof;
  S.action.transit={a,b,dep,arr,th0:theta(a,dep),th1:theta(b,arr)};
  S.domain.node=null; S.action.busy=true; S.ui.mapView=null; S.ui.msg=`Under way to ${B[b].name}. Arrival on ${dateStr(arr)}.`; changed(); showMap();
  animateTo(arr, 2800*SLOW, ()=>{
    S.action.transit=null; arrive(b+'.capt','');
    S.ui.msg=`Arrived: high orbit of ${B[b].name} after ${fmtDays(t.tof)}. Injection and capture cost ${km(t.total)} km/s.`;
    S.action.busy=false; changed(); autoFill();
  });
}

export function waitDays(n:number){
  if(S.action.busy || S.domain.over) return; S.action.busy=true; changed(); showMap();
  animateTo(S.domain.day+n, Math.min(2400,350+n*5)*1.3, ()=>{ S.action.busy=false; S.ui.msg=`${fmtDays(n)} passed.`; changed(); });
}

// "Always fill up": at every depot take on as much as the tank holds and the money allows
export function autoFill(){
  if(!S.domain.autoFill || S.action.busy || S.domain.over) return false;
  const r=refuelInfo(); if(!r || r.need<0.5 || r.max<0.5) return false;
  doRefuel(r.max,true); return true;
}

function animateTo(target:number, ms:number, done:()=>void){
  const d0=S.domain.day;
// Straight to the target without animating: time-lapse tools and tests switch this on.
  if(ANIM.instant){ S.render.anim=null; S.domain.day=target; econAdvance(S.domain.day); done(); return; }
  S.render.anim={d0, d1:target}; ANIM.active=true; ANIM.long=ms>1500; tick();
  let prog=0, last=performance.now();
  const step=(now:number)=>{
    const dt=Math.min(100,now-last); last=now;
    prog=Math.min(1, prog+dt/ms*(ANIM.fast?FAST:1));
    const p=prog, e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    S.domain.day=d0+(target-d0)*e; tick();
    if(p<1) requestAnimationFrame(step);
    else { S.domain.day=target; S.render.anim=null; ANIM.active=false; if(!S.ui.auto) ANIM.fast=false; tick(); econAdvance(S.domain.day); done(); }
  };
  requestAnimationFrame(step);
}

function removeOrder(o:Order){ S.domain.eco.orders=S.domain.eco.orders.filter(x=>x!==o); }

export function deliverOrder(o:Order, silent?:boolean){
  if(S.action.busy||S.domain.over) return;
  const pay=payout(o); S.domain.credits+=pay; removeOrder(o);
  if(o.transship){ const f=S.domain.eco.fwd[o.to]; f[o.good]=(f[o.good]||0)+o.n; S.domain.flags.hubDelivery=true; }
  S.domain.flags.delivered=(S.domain.flags.delivered||0)+1;
  if(silent) return;
  S.ui.msg=`Delivered: ${o.n} × ${GOODS[o.good].name}. ${fmtCr(pay)} credited${pay<o.reward?' (late)':''}.`; changed();
}

export function returnOrder(o:Order){
  if(S.action.busy||S.domain.over) return;
  o.state='open'; S.ui.msg=`Returned: ${o.n} × ${GOODS[o.good].name}. Free of charge, because you are still at the post it came from.`; changed();
}

export function abortOrder(o:Order){
  const pen=Math.round(o.reward*0.2);
  if(S.action.busy||S.domain.over||pen>S.domain.credits) return;
  S.domain.credits-=pen; removeOrder(o);
  if(!o.transship) S.domain.eco.demand[o.to][o.good]=Math.min(3,S.domain.eco.demand[o.to][o.good]+1);
  S.ui.msg=`Order cancelled. Penalty ${fmtCr(pen)}, the cargo is lost.`; changed();
}

export function buyShip(id:string){
  const net=SHIPS[id].price-0.7*eng().price;
  if(S.action.busy||S.domain.over||net>S.domain.credits||slotsUsed()>SHIPS[id].slots) return;
  S.action.busy=true; changed();
  animateTo(S.domain.day+5, 500, ()=>{
    S.domain.credits-=net; S.domain.ship=id; S.domain.fuel=Math.min(S.domain.fuel,eng().cap); S.domain.flags.bought=true;
    S.ui.msg=`New ship: ${eng().name} with ${eng().slots} cargo slots. ${fmtCr(net)} paid.`;
    S.action.busy=false; changed();
  });
}

export const strandCache:{key:string|null,val:boolean}={key:null,val:false};

export function stranded(){
  if(S.action.busy||S.domain.over||!S.domain.node) return false;
  const ri=refuelInfo();
  if(ri){ // a depot here, but no money
    if(!(ri.need>1 && ri.max<Math.min(ri.need,5)) || deliverables().length) return false;
    // Only stranded if the fuel on board is no longer enough for any order: not for the cargo aboard,
    // not for an open order from here, and not to reach another post that has orders.
    const key=['k',locKey(),Math.round(S.domain.fuel*10),cargoMass(),S.domain.ship,Math.floor(S.domain.day/10)].join('|');
    if(strandCache.key!==key){
      const dv=dvAvail(), k=postAt(), me={id:'@'+locKey()!, node:S.domain.node, site:S.domain.site};
      const cargoOk=cargoOrders().length && cargoOrders().every(o=>route(me,POST_BY_ID[o.to]).dv<=dv+0.5);
      const hereOk=k && S.domain.eco.orders.some(o=>o.state==='open' && o.from===k.id && dvWith(S.domain.fuel,cargoMass()+o.n*GOODS[o.good].m)>=o.dv);
// elsewhere: the approach plus the order's route must fit the fuel on board together
      const awayOk=!cargoOrders().length && POSTS.some(kk=>{ if(kk===k) return false; const d1=route(me,kk).dv; if(d1>dv+0.5) return false;
        return S.domain.eco.orders.some(o=>o.state==='open'&&o.from===kk.id && d1+o.dv<=dvWith(S.domain.fuel,o.n*GOODS[o.good].m)+0.5); });
      strandCache.key=key; strandCache.val=!(cargoOk||hereOk||awayOk);
    }
    return strandCache.val;
  }
  const key=[locKey(),Math.round(S.domain.fuel*10),cargoMass(),S.domain.ship,Math.floor(S.domain.day/30)].join('|');
  if(strandCache.key!==key){ strandCache.key=key; strandCache.val=nearestFuel({node:S.domain.node, site:S.domain.site, day:S.domain.day}).dv > dvAvail()+0.5; }
  return strandCache.val;
}

// Emergency refuelling: a tanker brings a full tank to you. Travel time depends on the region.
const RESCUE_DAYS: Record<string, number> = {shipyard:20, pavonis:90, valhalla:200};

export function rescueInfo(){
  const ri=refuelInfo(), amount=eng().cap-S.domain.fuel;
  if(ri) return {amount, cost:Math.round(2000+ri.price*amount), days:ri.days, lift:false, local:true};
  const cost=Math.round(RESCUE_BASE+RESCUE_PER_T*amount);
  const days=RESCUE_DAYS[REGION[here()[0]!]]||60;
// If not even a full tank allows any manoeuvre (the surface of Venus), the tanker lifts the ship into orbit
  const lift=!localActions().some(a=>a.to && a.dv<=dvWith(eng().cap,cargoMass())+0.5);
  return {amount,cost,days,lift};
}

export function rescue(){
  if(!stranded()) return;
  const r=rescueInfo();
  S.domain.credits-=r.cost; S.action.busy=true; changed(); showMap();
  animateTo(S.domain.day+r.days, 900, ()=>{
    S.domain.fuel=eng().cap;
    if(r.lift){ S.domain.node=here()[0]!+'.orbit'; S.domain.site=null; }
    S.action.busy=false;
    if(S.domain.credits<BANKRUPT){ S.domain.over=true; S.ui.msg=`Bankrupt. Your balance stands at ${fmtCr(S.domain.credits)}. Start again to have another go.`; }
    else if(r.local) S.ui.msg=`Fuelled on credit: ${tons(r.amount)} for ${fmtCr(r.cost)}. Your balance is ${fmtCr(S.domain.credits)}.`;
    else S.ui.msg=`The tanker has arrived (${fmtDays(r.days)} travel): ${tons(r.amount)} for ${fmtCr(r.cost)}.${r.lift?' It also lifted you into orbit.':''} Your cargo is still aboard.`;
    changed();
  });
}

export function openView(v:string, back?:string|null){ S.ui.rmsg=false; S.ui.back = v==='main' ? null : (back||null); S.ui.view=v; S.ui.sel=new Set<number>(); S.ui.tank=null; changed();
  if(isDesk()){ const cs=document.querySelector('.col-side'); if(cs) cs.scrollTop=0; } else window.scrollTo({top:0}); }

export function refuelInfo(){
  if(!S.domain.node) return null;
  const [k,l]=here(), site=l==='surf'?S.domain.site:null, st=site?siteOf(k!,site):null, days=st?st.depot:DEPOTS[S.domain.node], price=fuelPrice();
  if(days===undefined || price===undefined) return null;
  const need=Math.max(0,eng().cap-S.domain.fuel), afford=Math.max(0,S.domain.credits)/price;
  return {days, price, need, max:Math.min(need,afford), source: st?(k==='earth'?'Refuelling at the spaceport':'Propellant from local ice'):'Orbital fuel depot'};
}

export function doRefuel(amount:number, keepView?:boolean){
  const r=refuelInfo(); if(!r || S.action.busy || S.domain.over) return;
  amount=Math.min(amount,r.max); if(amount<0.1) return;
  const cost=Math.round(amount*r.price);
  S.action.busy=true; if(!keepView){ const back=S.ui.view==='refuel'?S.ui.back:null; S.ui.view=back||'main'; S.ui.back=null; } changed();
  animateTo(S.domain.day+r.days, Math.min(1200,300+r.days*15), ()=>{
    S.domain.fuel=Math.min(eng().cap,S.domain.fuel+amount); S.domain.credits-=cost; S.domain.flags[`refuel:${here()[0]!}@${S.domain.site}`]=true;
    S.ui.msg=`Fuelled: ${tons(amount)} for ${fmtCr(cost)}. ${km(dvAvail())} km/s available.`; S.action.busy=false; changed();
  });
}

// The most delta-v the cargo on board needs from here
export function routeNeedHere(){
  if(!S.domain.node) return 0;
  const me={id:'@'+locKey()!, node:S.domain.node, site:S.domain.site};
  return cargoOrders().reduce((mx:number,o:Order)=>Math.max(mx, POST_BY_ID[o.to]===postAt()?0:route(me,POST_BY_ID[o.to]).dv),0);
}

export const fuelFor = (dv:number, cm:number) => (eng().dry+cm)*(Math.exp(dv/(eng().isp*G0))-1);

export const deliverables = () => { const k=postAt(); return k ? cargoOrders().filter(o=>o.to===k.id) : []; };

export function deliverAll(){ const list=deliverables(); if(!list.length||S.action.busy||S.domain.over) return;
  let sum=0; list.forEach(o=>{ sum+=payout(o); deliverOrder(o,true); });
  S.ui.msg=`${list.length} ${list.length>1?'orders':'order'} delivered, ${fmtCr(sum)} credited.`; changed(); }

export function acceptSelected(){
  const k=postAt(); if(!k||S.action.busy||S.domain.over) return;
  const list=S.domain.eco.orders.filter(o=>S.ui.sel.has(o.id) && o.state==='open' && o.from===k.id);
  const n=list.reduce((s,o)=>s+o.n,0); if(!list.length || slotsUsed()+n>eng().slots) return;
  list.forEach(o=>{ o.deadline=freshDeadline(o,S.domain.day); o.created=S.domain.day; o.state='aboard'; });
  S.ui.msg=`${list.length} ${list.length>1?'orders':'order'} accepted, ${n} containers loaded.`;
  openView('cargo');
}

const SAVE_KEY='transferorbit-v3', SLOT_KEY='transferorbit-slot1';
const OLD_SAVE_KEY='transferfenster-v2', OLD_SLOT_KEY='transferfenster-slot1';

// Saves written before the code was translated carry the old German ids. Everything
// else in a save is language-neutral, so one lookup per kind is enough. Runs before
// the sanity check below, which would otherwise reject an old save outright.
const OLD_IDS: Record<string, Record<string,string>> = {
  ship: {kogge:'cog', holk:'hulk', hulk:'galleon', karacke:'carrack'},
  site: {nordpol:'northpole', tigerstreifen:'tigerstripes', aeqator:'equator'},
  post: {erde:'earth', werft:'shipyard', marsnord:'marsnorth', ceresnord:'ceresnorth'},
};

type Raw = Record<string, unknown>;
const isObj = (x:unknown):x is Raw => typeof x==='object' && x!==null && !Array.isArray(x);
const isNum = (x:unknown):x is number => typeof x==='number' && Number.isFinite(x);
const isStr = (x:unknown):x is string => typeof x==='string';

function migrate(o:Raw){
  const site = (s:string) => OLD_IDS.site[s] || s, post = (p:string) => OLD_IDS.post[p] || p;
  if(isStr(o.ship)) o.ship = OLD_IDS.ship[o.ship] || o.ship;
  if(isStr(o.site)) o.site = site(o.site);
  if(Array.isArray(o.visited)) o.visited = o.visited.filter(isStr).map(v=>{
    const i = v.indexOf('@'); return i<0 ? v : v.slice(0,i+1) + site(v.slice(i+1)); });
  if(isObj(o.flags)) o.flags = Object.fromEntries(Object.entries(o.flags).map(([k,v])=>[k.startsWith('refuel:') ? k.replace(/@(.*)$/,(_,s:string)=>'@'+site(s)) : k, v]));
  const eco = o.eco; if(!isObj(eco)) return o;
  if(Array.isArray(eco.orders)) eco.orders.forEach(x=>{ if(isObj(x) && isStr(x.from) && isStr(x.to)){ x.from = post(x.from); x.to = post(x.to); } });
  for(const field of ['stock','demand','fwd']){ const m=eco[field]; if(isObj(m))
    eco[field] = Object.fromEntries(Object.entries(m).map(([k,v])=>[post(k),v])); }
  return o;
}

const isOrder = (x:unknown) => isObj(x) && [x.id,x.n,x.reward,x.dv,x.days,x.deadline,x.created,x.expires].every(isNum)
  && isStr(x.good) && !!GOODS[x.good] && isStr(x.from) && isStr(x.to) && (x.state==='open'||x.state==='aboard');
const isTable = (x:unknown) => isObj(x) && Object.values(x).every(r=>isObj(r) && Object.values(r).every(isNum));

// The economy is checked field by field, then taken over as it is
function parseEco(e:unknown):Eco|null{
  if(!isObj(e) || !isNum(e.nextId) || !isNum(e.day) || !Array.isArray(e.orders) || !e.orders.every(isOrder)) return null;
  if(![e.stock,e.fwd,e.demand].every(isTable) || [e.bulk,e.bulkN].some(t=>t!==undefined && !isTable(t))) return null;
  return e as unknown as Eco;
}

// Unchecked JSON from localStorage -> a domain state, or null if it isn't a usable save.
// Fields added after a save was written get their defaults; old German ids are mapped first.
export function parseSave(raw:unknown):DomainState|null{
  if(!isObj(raw)) return null;
  const o=migrate(raw), eco=parseEco(o.eco);
  if(!eco || !isStr(o.node) || !o.node || !isStr(o.ship) || !SHIPS[o.ship] || !isNum(o.day) || !isNum(o.fuel) || !isNum(o.credits)) return null;
  const f=isObj(o.flags)?o.flags:{}, flags:Flags={delivered:isNum(f.delivered)?f.delivered:0};
  for(const [k,v] of Object.entries(f)) if(v===true){
    if(k.startsWith('refuel:')) flags[k as `refuel:${string}`]=true;
    else if(k==='marsLanded'||k==='marsReturn'||k==='hubDelivery'||k==='bought') flags[k]=true;
  }
  return {day:o.day, node:o.node, site:isStr(o.site)?o.site:null, ship:o.ship, fuel:o.fuel, used:isNum(o.used)?o.used:0, credits:o.credits,
    visited:new Set(Array.isArray(o.visited)?o.visited.filter(isStr):[]), flags, target:isStr(o.target)?o.target:null,
    over:o.over===true, autoFill:o.autoFill===true, eco};
}

// Only the domain is ever written: it's the whole save, no blacklist of UI/render/action
// fields to remember to strip.
function toSaveObj():SaveObj{ const d=S.domain; return {...d, visited:[...d.visited]}; }

export function save(){
  if(S.action.busy||!S.domain.node) return;
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(toSaveObj())); }catch(e){}
}

let memSlot: string|null=null; // fallback for when the browser blocks localStorage

export function load(key?: string|null){
  try{
    const slot = key===SLOT_KEY;
    let t: string|null=null; try{ t=localStorage.getItem(key||SAVE_KEY) ?? localStorage.getItem(slot?OLD_SLOT_KEY:OLD_SAVE_KEY); }catch(e){}
    if(!t && slot) t=memSlot;
    if(!t) return false;
    const domain=parseSave(JSON.parse(t)); if(!domain) return false;
    setState({
      domain,
      action:{busy:false, transit:null},
      ui:{view:'main', sel:new Set<number>(), tank:null, pick:null, route:null, auto:null, mapView:null, mapKey:null, rmsg:false, back:null, msg:'Game loaded.'},
      render:{move:null, orb:null, sys:null, anim:null},
    });
    return true;
  }catch(e){ return false; }
}

export function execStep(st:PlanStep){
  if(!st || S.action.busy || S.domain.over) return false;
  if(st.kind==='wait'){ const [a,b]=st.leg, t=transfer(a,b,S.domain.day); if(t.d<0.04) return true; waitDays(t.wait); return true; }
  if(st.kind==='leg'){ const hp=homePlanet(); if(S.domain.node!==hp+'.capt' || transfer(hp,st.leg[1],S.domain.day).total>dvAvail()) return false; doTransfer(st.leg[1]); return true; }
  const a=localActions().find(al=>al.to===st.node && (al.site||null)===(st.site||null) && Math.abs(al.dv-st.dv)<1);
  if(!a || a.dv>dvAvail()+0.5 || feeBlocked(a)) return false;
  doAction(a); return true;
}

export function startAutopilot(){
  const r=S.ui.route; if(!r) return;
  S.ui.auto={target:r.target, mode:r.mode, start:locKey()}; S.ui.pick=null; S.ui.rmsg=true;
// desktop: the schedule stays open. Mobile: back to the map so the flight is visible.
  if(!isDesk()){ S.ui.view='main'; changed(); window.scrollTo({top:0}); } else changed();
  setTimeout(autoTick,200);
}

// arrived=true: stopped at the target or at a post with a delivery -> back to the map, so the location (deliver, orders, refuel) is visible
export function stopAutopilot(msg?:string, arrived?:boolean){ S.ui.auto=null; if(!ANIM.active) ANIM.fast=false; if(msg) S.ui.msg=msg;
  if(arrived && S.ui.view==='route'){ S.ui.view='main'; S.ui.back=null; } changed(); }

function autoTick(){
  const A=S.ui.auto; if(!A) return;
  if(S.action.busy){ setTimeout(autoTick,250); return; }
  if(S.domain.over) return stopAutopilot();
  if(atTarget(A.target)) return stopAutopilot(`Autopilot: target reached, ${targetName(A.target)}.${deliverables().length?' Cargo can be delivered here.':''}`,true);
  if(locKey()!==A.start && deliverables().length) return stopAutopilot(`Autopilot stopped: cargo can be delivered here at ${postAt()!.name}.`,true);
  const plan=planRoute(A.target, A.mode);
  if(!plan || !plan.steps.length) return stopAutopilot('Autopilot: no route found.');
  const st=plan.steps[0];
  if(st.kind!=='wait' && st.dv>dvAvail()+0.5) return stopAutopilot(`Autopilot stopped: "${st.label}" needs ${km(st.dv)} km/s, you have ${km(dvAvail())}. Refuel or drop cargo.`);
  if(!execStep(st)) return stopAutopilot(`Autopilot stopped at "${st.label}": ${stepBlocker(st)}`);
  A.start=null; // after the first step every post with a delivery counts as a stop
  setTimeout(autoTick,300);
}

export function resetGame(){ S.ui.auto=null; if(S.action.busy){ S.ui.msg='Please wait a moment, the ship is under way.'; changed(); return; } try{ localStorage.removeItem(SAVE_KEY); }catch(e){} newGame(); changed(); }

export function saveSlot(){
  if(S.action.busy||!S.domain.node){ S.ui.msg='Saving only works while the ship is stationary.'; changed(); return; }
  memSlot=JSON.stringify(toSaveObj());
  try{ localStorage.setItem(SLOT_KEY, memSlot); S.ui.msg=`Saved: ${dateStr(S.domain.day)}, ${fmtCr(S.domain.credits)}.`; }
  catch(e){ S.ui.msg=`Saved for this session only: ${dateStr(S.domain.day)}, ${fmtCr(S.domain.credits)}. The browser does not allow permanent storage.`; }
  changed();
}

export function loadSlot(){
  if(S.action.busy) return;
  if(!load(SLOT_KEY)){ S.ui.msg='No saved game found.'; changed(); return; }
  S.ui.msg=`Game loaded: ${dateStr(S.domain.day)}, ${fmtCr(S.domain.credits)}.`; changed();
}
