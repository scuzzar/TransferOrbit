// The panels: trading post, cargo hold, refuelling, shipyard, route; ship and pilot, youth clinic, leaderboard.

import { changed } from '../events.js';
import { dateStr, esc, fmtDays, isDesk, km, tons, byId, find } from '../basics.js';
import { BODIES, DEPOT_LIST, G0, GOODS, HUB_CAP, NAME_MAX, PRESETS, Preset, RISK_AGE, SHIPS, START_AGE, YEAR_PRICE, bodyName, fmtCr, isNode, siteOf, splitNode } from '../game/world.js';
import { Hub, Order, S, postLabel, postPlace, yearlyRisk } from '../game/state.js';
import { hubRoom } from '../game/economy.js';
import { Leg, draftPlan, nearestFuel, pinTransfer, planRoute, replan, schedule, stepBlocker, switchStep, unpin } from '../game/planner.js';
import { abortOrder, acceptOrders, buyShip, buyYear, clinicHere, deliverAll, deliverOrder, deliverables, doRefuel, execStep, refuelInfo, leaderboard, rename, rescue, rescueInfo, resetGame, returnOrder, routeNeedHere, shipFor, startAutopilot, stopAutopilot, stranded } from '../game/commands.js';
import { UI } from './state.js';
import { btn, dots, fuelTag, gchip, ibtn, lifeLine, openRoute, openView, pct, phead, routeLink, yrs } from './widgets.js';
import { transferMap } from './transfermap.js';

// Take the ticked orders aboard and show them in the cargo hold
export function acceptSelected(){ if(acceptOrders(UI.sel)) openView('cargo'); }

function panelPost(p:HTMLElement){
  const k=(S.player.ship.near ? S.market.at(S.player.ship.near) : null); if(!k){ openView('main'); return; }
  const post=S.market.post(k.id), locked=!S.canAct, free=S.player.ship.def.slots-S.player.ship.slotsUsed;
  p.appendChild(phead(`${k.name} Trading Post`, `${esc(postPlace(k))}. ${fmtCr(S.player.credits)}, ${free} cargo ${free===1?'slot':'slots'} free.`, (k instanceof Hub)?'Hub':''));
  const del=deliverables();
  if(del.length){
    const b=document.createElement('div'); b.className='banner';
    b.innerHTML=`<span>${del.length} ${del.length>1?'orders':'order'} on board ${del.length>1?'go':'goes'} here.</span>`;
    b.appendChild(btn(`Deliver, ${fmtCr(del.reduce((s,o)=>s+o.payout(S.day),0))}`,'go',locked,deliverAll)); p.appendChild(b);
  }
  const sel=post.offers.filter(o=>UI.sel.has(o.id));
  const selN=sel.reduce((s,o)=>s+o.containers,0), selM=sel.reduce((s,o)=>s+o.containers*GOODS[o.good].mass,0), selR=sel.reduce((s,o)=>s+o.reward,0);
  const offers=post.offers;
  const h=document.createElement('h3'); h.textContent=`Orders from here (${offers.length})`; p.appendChild(h);
  const bigHere=offers.filter(o=>o.containers>S.player.ship.def.slots);
  if(bigHere.length){ const hb=document.createElement('p'); hb.className='hint';
    hb.textContent=`${bigHere.length} bulk ${bigHere.length>1?'orders do':'order does'} not fit in your ${S.player.ship.def.name} (${S.player.ship.def.slots} slots). Larger ships are sold at the shipyards of the hubs.`; p.appendChild(hb); }
  const list=document.createElement('div'); list.className='ogroups';
  if(!offers.length) list.innerHTML='<p class="hint">No orders right now. The stores fill up over time.</p>';
  // Group by destination, sort the groups by the delta-v of the route
  const groups=new Map<string,[Order,...Order[]]>();
  offers.forEach(o=>{ const g=groups.get(o.to); if(g) g.push(o); else groups.set(o.to,[o]); });
  const glist=[...groups].map(([to,os])=>{
    const tk=S.market.post(to), tpl=planRoute(tk.at,'economical');
    return {tk, os:os.sort((a,b)=>b.reward-a.reward), tpl, dv:tpl?tpl.dv:os[0].dv, days:tpl?tpl.days:os[0].days};
  }).sort((a,b)=>a.dv-b.dv);
  glist.forEach(dest=>{
    const {tk,os,tpl}=dest, due=os.reduce((a,o)=>o.deadline<a.deadline?o:a), dl=due.deadline, lateBy=tpl?tpl.arrive-dl:0;
    const gSel=os.filter(o=>UI.sel.has(o.id));
    const lightest=os.filter(o=>!UI.sel.has(o.id)).reduce((m,o)=>Math.min(m,o.containers*GOODS[o.good].mass),Infinity);
    const after = gSel.length ? S.player.ship.dvWith(S.player.ship.fuel,S.player.ship.cargoMass+selM) : S.player.ship.dvWith(S.player.ship.fuel,S.player.ship.cargoMass+selM+(isFinite(lightest)?lightest:0));
    const short = after < dest.dv;
    const afterFull = gSel.length ? S.player.ship.dvWith(S.player.ship.def.cap,S.player.ship.cargoMass+selM) : S.player.ship.dvWith(S.player.ship.def.cap,S.player.ship.cargoMass+selM+(isFinite(lightest)?lightest:0));
    const grp=document.createElement('section'); grp.className='ogroup'+(gSel.length?' on':'');
    const nDel=S.player.ship.hold.filter(o=>o.to===tk.id).length;
    grp.innerHTML=`<div class="og-head"><div class="og-title"><b>${esc(postLabel(tk))}</b>${(tk instanceof Hub)?' <span class="tag">Hub</span>':''} ${fuelTag(tk.at)}${nDel?` <span class="mtag deliver">${nDel} already on board</span>`:''}</div>
      <div class="og-meta"><span class="${short?'badc':''}">${km(dest.dv)} km/s</span><span>${fmtDays(dest.days)}</span><span class="${lateBy>0?'badc':''}">Due ${dateStr(dl)}</span></div>
      ${tpl&&lateBy>0?`<div class="o-warn">Waiting for the window arrives ${dateStr(tpl.arrive)}, too late. On time takes about ${km(due.dv)} km/s, and the order pays for that.</div>`:
        short?`<div class="o-warn">${gSel.length?'With your selection':'Even with the lightest order'} you would have ${km(after)} km/s left. ${afterFull<dest.dv?`Too heavy: even with a full tank it would only be ${km(afterFull)} km/s.`:'Refuel first.'}</div>`:''}</div>`;
    const rl=routeLink(tk,'post'); rl.style.marginLeft='auto'; find(grp,'.og-meta',HTMLElement).appendChild(rl);
    os.forEach(o=>{
      const Gd=GOODS[o.good], on=UI.sel.has(o.id), fits=on || S.player.ship.slotsUsed+selN+o.containers<=S.player.ship.def.slots;
      const el=document.createElement('label'); el.className='orow'+(on?' on':'')+(fits?'':' dis');
      const tooBig=o.containers>S.player.ship.def.slots, need=tooBig?shipFor(o.containers):null;
      const why = fits ? '' : tooBig ? `, needs ${o.containers} slots: ${need?need.name+' or larger':'no ship is large enough'}` : `, needs ${o.containers} ${o.containers>1?'slots':'slot'}`;
      el.innerHTML=`<input type="checkbox" ${on?'checked':''} ${(!fits||locked)?'disabled':''}>${gchip(o.good)}<span class="ot"><b>${o.containers} × ${Gd.name}${o.isBulk?' <span class="mtag post">Bulk order</span>':''}</b><small>${tons(o.containers*Gd.mass)}${why}</small></span><span class="num">${fmtCr(o.reward)}</span>`;
      const cb=find(el,'input',HTMLInputElement); cb.onchange=()=>{ cb.checked?UI.sel.add(o.id):UI.sel.delete(o.id); changed(); };
      grp.appendChild(el);
    });
    list.appendChild(grp);
  });
  p.appendChild(list);

  if(k.industry.needs.length){
    const h2=document.createElement('h3'); h2.textContent='Wanted here'; p.appendChild(h2);
    const g=document.createElement('div'); g.className='needgrid';
    g.innerHTML=k.industry.needs.map(x=>`<div class="card">${gchip(x)} ${GOODS[x].name}${dots(post.industry.levelOf(x))}</div>`).join('');
    p.appendChild(g);
    const n=document.createElement('p'); n.className='hint';
    n.textContent=(k instanceof Hub)?`The dots show demand. As a hub, ${k.name} also takes any goods for transhipment; ${HUB_CAP-hubRoom(S.market,k)} of ${HUB_CAP} slots are taken.`:'The dots show demand. Orders coming here are created at other posts.';
    p.appendChild(n);
  }

  const f=document.createElement('div'); f.className='pfoot';
  const before=S.player.ship.dvAvail, after=S.player.ship.dvWith(S.player.ship.fuel,S.player.ship.cargoMass+selM);
  f.innerHTML=`<div class="row"><span>Selected: ${selN} containers, ${tons(selM)}</span><b>${fmtCr(selR)}</b></div>
    <div class="row dvrow"><span class="muted">Δv</span><b>${km(before)}</b><span class="muted">→</span><b class="acc">${km(after)} km/s</b><span class="muted">once accepted</span></div>`;
  f.appendChild(btn(sel.length?`Accept ${sel.length} ${sel.length>1?'orders':'order'}`:'Select orders','go wide',locked||!sel.length,acceptSelected));
  p.appendChild(f);
}

function panelCargo(p:HTMLElement){
  const locked=!S.canAct, co=S.player.ship.hold, near=S.player.ship.near, hereK=(near ? S.market.at(near) : null);
  p.appendChild(phead(`Cargo hold of the ${S.player.ship.def.name}`, near?`Currently in ${esc(near.label)}.`:'Under way.', ''));
  const slots=document.createElement('div'); slots.className='bigslots';
  const cells:string[]=[]; co.forEach(o=>{ for(let i=0;i<o.containers;i++) cells.push(`<div style="background:${GOODS[o.good].color}" title="${GOODS[o.good].name}"><b>${GOODS[o.good].shortName}</b><span>${GOODS[o.good].mass} t</span></div>`); });
  while(cells.length<S.player.ship.def.slots) cells.push('<div class="free">free</div>');
  slots.innerHTML=cells.join(''); p.appendChild(slots);
  const tot=S.player.ship.def.dry+S.player.ship.cargoMass+S.player.ship.fuel, pct=(x:number)=>(x/tot*100).toFixed(1)+'%';
  const m=document.createElement('div'); m.className='massbox';
  m.innerHTML=`<div class="row"><span class="muted">Mass</span><span>${tons(tot)} total</span></div>
    <div class="massbar"><i style="width:${pct(S.player.ship.def.dry)};background:var(--muted)"></i><i style="width:${pct(S.player.ship.cargoMass)};background:#2a6bd1"></i><i style="width:${pct(S.player.ship.fuel)};background:var(--accent)"></i></div>
    <div class="legendrow"><span><i style="background:var(--muted)"></i>Ship ${tons(S.player.ship.def.dry)}</span><span><i style="background:#2a6bd1"></i>Cargo ${tons(S.player.ship.cargoMass)}</span><span><i style="background:var(--accent)"></i>Fuel ${tons(S.player.ship.fuel)}</span></div>
    <p>Δv with this load: <b>${km(S.player.ship.dvAvail)} km/s</b></p>`;
  const r=refuelInfo();
  if(r && r.need>0.05){ const a=document.createElement('button'); a.className='linkbtn'; a.textContent=`Filling up raises it to ${km(S.player.ship.dvWith(S.player.ship.def.cap,S.player.ship.cargoMass))} km/s`; a.onclick=()=>openView('refuel'); m.appendChild(a); }
  p.appendChild(m);
  const h=document.createElement('h3'); h.textContent='Accepted orders'; p.appendChild(h);
  const list=document.createElement('div'); list.className='acts';
  if(!co.length) list.innerHTML='<p class="hint">The hold is empty. Orders are offered at trading posts.</p>';
  co.forEach(o=>{
    const G=GOODS[o.good], to=S.market.post(o.to), left=o.deadline-S.day, pay=o.payout(S.day);
    const span=Math.max(1,o.deadline-(o.created??(o.deadline-60))), frac=Math.max(0,Math.min(1,left/span));
    const el=document.createElement('div'); el.className='order';
    el.innerHTML=`<div class="o-top">${gchip(o.good)}<b>${o.containers} × ${G.name} to ${esc(postLabel(to))}</b><span class="num">${fmtCr(pay)}</span></div>
      <div class="o-meta"><span>${tons(o.containers*G.mass)}</span><span>Route ${km(o.dv)} km/s</span>${o.toHub?'<span class="tag">Transhipment</span>':''}</div>
      <div class="due"><div class="row"><span>Due ${dateStr(o.deadline)}</span><span class="${left>=0?'ok':'late'}">${left>=0?fmtDays(left)+' left':fmtDays(-left)+' overdue, '+Math.round(o.lateFactor(S.day)*100)+'%'}</span></div>
      <div class="fbar"><i style="width:${(frac*100).toFixed(0)}%;background:${left>=0?(frac>0.25?'var(--good)':'var(--warn)'):'var(--bad)'}"></i></div></div>`;
    const row=document.createElement('div'); row.className='o-btns';
    if(!(hereK && hereK.id===o.to) && near){ const rl=routeLink(to,'cargo'); rl.style.marginRight='auto'; row.appendChild(rl); }
    if(hereK && hereK.id===o.to) row.appendChild(btn(`Deliver, ${fmtCr(pay)}`,'go',locked,()=>deliverOrder(o)));
    else if(hereK && hereK.id===o.from){ row.appendChild(btn('Return','',locked,()=>returnOrder(o))); }
    else { const pen=Math.round(o.reward*0.2); row.appendChild(btn(`Cancel, −${fmtCr(pen)}`,'',locked||pen>S.player.credits,()=>abortOrder(o))); }
    el.appendChild(row); list.appendChild(el);
  });
  p.appendChild(list);
}

function depotLabel(key:string){
  if(key==='earth.orbit') return 'Orbital Shipyard, Earth orbit';
  const [node,site=null]=key.split('@'); if(!isNode(node)) return key;
  const [body]=splitNode(node), st=siteOf(body,site);
  return `${st?st.name:''}, ${bodyName(body)}`;
}

// After refuelling, back to where the refuel panel was opened from
function leaveRefuel(){ const back=UI.view==='refuel'?UI.back:null; UI.view=back||'main'; UI.back=null; changed(); }

function panelRefuel(p:HTMLElement){
  const r=refuelInfo(), place=S.player.ship.place; if(!r||!place){ openView('main'); return; }
  const locked=!S.canAct;
  p.appendChild(phead(`Refuel`, `${esc(place.label)}. ${r.source}, ${r.price} Cr per t, takes ${fmtDays(r.days)}.`, ''));
  if(UI.tank===null) UI.tank=+r.max.toFixed(1);
  const amt=Math.min(UI.tank,r.max), cost=Math.round(amt*r.price);
  const box=document.createElement('div'); box.className='tankbox';
  box.innerHTML=`<div class="row"><label for="tankamt"><b>Amount</b></label><b class="big">${tons(amt)}</b></div>
    <input id="tankamt" type="range" min="0" max="${r.max.toFixed(1)}" step="0.5" value="${amt}" ${locked||r.max<0.1?'disabled':''}>
    <div class="row muted"><span>Tank ${tons(S.player.ship.fuel)}</span><span>full ${tons(S.player.ship.def.cap)}</span></div>`;
  const range=find(box,'input',HTMLInputElement); range.oninput=()=>{ UI.tank=+range.value; changed(); document.getElementById('tankamt')?.focus(); };
  const quick=document.createElement('div'); quick.className='two';
  const needDv=routeNeedHere();
  const forRoute=Math.max(0,Math.min(r.max, S.player.ship.fuelFor(needDv,S.player.ship.cargoMass)*1.03-S.player.ship.fuel));
  quick.appendChild(btn(needDv?'Enough for the route':'No route loaded','',locked||!needDv,()=>{ UI.tank=+forRoute.toFixed(1); changed(); }));
  quick.appendChild(btn(r.max<r.need-0.05?'As much as affordable':'Full','',locked,()=>{ UI.tank=+r.max.toFixed(1); changed(); }));
  box.appendChild(quick); p.appendChild(box);
  const cmp=document.createElement('div'); cmp.className='cmp';
  const dvA=S.player.ship.dvWith(S.player.ship.fuel+amt,S.player.ship.cargoMass);
  cmp.innerHTML=`<div><span class="muted">Δv with cargo</span><span>${km(S.player.ship.dvAvail)} km/s</span><b class="acc">${km(dvA)} km/s</b></div>
    <div><span class="muted">Balance</span><span>${fmtCr(S.player.credits)}</span><b>${fmtCr(S.player.credits-cost)}</b></div>
    <p>Cost ${fmtCr(cost)}.${needDv?` Your cargo needs up to ${km(needDv)} km/s from here, ${dvA>=needDv?'which is enough':'which is not enough yet'}.`:''}</p>`;
  p.appendChild(cmp);
  const h=document.createElement('h3'); h.textContent='Prices in this region'; p.appendChild(h);
  const zone=S.market.hubFor(place.body), rows=DEPOT_LIST.filter(d=>S.market.hubFor(d.at.body)===zone).sort((a,b)=>a.fuelPrice-b.fuelPrice);
  const lst=document.createElement('div'); lst.className='pricelist';
  lst.innerHTML=rows.map(d=>{ const me=d.at===place;
    return `<div class="${me?'me':''}"><span>${esc(depotLabel(d.at.key))}${me?' (here)':''}</span><span>${d.fuelPrice} Cr/t</span></div>`; }).join('');
  p.appendChild(lst);
  const f=document.createElement('div'); f.className='pfoot';
  f.appendChild(btn(amt>=0.1?`Take on ${tons(amt)} for ${fmtCr(cost)}`:(r.need<0.05?'The tank is full':'No money for fuel'),'go wide',locked||amt<0.1,()=>{ if(doRefuel(amt)) leaveRefuel(); }));
  p.appendChild(f);
}

function panelShipyard(p:HTMLElement){
  const k=(S.player.ship.near ? S.market.at(S.player.ship.near) : null), hub=k?S.market.hub(k.id):null; if(!k||!hub){ openView('main'); return; }
  const locked=!S.canAct, cur=S.player.ship.def;
  p.appendChild(phead('Shipyard', `${esc(postLabel(k))}. Balance ${fmtCr(S.player.credits)}.`, ''));
  const note=document.createElement('p'); note.className='kinfo';
  note.textContent=`Your ${cur.name} is taken in part exchange at ${fmtCr(0.7*cur.price)}, 70% of its value. Cargo and fuel move across with you. The refit takes 5 days.`;
  p.appendChild(note);
  const list=document.createElement('div'); list.className='acts';
  const dvFull=(sh:{isp:number;dry:number;cap:number;slots:number})=>sh.isp*G0*Math.log((sh.dry+sh.cap+8*sh.slots)/(sh.dry+8*sh.slots));
  const dvEmpty=(sh:{isp:number;dry:number;cap:number})=>sh.isp*G0*Math.log((sh.dry+sh.cap)/sh.dry);
  hub.sells.forEach(id=>{ const sh=SHIPS[id];
    const mine=id===S.player.ship.type, net=sh.price-0.7*cur.price, fits=S.player.ship.slotsUsed<=sh.slots, diff=sh.slots-cur.slots;
    const el=document.createElement('div'); el.className='shipcard'+(mine?' mine':'');
    el.innerHTML=`<div class="row"><div><b class="big">${sh.name}</b><div class="muted">${sh.drive}, Isp ${sh.isp} s</div></div>
      <div class="r">${mine?'<span class="muted">your ship</span>':`<b class="big">${fmtCr(net)}</b><div class="muted">list price ${fmtCr(sh.price)}</div>`}</div></div>
      <div class="stats3s"><div><span class="muted">Cargo slots</span><b>${sh.slots}${!mine&&diff?` <small class="${diff>0?'up':'down'}">${diff>0?'+':''}${diff}</small>`:''}</b></div>
      <div><span class="muted">Tank</span><b>${sh.cap} t</b></div><div><span class="muted">Δv empty / full of water</span><b>${km(dvEmpty(sh))} / ${km(dvFull(sh))}</b></div></div>`;
    const unlock=S.market.offers.filter(o=>o.containers>cur.slots && o.containers<=sh.slots);
    if(!mine && unlock.length){ const u=document.createElement('p'); u.className='o-note'; u.style.margin='0';
      const sum=unlock.reduce((a,o)=>a+o.reward,0);
      u.textContent=`Opens up ${unlock.length} bulk orders across the solar system, worth ${fmtCr(sum)} together.`; el.appendChild(u); }
    if(!mine) el.appendChild(btn(!fits?'Cargo does not fit':net>S.player.credits?`${fmtCr(net-S.player.credits)} short`:`Buy the ${sh.name}`,'go wide',locked||!fits||net>S.player.credits,()=>buyShip(id)));
    list.appendChild(el);
  });
  p.appendChild(list);
}

// Rows of a label and a value
const rows = (list:[string,string][]) => list.map(([k,v])=>`<div class="row"><span class="muted">${k}</span><b>${v}</b></div>`).join('');

// The pilot's lifetime as a bar: from the start age to the risk age, and how much of it has gone
function lifeBar(){
  const pl=S.player, span=RISK_AGE+pl.bought-START_AGE, gone=Math.max(0,Math.min(1,(pl.ageOn(S.day)-START_AGE)/span)), past=pl.pastRisk(S.day)>=0;
  return `<div class="lifebar"><i style="width:${(gone*100).toFixed(1)}%;background:${past?'var(--bad)':gone>0.8?'var(--warn)':'var(--good)'}"></i></div>`;
}

function panelShip(p:HTMLElement){
  const pl=S.player, sh=pl.ship, d=sh.def, age=pl.ageOn(S.day), past=pl.pastRisk(S.day), life=lifeLine(pl,S.day);
  p.appendChild(phead('Ship and pilot', `${esc(pl.name)} with the ${d.name}.`, ''));
  const h=document.createElement('h3'); h.textContent='Pilot'; p.appendChild(h);
  const box=document.createElement('div'); box.className='massbox';
  const nr=document.createElement('div'); nr.className='namerow';
  nr.innerHTML=`<input id="pilotname" type="text" maxlength="${NAME_MAX}" aria-label="Your name" value="${esc(pl.name)}">`;
  const input=find(nr,'input',HTMLInputElement), save=()=>rename(input.value);
  input.onkeydown=(e)=>{ if(e.key==='Enter') save(); };
  nr.appendChild(btn('Rename','',pl.out,save)); box.appendChild(nr);
  box.insertAdjacentHTML('beforeend', rows([
    ['Born', dateStr(pl.born)],
    ['Age', pl.dead ? `died at ${Math.floor(age)}` : `${yrs(age)} years`],
    ['Risk of dying from', `${RISK_AGE+pl.bought} years, ${dateStr(pl.riskFrom)}`],
    [past<0 ? 'Time left before that' : 'Risk now', past<0 ? `${yrs(-past)} years` : `${pct(yearlyRisk(past))} a year`],
    ['Years bought', String(pl.bought)],
  ])+lifeBar()+`<p class="kinfo">${life.risk
    ? 'Every stretch of time, a trip, waiting, refuelling, may now be your last, and the risk doubles every five years.'
    : `Every trip costs you years of your life. From ${RISK_AGE+pl.bought} on, every stretch of time may be your last.`}
    The youth clinics at the spaceports on the Earth's surface sell one more year for ${fmtCr(YEAR_PRICE)}.</p>`);
  p.appendChild(box);
  const h2=document.createElement('h3'); h2.textContent='Ship'; p.appendChild(h2);
  const sbox=document.createElement('div'); sbox.className='massbox';
  sbox.innerHTML=rows([
    ['Class', d.name], ['Drive', `${d.drive}, Isp ${d.isp} s`], ['Dry mass', tons(d.dry)], ['Tank', `${tons(sh.fuel)} of ${tons(d.cap)}`],
    ['Cargo slots', `${sh.slotsUsed} of ${d.slots} used`], ['Δv now', `${km(sh.dvAvail)} km/s`], ['Δv used so far', `${km(sh.dvUsed)} km/s`],
  ]);
  const cb=document.createElement('button'); cb.className='linkbtn'; cb.textContent='Open the cargo hold'; cb.onclick=()=>openView('cargo','ship'); sbox.appendChild(cb);
  p.appendChild(sbox);
}

function panelClinic(p:HTMLElement){
  const place=S.player.ship.place; if(!place || !clinicHere()){ openView('main'); return; }
  const pl=S.player, locked=!S.canAct, afford=pl.canAfford(YEAR_PRICE), past=pl.pastRisk(S.day);
  p.appendChild(phead('Youth Clinic', `${esc(place.label)}. Balance ${fmtCr(pl.credits)}.`, ''));
  const note=document.createElement('p'); note.className='kinfo';
  note.textContent=`A course of treatment pushes the age from which you may die back by one year, for ${fmtCr(YEAR_PRICE)}. It takes no time, and you can come back as often as you can pay.`;
  p.appendChild(note);
  const cmp=document.createElement('div'); cmp.className='cmp';
  cmp.innerHTML=`<div><span class="muted">Risk from</span><span>${RISK_AGE+pl.bought} years</span><b class="acc">${RISK_AGE+pl.bought+1} years</b></div>
    <div><span class="muted">Balance</span><span>${fmtCr(pl.credits)}</span><b>${fmtCr(pl.credits-YEAR_PRICE)}</b></div>
    <p>${past<0 ? `You are ${Math.floor(pl.ageOn(S.day))}: ${yrs(-past)} years left before the risk begins, ${yrs(1-past)} after the treatment.`
      : `You are ${Math.floor(pl.ageOn(S.day))}: the risk stands at ${pct(yearlyRisk(past))} a year, ${past-1<0?'and none':`${pct(yearlyRisk(past-1))}`} after the treatment.`}</p>`;
  p.appendChild(cmp);
  const f=document.createElement('div'); f.className='pfoot';
  f.appendChild(btn(afford?`One more year for ${fmtCr(YEAR_PRICE)}`:`${fmtCr(YEAR_PRICE-pl.credits)} short`,'go wide',locked||!afford,buyYear));
  p.appendChild(f);
}

function panelLeaderboard(p:HTMLElement){
  const list=leaderboard().entries;
  p.appendChild(phead('Leaderboard', 'Whoever died, best balance first. Kept by this browser.', ''));
  if(!list.length){ const e=document.createElement('p'); e.className='hint'; e.textContent='No one has died yet.'; p.appendChild(e); return; }
  const t=document.createElement('table'); t.className='board';
  t.innerHTML=`<thead><tr><th>#</th><th>Name</th><th class="num">Age</th><th class="num">Balance</th><th class="num">Died</th></tr></thead><tbody>${
    list.map((e,i)=>`<tr><td>${i+1}</td><td>${esc(e.name)}${e.bought?` <span class="muted small">+${e.bought} y</span>`:''}</td><td class="num">${Math.floor(e.age)}</td><td class="num">${fmtCr(e.credits)}</td><td class="num">${dateStr(e.day)}</td></tr>`).join('')}</tbody>`;
  p.appendChild(t);
}

export function renderPlace(){
  const w=byId('placecard',HTMLElement); w.innerHTML='';
  const near=S.player.ship.near, k=(near ? S.market.at(near) : null), r=refuelInfo(), del=deliverables(), locked=!S.canAct;
  const c=document.createElement('div'); c.className='place';
  const tr=S.player.ship.transit, where=near?near.label:tr?`Under way to ${BODIES[tr.to].name}`:'Under way';
  const info = k ? `${k.industry.makes.length?'Produces '+k.industry.makes.map(g=>GOODS[g].name).join(', ')+'. ':''}Needs ${k.industry.needs.map(g=>GOODS[g].name).join(', ')}.${r?` Fuel ${r.price} Cr/t.`:''}`
    : r ? `Fuel depot, ${r.price} Cr/t.` : '';
  c.innerHTML=`<div class="phdr"><div class="pname"><div class="muted small">Location</div><b>${esc(where)}</b></div>${info?`<p class="kinfo">${esc(info)}</p>`:''}${k?`<span class="tag">${(k instanceof Hub)?'Hub':'Trading post'}</span>`:''}</div>`;
  const g=document.createElement('div'); g.className='pbtns';
  if(del.length){ const b=ibtn('deliver',`Deliver (${del.length}), ${fmtCr(del.reduce((s,o)=>s+o.payout(S.day),0))}`,'go full',locked,deliverAll); b.style.minHeight='44px'; b.style.display='inline-flex'; b.style.alignItems='center'; b.style.justifyContent='center'; b.style.gap='6px'; c.appendChild(b); }
  if(k){ const n=S.market.post(k.id).offers.length; g.appendChild(ibtn('orders',`Orders (${n})`,del.length?'':'go',S.player.ship.underWay,()=>openView('post'))); }
  if(r) g.appendChild(ibtn('fuel','Refuel','',S.player.ship.underWay,()=>openView('refuel')));
  if(k&&(k instanceof Hub)) g.appendChild(ibtn('yard','Shipyard','',S.player.ship.underWay,()=>openView('shipyard')));
  if(clinicHere()) g.appendChild(ibtn('clinic','Clinic','',S.player.ship.underWay,()=>openView('clinic')));
  // Equal columns: in German "Aufträge (11)" needed extra room, "Orders (8)" does not,
  // and weighting it that way squeezed "Shipyard" into an ellipsis.
  if(g.children.length) c.appendChild(g);
  w.appendChild(c);

  const rs=byId('rescue',HTMLElement); rs.innerHTML=''; rs.className='';
  if(S.player.out){ rs.className='rescue'; rs.innerHTML=`<p>${esc(UI.msg ?? (S.player.dead?`${S.player.name} has died.`:'Bankrupt.'))}</p>`;
    const two=document.createElement('div'); two.className='two';
    if(S.player.dead) two.appendChild(btn('Leaderboard','',false,()=>openView('leaderboard')));
    const again=btn('Start over','go',false,resetGame); if(!S.player.dead) again.classList.add('span2'); two.appendChild(again);
    rs.appendChild(two); return; }
  if(stranded()){
    rs.className='rescue';
    const ri=rescueInfo();
    rs.innerHTML=ri.local?`<p>No money for fuel. The depot will fill your tank on credit, for a 2,000 Cr surcharge. Your balance may go negative for it.</p>`:`<p>Stranded: with the fuel you have you can no longer reach any depot. A tanker will bring you a full tank, ${fmtDays(ri.days)} out; your cargo stays on board.${ri.lift?' Because not even a full tank is enough here, it will also lift you into orbit.':''}</p>`;
    rs.appendChild(btn(ri.local?`Fill up on credit, ${fmtCr(ri.cost)}`:`Call for emergency fuel, ${fmtCr(ri.cost)}`,'go',false,rescue));
  }
}

export function renderPanel(){
  const p=byId('panel',HTMLElement); p.innerHTML='';
  const v=UI.view;
  if(v==='post') panelPost(p); else if(v==='cargo') panelCargo(p);
  else if(v==='refuel') panelRefuel(p); else if(v==='shipyard') panelShipyard(p); else if(v==='route') panelRoute(p);
  else if(v==='ship') panelShip(p); else if(v==='clinic') panelClinic(p); else if(v==='leaderboard') panelLeaderboard(p);
}

// Desktop: the schedule stays open. Mobile: back to the map so the flight is visible.
export function launchAutopilot(){
  const R=UI.route; if(!R) return;
  const mobile=!isDesk(); UI.pick=null; UI.rmsg=true; if(mobile) UI.view='main';
  startAutopilot(R.target, R.plan ?? R.preset);
  if(mobile) window.scrollTo({top:0});
}

function panelRoute(p:HTMLElement){
  const R=UI.route; if(!R){ openView('main'); return; }
  const locked=!S.canAct;
  const autoBtn=()=>{ const g=document.createElement('div'); g.className='pfoot'; g.appendChild(btn('Stop the autopilot','wide',false,()=>stopAutopilot('Autopilot stopped.'))); return g; };
  const tr=S.player.ship.transit;
  const here=S.player.ship.near;
  if(!here){
    p.appendChild(phead(`Route: ${R.target.label}`, tr?`Under way to ${BODIES[tr.to].name}, arriving ${dateStr(tr.arr)}.`:'Under way.', ''));
    const h=document.createElement('p'); h.className='hint'; h.textContent='The schedule is recalculated once you arrive.'; p.appendChild(h);
    if(S.player.ship.autopilot) p.appendChild(autoBtn());
    return;
  }
  if(S.player.ship.isAt(R.target)){
    p.appendChild(phead(`Route: ${R.target.label}`, 'You are at the target.', ''));
    if(UI.rmsg && UI.msg){ const m=document.createElement('div'); m.className='msg'; m.style.margin='0 0 12px'; m.textContent=UI.msg; p.appendChild(m); }
    const del=deliverables();
    if(del.length){ const f=document.createElement('div'); f.className='pfoot'; f.appendChild(btn(`Deliver (${del.length}), ${fmtCr(del.reduce((s,o)=>s+o.payout(S.day),0))}`,'go wide',locked,()=>{ deliverAll(); })); p.appendChild(f); }
    return;
  }
  // The plan being drafted, or the one the autopilot flies. Planning again drops the steps
  // already flown and fits the rest around what the player pinned.
  const A=S.player.ship.autopilot, draft=A ? A.plan : (R.plan ??= draftPlan(R.target,R.preset));
  if(draft && !A){ const msgs=replan(draft,R.target); if(msgs.length){ UI.msg=msgs.join(' '); UI.rmsg=true; } }
  const plan=draft ? schedule(draft) : null;
  p.appendChild(phead(`Route: ${R.target.label}`, `From ${esc(here.label)}.`, ''));
  if(UI.rmsg && UI.msg){ const m=document.createElement('div'); m.className='msg'; m.style.margin='0 0 12px'; m.textContent=UI.msg; p.appendChild(m); }
  if(!draft || !plan){ const e=document.createElement('p'); e.className='hint'; e.textContent='There is no route to that place.'; p.appendChild(e); return; }
  // after a change: plan again and show it
  const again=()=>{ const msgs=replan(draft,R.target); if(msgs.length){ UI.msg=msgs.join(' '); UI.rmsg=true; } changed(); };
  const chips=document.createElement('div'); chips.className='chips';
  const NAMES: Record<Preset,string> = {economical:'Economical', balanced:'Balanced', fast:'Fast'};
  PRESETS.forEach(m=>{
    const pl=planRoute(R.target,m), ok=pl && pl.dv<=S.player.ship.dvAvail+0.5, on=draft.preset===m;
    const b=btn(`${NAMES[m]}${on&&draft.pinned?' (adjusted)':''}: ${pl?km(pl.dv)+' km/s, '+fmtDays(pl.days):'–'}`, on?'chip on':'chip'+(ok?'':' bad'), !!A, ()=>{ R.preset=m; R.plan=draftPlan(R.target,m); R.open=null; changed(); });
    b.setAttribute('aria-pressed',String(on)); chips.appendChild(b);
  });
  p.appendChild(chips);
  const deadl=S.player.ship.hold.filter(o=>S.market.post(o.to).at===R.target);
  const due=deadl.length ? Math.min(...deadl.map(o=>o.deadline)) : null;
  const tl=document.createElement('ol'); tl.className='timeline';
  let spent=0;
  plan.legs.forEach((st:Leg,i:number)=>{
    const last=i===plan.legs.length-1, lg=st.step.along.leg;
    const li=document.createElement('li'); li.className=(st.wait>0.01?'wait':st.kind)+(i===0?' first':'')+(last?' last':'');
    const when=st.kind==='transfer'
      ? `${st.wait>0.01?`Leaves ${dateStr(st.dep)}, after ${fmtDays(st.wait)} waiting. `:'Leaves at once. '}Flies ${fmtDays(st.arr-st.dep)}`
      : fmtDays(st.days);
    li.innerHTML=`<span class="dot"></span><div class="tx"><b>${esc(st.label)}</b><small>${when}${last?`, arriving ${dateStr(st.arr)}`:''}${st.step.pinned?' <span class="mtag post">your choice</span>':''}</small></div><span class="num">${km(st.dv)} km/s</span>`;
    const tx=find(li,'.tx',HTMLElement), row=document.createElement('div'); row.className='stepctl';
    if(lg && !A) row.appendChild(btn(R.open===i?'Close the map':'Choose on the map','chip small'+(R.open===i?' on':''),false,()=>{ R.open=R.open===i?null:i; changed(); }));
    if(st.alt && !A){ const alt=st.alt, aero=alt.dv<100;
      row.appendChild(btn(`${aero?'Aerobrake instead':'Burn instead'}: ${km(alt.dv)} km/s, ${fmtDays(alt.days)}`,'chip small',false,()=>{ switchStep(draft,i); again(); })); }
    if(st.step.pinned && !A) row.appendChild(btn('Back to the preset','chip small',false,()=>{ unpin(draft,i); again(); }));
    if(row.children.length) tx.appendChild(row);
    if(lg && R.open===i && !A){
      const after=plan.legs.slice(i+1).reduce((d,x)=>d+x.days,0);
      tx.appendChild(transferMap({a:lg[0], b:lg[1], from:st.ready, dep:st.dep, days:st.arr-st.dep,
        budget:S.player.ship.dvAvail-spent, deadline:due, after,
        pick:(dep,days)=>{ pinTransfer(draft,i,dep,days); again(); }}));
    }
    spent+=st.dv;
    tl.appendChild(li);
  });
  p.appendChild(tl);
  const have=S.player.ship.dvAvail, ok=plan.dv<=have+0.5; R.strand=false;
  const sum=document.createElement('div'); sum.className='pfoot';
  const late=deadl.filter(o=>plan.arrive>o.deadline);
  const lateAny=deadl.some(o=>plan.arrive>o.deadline);
  const pl=S.player, die=pl.deathChance(S.day,plan.arrive), arrAge=pl.ageOn(plan.arrive), pastArr=pl.pastRisk(plan.arrive);
  sum.innerHTML=`<div class="row"><span class="muted">Travel time</span><span><b class="${lateAny?'badc':''}">${fmtDays(plan.days)}</b> <span class="${die>0?'badc':'muted'}">· you are ${yrs(arrAge)} then</span></span></div>
    ${die>0?`<p class="o-warn bad">Past ${RISK_AGE+pl.bought}: a ${pct(die)} chance you do not live to arrive.</p>`:pastArr>-5?`<p class="o-warn">Only ${yrs(-pastArr)} years left before the risk begins once you are there.</p>`:''}
    <div class="row"><span class="muted">Needs ${km(plan.dv)} of ${km(have)} km/s</span><b class="${ok?'okc':'badc'}">${ok?km(have-plan.dv)+' km/s left':km(plan.dv-have)+' km/s short'}</b></div>
    <div class="massbar"><i style="width:${Math.min(100,plan.dv/Math.max(have,1)*100).toFixed(0)}%;background:${ok?'var(--accent)':'var(--bad)'}"></i></div>
    <p class="kinfo">${deadl.length?(late.length?`${late.length} ${late.length>1?'orders arrive':'order arrives'} after the deadline.`:`${deadl.length>1?'All '+deadl.length+' orders':'The order'} for this destination ${deadl.length>1?'arrive':'arrives'} before the deadline.`):''}${plan.fee?` Launch fee ${fmtCr(plan.fee)}.`:''} ${ok?'The autopilot stops wherever cargo can be delivered on the way.':S.player.ship.dvWith(S.player.ship.def.cap,S.player.ship.cargoMass)<plan.dv?`Loaded too heavily: even with a full tank you would only have ${km(S.player.ship.dvWith(S.player.ship.def.cap,S.player.ship.cargoMass))} km/s. Return an order or pick another destination.`:'Refuel first, or pick a different route.'}</p>`;
  if(ok){
    const cm=S.player.ship.cargoMass, m0=S.player.ship.def.dry+cm+S.player.ship.fuel, fAfter=Math.max(0, m0/Math.exp(plan.dv/(S.player.ship.def.isp*G0))-S.player.ship.def.dry-cm);
    const cmAfter=cm-deadl.reduce((s,o)=>s+o.containers*GOODS[o.good].mass,0), rest=S.player.ship.dvWith(fAfter,cmAfter);
    const nf=nearestFuel({node:R.target.node, site:R.target.site??null, day:plan.arrive});
    if(nf.dv>rest+0.5){ R.strand=true;
      const w=document.createElement('p'); w.className='o-warn bad';
      w.textContent=`Careful: there is no fuel depot at the destination. You would be left with ${km(rest)} km/s, and reaching the nearest depot needs ${isFinite(nf.dv)?km(nf.dv)+' km/s':'more'}. You would strand.`;
      sum.appendChild(w);
    } else if(nf.dv>0){
      const w=document.createElement('p'); w.className='o-note';
      w.textContent=`There is no fuel depot at the destination. With the remaining ${km(rest)} km/s you can reach the nearest one (${km(nf.dv)} km/s).`;
      sum.appendChild(w);
    }
  }
  if(!ok && !S.player.ship.autopilot){
    // route too expensive: offer the way to the nearest depot that is still in reach
    const nf=nearestFuel({node:here.node,site:here.site,day:S.day});
    const spot=nf.spot;
    if(spot && nf.dv>0 && nf.dv<=have+0.5 && spot!==R.target){
      const fb=btn(`To the nearest depot first: ${spot.label}, ${km(nf.dv)} km/s`,'wide',locked,()=>openRoute(spot,UI.back));
      fb.style.fontSize='.92rem'; sum.appendChild(fb);
    }
  }
  // refuelling straight from the route planner, if there is a depot here
  const rf=refuelInfo();
  if(rf && rf.need>0.5 && !S.player.ship.autopilot){
    const box=document.createElement('div'); box.className='rtank';
    const dvFull=S.player.ship.dvWith(S.player.ship.fuel+rf.max,S.player.ship.cargoMass), full=rf.max>=rf.need-0.05;
    const forRoute=Math.max(0,Math.min(rf.max, S.player.ship.fuelFor(plan.dv,S.player.ship.cargoMass)*1.03-S.player.ship.fuel));
    box.innerHTML=`<div class="row"><span class="muted">Fuel depot here, ${rf.price} Cr/t, takes ${fmtDays(rf.days)}</span></div>`;
    const tg=document.createElement('div'); tg.className='two';
    if(rf.max<0.1) tg.appendChild(btn('No money for fuel','span2',true,()=>{}));
    else {
      tg.appendChild(btn(`${full?'Fill up':'As much as affordable'}: ${tons(rf.max)}, ${fmtCr(rf.max*rf.price)} → ${km(dvFull)} km/s`,'',locked,()=>doRefuel(rf.max)));
      if(forRoute>0.5 && forRoute<rf.max-0.5) tg.appendChild(btn(`Enough for the route: ${tons(forRoute)}, ${fmtCr(forRoute*rf.price)}`,'',locked,()=>doRefuel(forRoute)));
      else tg.firstElementChild?.classList.add('span2');
    }
    box.appendChild(tg);
    const more=document.createElement('button'); more.type='button'; more.className='linkbtn'; more.textContent='Choose a different amount';
    more.onclick=()=>openView('refuel','route'); box.appendChild(more);
    sum.appendChild(box);
  }
  const g=document.createElement('div'); g.className='two';
  g.appendChild(btn('Next step only','',locked||!!S.player.ship.autopilot||!plan.legs.length,()=>{ const st=plan.legs[0]; if(!st) return; UI.rmsg=true; if(!execStep(st)){ UI.msg=`"${st.label}" is not possible right now. ${stepBlocker(st)}`; } changed(); }));
  if(S.player.ship.autopilot) g.appendChild(btn('Stop the autopilot','',false,()=>stopAutopilot('Autopilot stopped.')));
  else g.appendChild(R.strand ? btn('Start anyway','',locked||!ok,launchAutopilot) : btn('Start the autopilot','go',locked||!ok,launchAutopilot));
  sum.appendChild(g); p.appendChild(sum);
}
