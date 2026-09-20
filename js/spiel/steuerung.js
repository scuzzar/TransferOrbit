// Die Kommandos. Alles, was den Spielstand ändert, steht hier und meldet
// sich danach mit geaendert(). Kennt keine Anzeige.

import { geaendert, zeitLief } from '../ereignisse.js';
import { ANIM, FAST, SLOW, dateStr, fmtDays, isDesk, km, reduce, tons } from '../basis.js';
import { B, BANKRUPT, DEPOTS, G0, GOODS, KBY, KONTORE, M, REGION, RESCUE_BASE, RESCUE_PER_T, SHIPS, START_DAY, fmtCr, kontorLabel, planetOfBody, siteOf } from './welt.js';
import { theta, transfer } from './physik.js';
import { S, atTarget, burn, cargoMass, cargoOrders, dvAvail, dvWith, eng, fuelPrice, here, homePlanet, kontorAt, locKey, nodeName, setzeStand, slotsUsed, targetName } from './zustand.js';
import { payout, route } from './graph.js';
import { econAdvance, freshDeadline, newEconomy } from './wirtschaft.js';
import { feeBlocked, localActions } from './aktionen.js';
import { bodyPath, defaultOrb, sysPlan, sysState } from '../karte/geometrie.js';
import { nearestFuel, planRoute, stepBlocker } from './planer.js';

// kleinstes Schiff, das n Container laden kann
export const shipFor = n => Object.values(SHIPS).filter(s=>s.slots>=n).sort((a,b)=>a.price-b.price)[0];

export function newGame(){
  setzeStand({day:START_DAY, node:'earth.orbit', site:null, ship:'kogge', fuel:SHIPS.kogge.cap, used:0, credits:20000,
     visited:new Set(['earth.orbit']), flags:{delivered:0}, target:'mars', busy:false, transit:null, over:false,
     ui:{view:'main', sel:new Set(), tank:null, pick:null, route:null, auto:null, mapView:null},
     msg:'Kogge vollgetankt an der Orbitalwerft, 20.000 Cr in der Kasse. Nimm Aufträge an und bring die Fracht ans Ziel.'});
  S.eco=newEconomy(); econAdvance(START_DAY);
  // Aufträge aus der Vorlaufzeit starten mit voller Frist
  S.eco.orders.forEach(o=>{ const sh=START_DAY-o.created; o.deadline+=sh; o.expires+=sh; o.created=START_DAY; });
}

export function arrive(node,site){
  S.node=node; S.visited.add(node);
  S.site = node.endsWith('.surf') ? site : null;
  if(site) S.visited.add(node.split('.')[0]+'@'+site);
  if(node==='mars.surf') S.flags.marsLanded=true;
  if(S.flags.marsLanded && node.startsWith('earth.')) S.flags.marsReturn=true;
}

// Karte ins Blickfeld holen, falls sie gerade nicht sichtbar ist
function showMap(el){
  el = el || document.querySelector('.maptabs');
  const r=el.getBoundingClientRect();
  const visible = r.top>=0 && r.top < window.innerHeight*0.5;
  if(!visible) el.scrollIntoView({behavior: reduce?'auto':'smooth', block:'start'});
}

// Der Zug, den eine Aktion auslöst: Weg um den Körper, Systembahn, Zeitfenster.
// doAction lässt ihn danach ablaufen; wer nur das Bild braucht, setzt ihn selbst.
export function bewegungPlanen(a){
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
  // Bewegung merken, damit System- und Körperansicht das Schiff unterwegs zeigen
  S.move=bewegungPlanen(a);
  geaendert();
  if(a.to && (M[a.to.split('.')[0]] && a.to.endsWith('.orbit') && !S.node.endsWith('.surf') || M[here()[0]] && a.to.endsWith('.capt'))) showMap();
  const ms = S.move.sys ? (S.move.aero ? 3400 : 2400) : S.move.path ? (a.to.endsWith('.surf')&&!a.hop ? 2600 : 1900) : Math.max(800, Math.min(1500, 400+a.days*20));
  animateTo(S.day+a.days, ms*SLOW, ()=>{
    const pth=S.move.path, spl=S.move.sys; S.move=null;
    if(spl) Object.assign(sysState(planetOfBody(a.to.split('.')[0])), spl.final);
    // Orbitzustand für die 3D-Ansicht: nach dem Start die Startbahn, sonst äquatorial vorne
    if(a.to.endsWith('.orbit')){ const tb=a.to.split('.')[0]; S.orb = pth && pth.finalOrb ? {...pth.finalOrb} : defaultOrb(tb); } else if(a.to.endsWith('.surf')) S.orb=null;
    arrive(a.to,a.site); S.msg=`${a.label}: ${km(a.dv)} km/s verbraucht. Jetzt: ${nodeName(a.to)}.`;
    S.busy=false; geaendert(); autoFill();
  });
}

export function doTransfer(b){
  const a=homePlanet(); if(S.busy || S.over || S.node!==a+'.capt') return;
  const t=transfer(a,b,S.day); if(t.total>dvAvail()) return;
  burn(t.total);
  const dep=S.day, arr=S.day+t.tof;
  S.transit={a,b,dep,arr,th0:theta(a,dep),th1:theta(b,arr)};
  S.node=null; S.busy=true; S.ui.mapView=null; S.msg=`Unterwegs nach ${B[b].name}. Ankunft am ${dateStr(arr)}.`; geaendert(); showMap();
  animateTo(arr, 2800*SLOW, ()=>{
    S.transit=null; arrive(b+'.capt');
    S.msg=`Angekommen: hoher Orbit um ${B[b].name} nach ${fmtDays(t.tof)}. Einschuss und Einfang kosteten ${km(t.total)} km/s.`;
    S.busy=false; geaendert(); autoFill();
  });
}

export function waitDays(n){
  if(S.busy || S.over) return; S.busy=true; geaendert(); showMap();
  animateTo(S.day+n, Math.min(2400,350+n*5)*1.3, ()=>{ S.busy=false; S.msg=`${fmtDays(n)} vergangen.`; geaendert(); });
}

// „Immer volltanken“: an jeder Tankstelle so viel tanken, wie in den Tank passt und bezahlbar ist
export function autoFill(){
  if(!S.autoFill || S.busy || S.over) return false;
  const r=refuelInfo(); if(!r || r.need<0.5 || r.max<0.5) return false;
  doRefuel(r.max,true); return true;
}

function animateTo(target, ms, done){
  const d0=S.day; if(reduce) ms=Math.min(ms,150);
  // Ohne Animation direkt ans Ziel: Zeitraffer-Werkzeuge und Tests schalten das an.
  if(ANIM.sofort){ S.anim=null; S.day=target; econAdvance(S.day); done(); return; }
  S.anim={d0, d1:target}; ANIM.active=true; ANIM.long=ms>1500; zeitLief();
  let prog=0, last=performance.now();
  const step=now=>{
    const dt=Math.min(100,now-last); last=now;
    prog=Math.min(1, prog+dt/ms*(ANIM.fast?FAST:1));
    const p=prog, e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    S.day=d0+(target-d0)*e; zeitLief();
    if(p<1) requestAnimationFrame(step);
    else { S.day=target; S.anim=null; ANIM.active=false; if(!S.ui.auto) ANIM.fast=false; zeitLief(); econAdvance(S.day); done(); }
  };
  requestAnimationFrame(step);
}

export function acceptOrder(o){
  if(S.busy||S.over) return;
  const k=kontorAt(); if(!k || k.id!==o.from || o.state!=='open') return;
  if(slotsUsed()+o.n>eng().slots) return;
  o.deadline=freshDeadline(o,S.day); o.created=S.day;
  o.state='aboard'; S.msg=`Angenommen: ${o.n} × ${GOODS[o.good].name} nach ${kontorLabel(KBY[o.to])}. Frist ${dateStr(o.deadline)}.`; geaendert();
}

function removeOrder(o){ S.eco.orders=S.eco.orders.filter(x=>x!==o); }

export function deliverOrder(o,silent){
  if(S.busy||S.over) return;
  const pay=payout(o); S.credits+=pay; removeOrder(o);
  if(o.transship){ const f=S.eco.fwd[o.to]; f[o.good]=(f[o.good]||0)+o.n; S.flags.hubDelivery=true; }
  S.flags.delivered=(S.flags.delivered||0)+1;
  if(silent) return;
  S.msg=`Abgeliefert: ${o.n} × ${GOODS[o.good].name}. ${fmtCr(pay)} gutgeschrieben${pay<o.reward?' (verspätet)':''}.`; geaendert();
}

export function returnOrder(o){
  if(S.busy||S.over) return;
  o.state='open'; S.msg=`Zurückgegeben: ${o.n} × ${GOODS[o.good].name}. Kostenlos, weil du noch am Startkontor bist.`; geaendert();
}

export function abortOrder(o){
  const pen=Math.round(o.reward*0.2);
  if(S.busy||S.over||pen>S.credits) return;
  S.credits-=pen; removeOrder(o);
  if(!o.transship) S.eco.demand[o.to][o.good]=Math.min(3,S.eco.demand[o.to][o.good]+1);
  S.msg=`Auftrag abgebrochen. Strafe ${fmtCr(pen)}, die Ladung ist verloren.`; geaendert();
}

export function buyShip(id){
  const net=SHIPS[id].price-0.7*eng().price;
  if(S.busy||S.over||net>S.credits||slotsUsed()>SHIPS[id].slots) return;
  S.busy=true; geaendert();
  animateTo(S.day+5, 500, ()=>{
    S.credits-=net; S.ship=id; S.fuel=Math.min(S.fuel,eng().cap); S.flags.bought=true;
    S.msg=`Neues Schiff: ${eng().name} mit ${eng().slots} Frachtplätzen. ${fmtCr(net)} bezahlt.`;
    S.busy=false; geaendert();
  });
}

export const strandCache={key:null,val:false};

export function stranded(){
  if(S.busy||S.over||!S.node) return false;
  const ri=refuelInfo();
  if(ri){ // Tankstelle hier, aber kein Geld
    if(!(ri.need>1 && ri.max<Math.min(ri.need,5)) || deliverables().length) return false;
    // Nur gestrandet, wenn der Treibstoff an Bord für keinen Auftrag mehr reicht: weder für die Fracht an Bord
    // noch für einen offenen Auftrag von hier noch bis zu einem anderen Kontor mit Aufträgen.
    const key=['k',locKey(),Math.round(S.fuel*10),cargoMass(),S.ship,Math.floor(S.day/10)].join('|');
    if(strandCache.key!==key){
      const dv=dvAvail(), k=kontorAt(), me={id:'@'+locKey(), node:S.node, site:S.site};
      const cargoOk=cargoOrders().length && cargoOrders().every(o=>route(me,KBY[o.to]).dv<=dv+0.5);
      const hereOk=k && S.eco.orders.some(o=>o.state==='open' && o.from===k.id && dvWith(S.fuel,cargoMass()+o.n*GOODS[o.good].m)>=o.dv);
      // Anderswo: Anfahrt plus Auftragsroute müssen zusammen mit dem Treibstoff an Bord machbar sein
      const awayOk=!cargoOrders().length && KONTORE.some(kk=>{ if(kk===k) return false; const d1=route(me,kk).dv; if(d1>dv+0.5) return false;
        return S.eco.orders.some(o=>o.state==='open'&&o.from===kk.id && d1+o.dv<=dvWith(S.fuel,o.n*GOODS[o.good].m)+0.5); });
      strandCache.key=key; strandCache.val=!(cargoOk||hereOk||awayOk);
    }
    return strandCache.val;
  }
  const key=[locKey(),Math.round(S.fuel*10),cargoMass(),S.ship,Math.floor(S.day/30)].join('|');
  if(strandCache.key!==key){ strandCache.key=key; strandCache.val=nearestFuel({node:S.node,site:S.site,day:S.day}).dv > dvAvail()+0.5; }
  return strandCache.val;
}

// Notbetankung: ein Tanker bringt vor Ort einen vollen Tank. Anfahrt je nach Region.
const RESCUE_DAYS = {werft:20, pavonis:90, valhalla:200};

export function rescueInfo(){
  const ri=refuelInfo(), amount=eng().cap-S.fuel;
  if(ri) return {amount, cost:Math.round(2000+ri.price*amount), days:ri.days, lift:false, local:true};
  const cost=Math.round(RESCUE_BASE+RESCUE_PER_T*amount);
  const days=RESCUE_DAYS[REGION[here()[0]]]||60;
  // Reicht selbst ein voller Tank für kein Manöver (Venus-Oberfläche), hebt der Tanker das Schiff in den Orbit
  const lift=!localActions().some(a=>a.to && a.dv<=dvWith(eng().cap,cargoMass())+0.5);
  return {amount,cost,days,lift};
}

export function rescue(){
  if(!stranded()) return;
  const r=rescueInfo();
  S.credits-=r.cost; S.busy=true; geaendert(); showMap();
  animateTo(S.day+r.days, 900, ()=>{
    S.fuel=eng().cap;
    if(r.lift){ S.node=here()[0]+'.orbit'; S.site=null; }
    S.busy=false;
    if(S.credits<BANKRUPT){ S.over=true; S.msg=`Konkurs. Dein Kontostand liegt bei ${fmtCr(S.credits)}. Starte neu, um es noch einmal zu versuchen.`; }
    else if(r.local) S.msg=`Auf Kredit getankt: ${tons(r.amount)} für ${fmtCr(r.cost)}. Dein Konto steht bei ${fmtCr(S.credits)}.`;
    else S.msg=`Der Tanker ist da (${fmtDays(r.days)} Anfahrt): ${tons(r.amount)} für ${fmtCr(r.cost)}.${r.lift?' Der Tanker hat dich außerdem in den Orbit gehoben.':''} Deine Fracht ist noch an Bord.`;
    geaendert();
  });
}

export const BACKNAME = {main:'Karte', kontor:'Auftragsbrett', fracht:'Laderaum', route:'Route'};

export function openView(v,back){ S.ui.rmsg=false; S.ui.back = v==='main' ? null : (back||null); S.ui.view=v; S.ui.sel=new Set(); S.ui.tank=null; geaendert();
  if(isDesk()){ const cs=document.querySelector('.col-side'); if(cs) cs.scrollTop=0; } else window.scrollTo({top:0}); }

export function refuelInfo(){
  if(!S.node) return null;
  const [k,l]=here(), st=l==='surf'?siteOf(k,S.site):null, days=st?st.depot:DEPOTS[S.node], price=fuelPrice();
  if(days===undefined || price===undefined) return null;
  const need=Math.max(0,eng().cap-S.fuel), afford=Math.max(0,S.credits)/price;
  return {days, price, need, max:Math.min(need,afford), source: st?(k==='earth'?'Betankung am Weltraumbahnhof':'Treibstoff aus lokalem Eis'):'Tankdepot im Orbit'};
}

export function doRefuel(amount,keepView){
  const r=refuelInfo(); if(!r || S.busy || S.over) return;
  amount=Math.min(amount,r.max); if(amount<0.1) return;
  const cost=Math.round(amount*r.price);
  S.busy=true; if(!keepView){ const back=S.ui.view==='tanken'?S.ui.back:null; S.ui.view=back||'main'; S.ui.back=null; } geaendert();
  animateTo(S.day+r.days, Math.min(1200,300+r.days*15), ()=>{
    S.fuel=Math.min(eng().cap,S.fuel+amount); S.credits-=cost; S.flags['refuel:'+here()[0]+'@'+S.site]=true;
    S.msg=`Getankt: ${tons(amount)} für ${fmtCr(cost)}. ${km(dvAvail())} km/s verfügbar.`; S.busy=false; geaendert();
  });
}

// Δv, das die Fracht an Bord von hier aus höchstens braucht
export function routeNeedHere(){
  if(!S.node) return 0;
  const me={id:'@'+locKey(), node:S.node, site:S.site};
  return cargoOrders().reduce((mx,o)=>Math.max(mx, KBY[o.to]===kontorAt()?0:route(me,KBY[o.to]).dv),0);
}

export const fuelFor = (dv,cm) => (eng().dry+cm)*(Math.exp(dv/(eng().isp*G0))-1);

export const deliverables = () => { const k=kontorAt(); return k ? cargoOrders().filter(o=>o.to===k.id) : []; };

export function deliverAll(){ const list=deliverables(); if(!list.length||S.busy||S.over) return;
  let sum=0; list.forEach(o=>{ sum+=payout(o); deliverOrder(o,true); });
  S.msg=`${list.length} ${list.length>1?'Aufträge':'Auftrag'} abgeliefert, ${fmtCr(sum)} gutgeschrieben.`; geaendert(); }

export function acceptSelected(){
  const k=kontorAt(); if(!k||S.busy||S.over) return;
  const list=S.eco.orders.filter(o=>S.ui.sel.has(o.id) && o.state==='open' && o.from===k.id);
  const n=list.reduce((s,o)=>s+o.n,0); if(!list.length || slotsUsed()+n>eng().slots) return;
  list.forEach(o=>{ o.deadline=freshDeadline(o,S.day); o.created=S.day; o.state='aboard'; });
  S.msg=`${list.length} ${list.length>1?'Aufträge':'Auftrag'} angenommen, ${n} Container geladen.`;
  openView('fracht');
}

const SAVE_KEY='transferfenster-v2', SLOT_KEY='transferfenster-slot1';

export function save(){
  if(S.busy||!S.node) return;
  try{ const o={...S, visited:[...S.visited]}; delete o.transit; delete o.ui; delete o.move; delete o.anim; localStorage.setItem(SAVE_KEY, JSON.stringify(o)); }catch(e){}
}

let memSlot=null; // Rückfall, wenn der Browser localStorage sperrt

export function load(key){
  try{
    let t=null; try{ t=localStorage.getItem(key||SAVE_KEY); }catch(e){}
    if(!t && key===SLOT_KEY) t=memSlot;
    if(!t) return false;
    const o=JSON.parse(t); if(!o.eco || !SHIPS[o.ship] || !o.node) return false;
    setzeStand({...o, visited:new Set(o.visited), busy:false, transit:null, move:null, anim:null, ui:{view:'main', sel:new Set(), tank:null, pick:null, route:null, auto:null, mapView:null}});
    S.msg='Spielstand geladen.'; return true;
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
  // Desktop: Fahrplan bleibt offen. Mobil: zurück zur Karte, damit man den Flug sieht.
  if(!isDesk()){ S.ui.view='main'; geaendert(); window.scrollTo({top:0}); } else geaendert();
  setTimeout(autoTick,200);
}

// arrived=true: am Ziel oder an einem Lieferkontor angehalten → zurück zur Karte, damit der Standort (Abliefern, Aufträge, Tanken) sichtbar ist
export function stopAutopilot(msg,arrived){ S.ui.auto=null; if(!ANIM.active) ANIM.fast=false; if(msg) S.msg=msg;
  if(arrived && S.ui.view==='route'){ S.ui.view='main'; S.ui.back=null; } geaendert(); }

function autoTick(){
  const A=S.ui.auto; if(!A) return;
  if(S.busy){ setTimeout(autoTick,250); return; }
  if(S.over) return stopAutopilot();
  if(atTarget(A.target)) return stopAutopilot(`Autopilot: Ziel erreicht, ${targetName(A.target)}.${deliverables().length?' Fracht kann hier abgeliefert werden.':''}`,true);
  if(locKey()!==A.start && deliverables().length) return stopAutopilot(`Autopilot angehalten: Hier in ${kontorAt().name} kann Fracht abgeliefert werden.`,true);
  const plan=planRoute(A.target,A.mode);
  if(!plan || !plan.steps.length) return stopAutopilot('Autopilot: Keine Route gefunden.');
  const st=plan.steps[0];
  if(st.kind!=='wait' && st.dv>dvAvail()+0.5) return stopAutopilot(`Autopilot angehalten: Für „${st.label}“ brauchst du ${km(st.dv)} km/s, du hast ${km(dvAvail())}. Tanke oder wirf Fracht ab.`);
  if(!execStep(st)) return stopAutopilot(`Autopilot angehalten bei „${st.label}“: ${stepBlocker(st)}`);
  A.start=null; // nach dem ersten Schritt zählt jeder Kontor mit Lieferung als Halt
  setTimeout(autoTick,300);
}

export function resetGame(){ S.ui.auto=null; if(S.busy){ S.msg='Bitte kurz warten, das Schiff ist gerade unterwegs.'; geaendert(); return; } try{ localStorage.removeItem(SAVE_KEY); }catch(e){} newGame(); geaendert(); }

export function saveSlot(){
  if(S.busy||!S.node){ S.msg='Speichern geht nur, wenn das Schiff steht.'; geaendert(); return; }
  const o={...S, visited:[...S.visited]}; delete o.transit; delete o.ui; delete o.move; delete o.anim;
  memSlot=JSON.stringify(o);
  try{ localStorage.setItem(SLOT_KEY, memSlot); S.msg=`Gespeichert: ${dateStr(S.day)}, ${fmtCr(S.credits)}.`; }
  catch(e){ S.msg=`Gespeichert für diese Sitzung: ${dateStr(S.day)}, ${fmtCr(S.credits)}. Der Browser erlaubt kein dauerhaftes Speichern.`; }
  geaendert();
}

export function loadSlot(){
  if(S.busy) return;
  if(!load(SLOT_KEY)){ S.msg='Kein gespeicherter Spielstand gefunden.'; geaendert(); return; }
  S.msg=`Spielstand geladen: ${dateStr(S.day)}, ${fmtCr(S.credits)}.`; geaendert();
}
