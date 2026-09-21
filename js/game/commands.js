// The commands. Everything that changes the game state lives here and reports
// afterwards with changed(). It knows nothing about the display.

import { changed, tick } from '../events.js';
import { ANIM, FAST, SLOW, dateStr, fmtDays, isDesk, km, reduce, tons } from '../basics.js';
import { B, BANKRUPT, DEPOTS, G0, GOODS, POST_BY_ID, POSTS, M, REGION, RESCUE_BASE, RESCUE_PER_T, SHIPS, START_DAY, fmtCr, planetOfBody, siteOf } from './world.js';
import { theta, transfer } from './physics.js';
import { S, atTarget, burn, cargoMass, cargoOrders, dvAvail, dvWith, eng, fuelPrice, here, homePlanet, postAt, locKey, nodeName, setState, slotsUsed, targetName } from './state.js';
import { payout, route } from './graph.js';
import { econAdvance, freshDeadline, newEconomy } from './economy.js';
import { feeBlocked, localActions } from './actions.js';
import { bodyPath, defaultOrb, sysPlan, sysState } from '../map/geometry.js';
import { nearestFuel, planRoute, stepBlocker } from './planner.js';

// smallest ship that can carry n containers
export const shipFor = n => Object.values(SHIPS).filter(s=>s.slots>=n).sort((a,b)=>a.price-b.price)[0];

export function newGame(){
  setState({day:START_DAY, node:'earth.orbit', site:null, ship:'cog', fuel:SHIPS.cog.cap, used:0, credits:20000,
     visited:new Set(['earth.orbit']), flags:{delivered:0}, target:'mars', busy:false, transit:null, over:false,
     ui:{view:'main', sel:new Set(), tank:null, pick:null, route:null, auto:null, mapView:null},
     msg:'A Cog, fuelled up at the Orbital Shipyard, 20,000 Cr in the bank. Take on orders and get the cargo where it belongs.'});
  S.eco=newEconomy(); econAdvance(START_DAY);
// orders from the run-up period start with a full deadline
  S.eco.orders.forEach(o=>{ const sh=START_DAY-o.created; o.deadline+=sh; o.expires+=sh; o.created=START_DAY; });
}

export function arrive(node,site){
  S.node=node; S.visited.add(node);
  S.site = node.endsWith('.surf') ? site : null;
  if(site) S.visited.add(node.split('.')[0]+'@'+site);
  if(node==='mars.surf') S.flags.marsLanded=true;
  if(S.flags.marsLanded && node.startsWith('earth.')) S.flags.marsReturn=true;
}

// Scroll the map into view if it is currently off screen
function showMap(el){
  el = el || document.querySelector('.maptabs');
  const r=el.getBoundingClientRect();
  const visible = r.top>=0 && r.top < window.innerHeight*0.5;
  if(!visible) el.scrollIntoView({behavior: reduce?'auto':'smooth', block:'start'});
}

// The move an action sets off: path around the body, system orbit, time window.
// doAction then plays it out; anyone who only wants the picture sets it themselves.
export function planMove(a){
  const mv={from:{node:S.node, site:S.site}, to:{node:a.to, site:a.site||null}, d0:S.day, d1:S.day+a.days, hop:!!a.hop, aero:/Aerobrems/.test(a.label||'')};
  mv.orb = S.orb && S.orb.body===S.node.split('.')[0] ? {...S.orb} : null;
  mv.path = bodyPath(mv);
  mv.sys = sysPlan(mv);
  return mv;
}

export function doAction(a){
  if(S.busy || S.over || a.disabled || a.dv>dvAvail()+0.5 || feeBlocked(a)) return;
  if(a.fee) S.credits-=a.fee;
  burn(a.dv); S.busy=true;
// remember the move so the system and body views can show the ship under way
  S.move=planMove(a);
  changed();
  if(a.to && (M[a.to.split('.')[0]] && a.to.endsWith('.orbit') && !S.node.endsWith('.surf') || M[here()[0]] && a.to.endsWith('.capt'))) showMap();
  const ms = S.move.sys ? (S.move.aero ? 3400 : 2400) : S.move.path ? (a.to.endsWith('.surf')&&!a.hop ? 2600 : 1900) : Math.max(800, Math.min(1500, 400+a.days*20));
  animateTo(S.day+a.days, ms*SLOW, ()=>{
    const pth=S.move.path, spl=S.move.sys; S.move=null;
    if(spl) Object.assign(sysState(planetOfBody(a.to.split('.')[0])), spl.final);
// orbit state for the 3D view: the launch orbit after lift-off, otherwise equatorial and in front
    if(a.to.endsWith('.orbit')){ const tb=a.to.split('.')[0]; S.orb = pth && pth.finalOrb ? {...pth.finalOrb} : defaultOrb(tb); } else if(a.to.endsWith('.surf')) S.orb=null;
    arrive(a.to,a.site); S.msg=`${a.label}: ${km(a.dv)} km/s verbraucht. Jetzt: ${nodeName(a.to)}.`;
    S.busy=false; changed(); autoFill();
  });
}

export function doTransfer(b){
  const a=homePlanet(); if(S.busy || S.over || S.node!==a+'.capt') return;
  const t=transfer(a,b,S.day); if(t.total>dvAvail()) return;
  burn(t.total);
  const dep=S.day, arr=S.day+t.tof;
  S.transit={a,b,dep,arr,th0:theta(a,dep),th1:theta(b,arr)};
  S.node=null; S.busy=true; S.ui.mapView=null; S.msg=`Under way to ${B[b].name}. Arrival on ${dateStr(arr)}.`; changed(); showMap();
  animateTo(arr, 2800*SLOW, ()=>{
    S.transit=null; arrive(b+'.capt');
    S.msg=`Arrived: high orbit of ${B[b].name} after ${fmtDays(t.tof)}. Injection and capture cost ${km(t.total)} km/s.`;
    S.busy=false; changed(); autoFill();
  });
}

export function waitDays(n){
  if(S.busy || S.over) return; S.busy=true; changed(); showMap();
  animateTo(S.day+n, Math.min(2400,350+n*5)*1.3, ()=>{ S.busy=false; S.msg=`${fmtDays(n)} vergangen.`; changed(); });
}

// "Always fill up": at every depot take on as much as the tank holds and the money allows
export function autoFill(){
  if(!S.autoFill || S.busy || S.over) return false;
  const r=refuelInfo(); if(!r || r.need<0.5 || r.max<0.5) return false;
  doRefuel(r.max,true); return true;
}

function animateTo(target, ms, done){
  const d0=S.day; if(reduce) ms=Math.min(ms,150);
// Straight to the target without animating: time-lapse tools and tests switch this on.
  if(ANIM.instant){ S.anim=null; S.day=target; econAdvance(S.day); done(); return; }
  S.anim={d0, d1:target}; ANIM.active=true; ANIM.long=ms>1500; tick();
  let prog=0, last=performance.now();
  const step=now=>{
    const dt=Math.min(100,now-last); last=now;
    prog=Math.min(1, prog+dt/ms*(ANIM.fast?FAST:1));
    const p=prog, e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    S.day=d0+(target-d0)*e; tick();
    if(p<1) requestAnimationFrame(step);
    else { S.day=target; S.anim=null; ANIM.active=false; if(!S.ui.auto) ANIM.fast=false; tick(); econAdvance(S.day); done(); }
  };
  requestAnimationFrame(step);
}

function removeOrder(o){ S.eco.orders=S.eco.orders.filter(x=>x!==o); }

export function deliverOrder(o,silent){
  if(S.busy||S.over) return;
  const pay=payout(o); S.credits+=pay; removeOrder(o);
  if(o.transship){ const f=S.eco.fwd[o.to]; f[o.good]=(f[o.good]||0)+o.n; S.flags.hubDelivery=true; }
  S.flags.delivered=(S.flags.delivered||0)+1;
  if(silent) return;
  S.msg=`Delivered: ${o.n} × ${GOODS[o.good].name}. ${fmtCr(pay)} credited${pay<o.reward?' (late)':''}.`; changed();
}

export function returnOrder(o){
  if(S.busy||S.over) return;
  o.state='open'; S.msg=`Returned: ${o.n} × ${GOODS[o.good].name}. Free of charge, because you are still at the post it came from.`; changed();
}

export function abortOrder(o){
  const pen=Math.round(o.reward*0.2);
  if(S.busy||S.over||pen>S.credits) return;
  S.credits-=pen; removeOrder(o);
  if(!o.transship) S.eco.demand[o.to][o.good]=Math.min(3,S.eco.demand[o.to][o.good]+1);
  S.msg=`Order cancelled. Penalty ${fmtCr(pen)}, the cargo is lost.`; changed();
}

export function buyShip(id){
  const net=SHIPS[id].price-0.7*eng().price;
  if(S.busy||S.over||net>S.credits||slotsUsed()>SHIPS[id].slots) return;
  S.busy=true; changed();
  animateTo(S.day+5, 500, ()=>{
    S.credits-=net; S.ship=id; S.fuel=Math.min(S.fuel,eng().cap); S.flags.bought=true;
    S.msg=`New ship: ${eng().name} with ${eng().slots} cargo slots. ${fmtCr(net)} paid.`;
    S.busy=false; changed();
  });
}

export const strandCache={key:null,val:false};

export function stranded(){
  if(S.busy||S.over||!S.node) return false;
  const ri=refuelInfo();
  if(ri){ // a depot here, but no money
    if(!(ri.need>1 && ri.max<Math.min(ri.need,5)) || deliverables().length) return false;
    // Only stranded if the fuel on board is no longer enough for any order: not for the cargo aboard,
    // not for an open order from here, and not to reach another post that has orders.
    const key=['k',locKey(),Math.round(S.fuel*10),cargoMass(),S.ship,Math.floor(S.day/10)].join('|');
    if(strandCache.key!==key){
      const dv=dvAvail(), k=postAt(), me={id:'@'+locKey(), node:S.node, site:S.site};
      const cargoOk=cargoOrders().length && cargoOrders().every(o=>route(me,POST_BY_ID[o.to]).dv<=dv+0.5);
      const hereOk=k && S.eco.orders.some(o=>o.state==='open' && o.from===k.id && dvWith(S.fuel,cargoMass()+o.n*GOODS[o.good].m)>=o.dv);
// elsewhere: the approach plus the order's route must fit the fuel on board together
      const awayOk=!cargoOrders().length && POSTS.some(kk=>{ if(kk===k) return false; const d1=route(me,kk).dv; if(d1>dv+0.5) return false;
        return S.eco.orders.some(o=>o.state==='open'&&o.from===kk.id && d1+o.dv<=dvWith(S.fuel,o.n*GOODS[o.good].m)+0.5); });
      strandCache.key=key; strandCache.val=!(cargoOk||hereOk||awayOk);
    }
    return strandCache.val;
  }
  const key=[locKey(),Math.round(S.fuel*10),cargoMass(),S.ship,Math.floor(S.day/30)].join('|');
  if(strandCache.key!==key){ strandCache.key=key; strandCache.val=nearestFuel({node:S.node,site:S.site,day:S.day}).dv > dvAvail()+0.5; }
  return strandCache.val;
}

// Emergency refuelling: a tanker brings a full tank to you. Travel time depends on the region.
const RESCUE_DAYS = {shipyard:20, pavonis:90, valhalla:200};

export function rescueInfo(){
  const ri=refuelInfo(), amount=eng().cap-S.fuel;
  if(ri) return {amount, cost:Math.round(2000+ri.price*amount), days:ri.days, lift:false, local:true};
  const cost=Math.round(RESCUE_BASE+RESCUE_PER_T*amount);
  const days=RESCUE_DAYS[REGION[here()[0]]]||60;
// If not even a full tank allows any manoeuvre (the surface of Venus), the tanker lifts the ship into orbit
  const lift=!localActions().some(a=>a.to && a.dv<=dvWith(eng().cap,cargoMass())+0.5);
  return {amount,cost,days,lift};
}

export function rescue(){
  if(!stranded()) return;
  const r=rescueInfo();
  S.credits-=r.cost; S.busy=true; changed(); showMap();
  animateTo(S.day+r.days, 900, ()=>{
    S.fuel=eng().cap;
    if(r.lift){ S.node=here()[0]+'.orbit'; S.site=null; }
    S.busy=false;
    if(S.credits<BANKRUPT){ S.over=true; S.msg=`Bankrupt. Your balance stands at ${fmtCr(S.credits)}. Start again to have another go.`; }
    else if(r.local) S.msg=`Fuelled on credit: ${tons(r.amount)} for ${fmtCr(r.cost)}. Your balance is ${fmtCr(S.credits)}.`;
    else S.msg=`The tanker has arrived (${fmtDays(r.days)} travel): ${tons(r.amount)} for ${fmtCr(r.cost)}.${r.lift?' It also lifted you into orbit.':''} Your cargo is still aboard.`;
    changed();
  });
}

export function openView(v,back){ S.ui.rmsg=false; S.ui.back = v==='main' ? null : (back||null); S.ui.view=v; S.ui.sel=new Set(); S.ui.tank=null; changed();
  if(isDesk()){ const cs=document.querySelector('.col-side'); if(cs) cs.scrollTop=0; } else window.scrollTo({top:0}); }

export function refuelInfo(){
  if(!S.node) return null;
  const [k,l]=here(), st=l==='surf'?siteOf(k,S.site):null, days=st?st.depot:DEPOTS[S.node], price=fuelPrice();
  if(days===undefined || price===undefined) return null;
  const need=Math.max(0,eng().cap-S.fuel), afford=Math.max(0,S.credits)/price;
  return {days, price, need, max:Math.min(need,afford), source: st?(k==='earth'?'Refuelling at the spaceport':'Propellant from local ice'):'Orbital fuel depot'};
}

export function doRefuel(amount,keepView){
  const r=refuelInfo(); if(!r || S.busy || S.over) return;
  amount=Math.min(amount,r.max); if(amount<0.1) return;
  const cost=Math.round(amount*r.price);
  S.busy=true; if(!keepView){ const back=S.ui.view==='refuel'?S.ui.back:null; S.ui.view=back||'main'; S.ui.back=null; } changed();
  animateTo(S.day+r.days, Math.min(1200,300+r.days*15), ()=>{
    S.fuel=Math.min(eng().cap,S.fuel+amount); S.credits-=cost; S.flags['refuel:'+here()[0]+'@'+S.site]=true;
    S.msg=`Fuelled: ${tons(amount)} for ${fmtCr(cost)}. ${km(dvAvail())} km/s available.`; S.busy=false; changed();
  });
}

// The most delta-v the cargo on board needs from here
export function routeNeedHere(){
  if(!S.node) return 0;
  const me={id:'@'+locKey(), node:S.node, site:S.site};
  return cargoOrders().reduce((mx,o)=>Math.max(mx, POST_BY_ID[o.to]===postAt()?0:route(me,POST_BY_ID[o.to]).dv),0);
}

export const fuelFor = (dv,cm) => (eng().dry+cm)*(Math.exp(dv/(eng().isp*G0))-1);

export const deliverables = () => { const k=postAt(); return k ? cargoOrders().filter(o=>o.to===k.id) : []; };

export function deliverAll(){ const list=deliverables(); if(!list.length||S.busy||S.over) return;
  let sum=0; list.forEach(o=>{ sum+=payout(o); deliverOrder(o,true); });
  S.msg=`${list.length} ${list.length>1?'orders':'order'} delivered, ${fmtCr(sum)} credited.`; changed(); }

export function acceptSelected(){
  const k=postAt(); if(!k||S.busy||S.over) return;
  const list=S.eco.orders.filter(o=>S.ui.sel.has(o.id) && o.state==='open' && o.from===k.id);
  const n=list.reduce((s,o)=>s+o.n,0); if(!list.length || slotsUsed()+n>eng().slots) return;
  list.forEach(o=>{ o.deadline=freshDeadline(o,S.day); o.created=S.day; o.state='aboard'; });
  S.msg=`${list.length} ${list.length>1?'orders':'order'} accepted, ${n} containers loaded.`;
  openView('cargo');
}

const SAVE_KEY='transferorbit-v3', SLOT_KEY='transferorbit-slot1';
const OLD_SAVE_KEY='transferfenster-v2', OLD_SLOT_KEY='transferfenster-slot1';

// Saves written before the code was translated carry the old German ids. Everything
// else in a save is language-neutral, so one lookup per kind is enough. Runs before
// the sanity check below, which would otherwise reject an old save outright.
const OLD_IDS = {
  ship: {kogge:'cog', holk:'hulk', hulk:'galleon', karacke:'carrack'},
  site: {nordpol:'northpole', tigerstreifen:'tigerstripes', aeqator:'equator'},
  post: {erde:'earth', werft:'shipyard', marsnord:'marsnorth', ceresnord:'ceresnorth'},
};

function migrate(o){
  const site = s => OLD_IDS.site[s] || s, post = p => OLD_IDS.post[p] || p;
  o.ship = OLD_IDS.ship[o.ship] || o.ship;
  if(o.site) o.site = site(o.site);
  if(Array.isArray(o.visited)) o.visited = o.visited.map(v=>{
    const i = v.indexOf('@'); return i<0 ? v : v.slice(0,i+1) + site(v.slice(i+1)); });
  const eco = o.eco; if(!eco) return o;
  (eco.orders||[]).forEach(x=>{ x.from = post(x.from); x.to = post(x.to); });
  for(const field of ['stock','demand','fwd']) if(eco[field])
    eco[field] = Object.fromEntries(Object.entries(eco[field]).map(([k,v])=>[post(k),v]));
  return o;
}

export function save(){
  if(S.busy||!S.node) return;
  try{ const o={...S, visited:[...S.visited]}; delete o.transit; delete o.ui; delete o.move; delete o.anim; delete o.msg; localStorage.setItem(SAVE_KEY, JSON.stringify(o)); }catch(e){}
}

let memSlot=null; // fallback for when the browser blocks localStorage

export function load(key){
  try{
    const slot = key===SLOT_KEY;
    let t=null; try{ t=localStorage.getItem(key||SAVE_KEY) ?? localStorage.getItem(slot?OLD_SLOT_KEY:OLD_SAVE_KEY); }catch(e){}
    if(!t && slot) t=memSlot;
    if(!t) return false;
    const o=migrate(JSON.parse(t)); if(!o.eco || !SHIPS[o.ship] || !o.node) return false;
    setState({...o, visited:new Set(o.visited), busy:false, transit:null, move:null, anim:null, ui:{view:'main', sel:new Set(), tank:null, pick:null, route:null, auto:null, mapView:null}});
    S.msg='Game loaded.'; return true;
  }catch(e){ return false; }
}

export function execStep(st){
  if(!st || S.busy || S.over) return false;
  if(st.kind==='wait'){ const [a,b]=st.leg, t=transfer(a,b,S.day); if(t.d<0.04) return true; waitDays(t.wait); return true; }
  if(st.kind==='leg'){ const hp=homePlanet(); if(S.node!==hp+'.capt' || transfer(hp,st.leg[1],S.day).total>dvAvail()) return false; doTransfer(st.leg[1]); return true; }
  const a=localActions().find(a=>a.to===st.node && (a.site||null)===(st.site||null) && Math.abs(a.dv-st.dv)<1);
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
export function stopAutopilot(msg,arrived){ S.ui.auto=null; if(!ANIM.active) ANIM.fast=false; if(msg) S.msg=msg;
  if(arrived && S.ui.view==='route'){ S.ui.view='main'; S.ui.back=null; } changed(); }

function autoTick(){
  const A=S.ui.auto; if(!A) return;
  if(S.busy){ setTimeout(autoTick,250); return; }
  if(S.over) return stopAutopilot();
  if(atTarget(A.target)) return stopAutopilot(`Autopilot: target reached, ${targetName(A.target)}.${deliverables().length?' Cargo can be delivered here.':''}`,true);
  if(locKey()!==A.start && deliverables().length) return stopAutopilot(`Autopilot stopped: cargo can be delivered here at ${postAt().name}.`,true);
  const plan=planRoute(A.target,A.mode);
  if(!plan || !plan.steps.length) return stopAutopilot('Autopilot: no route found.');
  const st=plan.steps[0];
  if(st.kind!=='wait' && st.dv>dvAvail()+0.5) return stopAutopilot(`Autopilot stopped: "${st.label}" needs ${km(st.dv)} km/s, you have ${km(dvAvail())}. Refuel or drop cargo.`);
  if(!execStep(st)) return stopAutopilot(`Autopilot stopped at "${st.label}": ${stepBlocker(st)}`);
  A.start=null; // after the first step every post with a delivery counts as a stop
  setTimeout(autoTick,300);
}

export function resetGame(){ S.ui.auto=null; if(S.busy){ S.msg='Please wait a moment, the ship is under way.'; changed(); return; } try{ localStorage.removeItem(SAVE_KEY); }catch(e){} newGame(); changed(); }

export function saveSlot(){
  if(S.busy||!S.node){ S.msg='Saving only works while the ship is stationary.'; changed(); return; }
  const o={...S, visited:[...S.visited]}; delete o.transit; delete o.ui; delete o.move; delete o.anim;
  memSlot=JSON.stringify(o);
  try{ localStorage.setItem(SLOT_KEY, memSlot); S.msg=`Saved: ${dateStr(S.day)}, ${fmtCr(S.credits)}.`; }
  catch(e){ S.msg=`Saved for this session only: ${dateStr(S.day)}, ${fmtCr(S.credits)}. The browser does not allow permanent storage.`; }
  changed();
}

export function loadSlot(){
  if(S.busy) return;
  if(!load(SLOT_KEY)){ S.msg='No saved game found.'; changed(); return; }
  S.msg=`Game loaded: ${dateStr(S.day)}, ${fmtCr(S.credits)}.`; changed();
}
