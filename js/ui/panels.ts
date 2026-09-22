// The panels: trading post, cargo hold, refuelling, shipyard, route.

import { changed } from '../events.js';
import { $, dateStr, esc, fmtDays, km, tons } from '../basics.js';
import { B, FUEL_PRICE, G0, GOODS, HUB_CAP, Post, POST_BY_ID, REGION, SHIPS, bodyName, fmtCr, postLabel, postPlace, siteOf } from '../game/world.js';
import { Order, S, atTarget, cargoMass, cargoOrders, dvAvail, dvWith, eng, here, postAt, locKey, nodeName, slotsUsed, Target, targetName } from '../game/state.js';
import { lateFactor, payout } from '../game/graph.js';
import { freshDeadline, hubRoom } from '../game/economy.js';
import { FuelSpot, nearestFuel, planRoute, stepBlocker } from '../game/planner.js';
import { abortOrder, acceptSelected, buyShip, deliverAll, deliverOrder, deliverables, doRefuel, execStep, fuelFor, openView, refuelInfo, rescue, rescueInfo, resetGame, returnOrder, routeNeedHere, shipFor, startAutopilot, stopAutopilot, stranded } from '../game/commands.js';
import { btn, dots, gchip, ibtn, openRoute, phead, routeLink } from './widgets.js';

function panelPost(p:HTMLElement){
  const k=postAt(); if(!k){ openView('main'); return; }
  const eco=S.domain.eco, locked=S.action.busy||S.domain.over, free=eng().slots-slotsUsed();
  p.appendChild(phead(`${k.name} Trading Post`, `${esc(postPlace(k))}. ${fmtCr(S.domain.credits)}, ${free} cargo ${free===1?'slot':'slots'} free.`, k.hub?'Hub':''));
  const del=deliverables();
  if(del.length){
    const b=document.createElement('div'); b.className='banner';
    b.innerHTML=`<span>${del.length} ${del.length>1?'orders':'order'} on board ${del.length>1?'go':'goes'} here.</span>`;
    b.appendChild(btn(`Deliver, ${fmtCr(del.reduce((s,o)=>s+payout(o),0))}`,'go',locked,deliverAll)); p.appendChild(b);
  }
  const sel=eco.orders.filter(o=>S.ui.sel.has(o.id));
  const selN=sel.reduce((s,o)=>s+o.n,0), selM=sel.reduce((s,o)=>s+o.n*GOODS[o.good].m,0), selR=sel.reduce((s,o)=>s+o.reward,0);
  const offers=eco.orders.filter(o=>o.state==='open' && o.from===k.id);
  const h=document.createElement('h3'); h.textContent=`Orders from here (${offers.length})`; p.appendChild(h);
  const bigHere=offers.filter(o=>o.n>eng().slots);
  if(bigHere.length){ const hb=document.createElement('p'); hb.className='hint';
    hb.textContent=`${bigHere.length} bulk ${bigHere.length>1?'orders do':'order does'} not fit in your ${eng().name} (${eng().slots} slots). Larger ships are sold at the shipyards of the hubs.`; p.appendChild(hb); }
  const list=document.createElement('div'); list.className='ogroups';
  if(!offers.length) list.innerHTML='<p class="hint">No orders right now. The stores fill up over time.</p>';
  // Group by destination, sort the groups by the delta-v of the route
  const groups: Record<string, Order[]> = {};
  offers.forEach(o=>{ (groups[o.to]=groups[o.to]||[]).push(o); });
  const glist=Object.entries(groups).map(([to,os])=>{
    const tk=POST_BY_ID[to], tpl=planRoute({node:tk.node, site:tk.site||(tk.node==='earth.surf'?'kourou':null)},'eco');
    return {tk, os:os.sort((a,b)=>b.reward-a.reward), tpl, dv:tpl?tpl.dv:os[0].dv, days:tpl?tpl.days:os[0].days};
  }).sort((a,b)=>a.dv-b.dv);
  glist.forEach(dest=>{
    const {tk,os,tpl}=dest, dl=freshDeadline(os[0],S.domain.day), lateBy=tpl?tpl.arrive-dl:0;
    const gSel=os.filter(o=>S.ui.sel.has(o.id));
    const lightest=os.filter(o=>!S.ui.sel.has(o.id)).reduce((m,o)=>Math.min(m,o.n*GOODS[o.good].m),Infinity);
    const after = gSel.length ? dvWith(S.domain.fuel,cargoMass()+selM) : dvWith(S.domain.fuel,cargoMass()+selM+(isFinite(lightest)?lightest:0));
    const short = after < dest.dv;
    const afterFull = gSel.length ? dvWith(eng().cap,cargoMass()+selM) : dvWith(eng().cap,cargoMass()+selM+(isFinite(lightest)?lightest:0));
    const grp=document.createElement('section'); grp.className='ogroup'+(gSel.length?' on':'');
    const nDel=cargoOrders().filter(o=>o.to===tk.id).length;
    grp.innerHTML=`<div class="og-head"><div class="og-title"><b>${esc(postLabel(tk))}</b>${tk.hub?' <span class="tag">Hub</span>':''}${nDel?` <span class="mtag deliver">${nDel} already on board</span>`:''}</div>
      <div class="og-meta"><span class="${short?'badc':''}">${km(dest.dv)} km/s</span><span>${fmtDays(dest.days)}</span><span class="${lateBy>0?'badc':''}">Due ${dateStr(dl)}</span></div>
      ${lateBy>0?`<div class="o-warn bad">The deadline cannot be met: earliest arrival ${dateStr(tpl!.arrive)}.</div>`:
        short?`<div class="o-warn">${gSel.length?'With your selection':'Even with the lightest order'} you would have ${km(after)} km/s left. ${afterFull<dest.dv?`Too heavy: even with a full tank it would only be ${km(afterFull)} km/s.`:'Refuel first.'}</div>`:''}</div>`;
    const rl=routeLink(tk,'post'); rl.style.marginLeft='auto'; (grp.querySelector('.og-meta') as HTMLElement).appendChild(rl);
    os.forEach(o=>{
      const Gd=GOODS[o.good], on=S.ui.sel.has(o.id), fits=on || slotsUsed()+selN+o.n<=eng().slots;
      const el=document.createElement('label'); el.className='orow'+(on?' on':'')+(fits?'':' dis');
      const tooBig=o.n>eng().slots, need=tooBig?shipFor(o.n):null;
      const why = fits ? '' : tooBig ? `, needs ${o.n} slots: ${need?need.name+' or larger':'no ship is large enough'}` : `, needs ${o.n} ${o.n>1?'slots':'slot'}`;
      el.innerHTML=`<input type="checkbox" ${on?'checked':''} ${(!fits||locked)?'disabled':''}>${gchip(o.good)}<span class="ot"><b>${o.n} × ${Gd.name}${o.bulk?' <span class="mtag post">Bulk order</span>':''}</b><small>${tons(o.n*Gd.m)}${why}</small></span><span class="num">${fmtCr(o.reward)}</span>`;
      (el.querySelector('input') as HTMLInputElement).onchange=(e)=>{ (e.target as HTMLInputElement).checked?S.ui.sel.add(o.id):S.ui.sel.delete(o.id); changed(); };
      grp.appendChild(el);
    });
    list.appendChild(grp);
  });
  p.appendChild(list);

  if(k.needs.length){
    const h2=document.createElement('h3'); h2.textContent='Wanted here'; p.appendChild(h2);
    const g=document.createElement('div'); g.className='needgrid';
    g.innerHTML=k.needs.map(x=>`<div class="card">${gchip(x)} ${GOODS[x].name}${dots(eco.demand[k.id][x])}</div>`).join('');
    p.appendChild(g);
    const n=document.createElement('p'); n.className='hint';
    n.textContent=k.hub?`The dots show demand. As a hub, ${k.name} also takes any goods for transhipment; ${HUB_CAP-hubRoom(k)} of ${HUB_CAP} slots are taken.`:'The dots show demand. Orders coming here are created at other posts.';
    p.appendChild(n);
  }

  const f=document.createElement('div'); f.className='pfoot';
  const before=dvAvail(), after=dvWith(S.domain.fuel,cargoMass()+selM);
  f.innerHTML=`<div class="row"><span>Selected: ${selN} containers, ${tons(selM)}</span><b>${fmtCr(selR)}</b></div>
    <div class="row dvrow"><span class="muted">Δv</span><b>${km(before)}</b><span class="muted">→</span><b class="acc">${km(after)} km/s</b><span class="muted">once accepted</span></div>`;
  f.appendChild(btn(sel.length?`Accept ${sel.length} ${sel.length>1?'orders':'order'}`:'Select orders','go wide',locked||!sel.length,acceptSelected));
  p.appendChild(f);
}

function panelCargo(p:HTMLElement){
  const locked=S.action.busy||S.domain.over, co=cargoOrders(), hereK=postAt();
  p.appendChild(phead(`Cargo hold of the ${eng().name}`, S.domain.node?`Currently in ${esc(nodeName(S.domain.node))}.`:'Under way.', ''));
  const slots=document.createElement('div'); slots.className='bigslots';
  const cells:string[]=[]; co.forEach(o=>{ for(let i=0;i<o.n;i++) cells.push(`<div style="background:${GOODS[o.good].color}" title="${GOODS[o.good].name}"><b>${GOODS[o.good].sh}</b><span>${GOODS[o.good].m} t</span></div>`); });
  while(cells.length<eng().slots) cells.push('<div class="free">free</div>');
  slots.innerHTML=cells.join(''); p.appendChild(slots);
  const tot=eng().dry+cargoMass()+S.domain.fuel, pct=(x:number)=>(x/tot*100).toFixed(1)+'%';
  const m=document.createElement('div'); m.className='massbox';
  m.innerHTML=`<div class="row"><span class="muted">Mass</span><span>${tons(tot)} total</span></div>
    <div class="massbar"><i style="width:${pct(eng().dry)};background:var(--muted)"></i><i style="width:${pct(cargoMass())};background:#2a6bd1"></i><i style="width:${pct(S.domain.fuel)};background:var(--accent)"></i></div>
    <div class="legendrow"><span><i style="background:var(--muted)"></i>Ship ${tons(eng().dry)}</span><span><i style="background:#2a6bd1"></i>Cargo ${tons(cargoMass())}</span><span><i style="background:var(--accent)"></i>Fuel ${tons(S.domain.fuel)}</span></div>
    <p>Δv with this load: <b>${km(dvAvail())} km/s</b></p>`;
  const r=refuelInfo();
  if(r && r.need>0.05){ const a=document.createElement('button'); a.className='linkbtn'; a.textContent=`Filling up raises it to ${km(dvWith(eng().cap,cargoMass()))} km/s`; a.onclick=()=>openView('refuel'); m.appendChild(a); }
  p.appendChild(m);
  const h=document.createElement('h3'); h.textContent='Accepted orders'; p.appendChild(h);
  const list=document.createElement('div'); list.className='acts';
  if(!co.length) list.innerHTML='<p class="hint">The hold is empty. Orders are offered at trading posts.</p>';
  co.forEach(o=>{
    const G=GOODS[o.good], to=POST_BY_ID[o.to], left=o.deadline-S.domain.day, pay=payout(o);
    const span=Math.max(1,o.deadline-(o.created??(o.deadline-60))), frac=Math.max(0,Math.min(1,left/span));
    const el=document.createElement('div'); el.className='order';
    el.innerHTML=`<div class="o-top">${gchip(o.good)}<b>${o.n} × ${G.name} to ${esc(postLabel(to))}</b><span class="num">${fmtCr(pay)}</span></div>
      <div class="o-meta"><span>${tons(o.n*G.m)}</span><span>Route ${km(o.dv)} km/s</span>${o.transship?'<span class="tag">Transhipment</span>':''}</div>
      <div class="due"><div class="row"><span>Due ${dateStr(o.deadline)}</span><span class="${left>=0?'ok':'late'}">${left>=0?fmtDays(left)+' left':fmtDays(-left)+' overdue, '+Math.round(lateFactor(o,S.domain.day)*100)+'%'}</span></div>
      <div class="fbar"><i style="width:${(frac*100).toFixed(0)}%;background:${left>=0?(frac>0.25?'var(--good)':'var(--warn)'):'var(--bad)'}"></i></div></div>`;
    const row=document.createElement('div'); row.className='o-btns';
    if(!(hereK && hereK.id===o.to) && S.domain.node){ const rl=routeLink(to,'cargo'); rl.style.marginRight='auto'; row.appendChild(rl); }
    if(hereK && hereK.id===o.to) row.appendChild(btn(`Deliver, ${fmtCr(pay)}`,'go',locked,()=>deliverOrder(o)));
    else if(hereK && hereK.id===o.from){ row.appendChild(btn('Return','',locked,()=>returnOrder(o))); }
    else { const pen=Math.round(o.reward*0.2); row.appendChild(btn(`Cancel, −${fmtCr(pen)}`,'',locked||pen>S.domain.credits,()=>abortOrder(o))); }
    el.appendChild(row); list.appendChild(el);
  });
  p.appendChild(list);
}

function depotLabel(key:string){
  if(key==='earth.orbit') return 'Orbital Shipyard, Earth orbit';
  if(key==='earth.surf') return 'Earth, all spaceports';
  const [node,site]=key.split('@'), body=node.split('.')[0], st=siteOf(body,site);
  return `${st?st.name:''}, ${bodyName(body)}`;
}

function panelRefuel(p:HTMLElement){
  const r=refuelInfo(); if(!r){ openView('main'); return; }
  const locked=S.action.busy||S.domain.over;
  p.appendChild(phead(`Refuel`, `${esc(nodeName(S.domain.node!))}. ${r.source}, ${r.price} Cr per t, takes ${fmtDays(r.days)}.`, ''));
  if(S.ui.tank===null) S.ui.tank=+r.max.toFixed(1);
  const amt=Math.min(S.ui.tank,r.max), cost=Math.round(amt*r.price);
  const box=document.createElement('div'); box.className='tankbox';
  box.innerHTML=`<div class="row"><label for="tankamt"><b>Amount</b></label><b class="big">${tons(amt)}</b></div>
    <input id="tankamt" type="range" min="0" max="${r.max.toFixed(1)}" step="0.5" value="${amt}" ${locked||r.max<0.1?'disabled':''}>
    <div class="row muted"><span>Tank ${tons(S.domain.fuel)}</span><span>full ${tons(eng().cap)}</span></div>`;
  (box.querySelector('input') as HTMLInputElement).oninput=(e)=>{ S.ui.tank=+((e.target as HTMLInputElement).value); changed(); document.getElementById('tankamt')?.focus(); };
  const quick=document.createElement('div'); quick.className='two';
  const needDv=routeNeedHere();
  const forRoute=Math.max(0,Math.min(r.max, fuelFor(needDv,cargoMass())*1.03-S.domain.fuel));
  quick.appendChild(btn(needDv?'Enough for the route':'No route loaded','',locked||!needDv,()=>{ S.ui.tank=+forRoute.toFixed(1); changed(); }));
  quick.appendChild(btn(r.max<r.need-0.05?'As much as affordable':'Full','',locked,()=>{ S.ui.tank=+r.max.toFixed(1); changed(); }));
  box.appendChild(quick); p.appendChild(box);
  const cmp=document.createElement('div'); cmp.className='cmp';
  const dvA=dvWith(S.domain.fuel+amt,cargoMass());
  cmp.innerHTML=`<div><span class="muted">Δv with cargo</span><span>${km(dvAvail())} km/s</span><b class="acc">${km(dvA)} km/s</b></div>
    <div><span class="muted">Balance</span><span>${fmtCr(S.domain.credits)}</span><b>${fmtCr(S.domain.credits-cost)}</b></div>
    <p>Cost ${fmtCr(cost)}.${needDv?` Your cargo needs up to ${km(needDv)} km/s from here, ${dvA>=needDv?'which is enough':'which is not enough yet'}.`:''}</p>`;
  p.appendChild(cmp);
  const h=document.createElement('h3'); h.textContent='Prices in this region'; p.appendChild(h);
  const reg=REGION[here()[0]!];
  const rows=Object.entries(FUEL_PRICE).filter(([key])=>REGION[key.split('.')[0]]===reg).sort((a,b)=>a[1]-b[1]);
  const lst=document.createElement('div'); lst.className='pricelist';
  const me=locKey();
  lst.innerHTML=rows.map(([key,pr])=>`<div class="${key===me||key===S.domain.node&&!FUEL_PRICE[me!]?'me':''}"><span>${esc(depotLabel(key))}${key===me||key===S.domain.node&&!FUEL_PRICE[me!]?' (here)':''}</span><span>${pr} Cr/t</span></div>`).join('');
  p.appendChild(lst);
  const f=document.createElement('div'); f.className='pfoot';
  f.appendChild(btn(amt>=0.1?`Take on ${tons(amt)} for ${fmtCr(cost)}`:(r.need<0.05?'The tank is full':'No money for fuel'),'go wide',locked||amt<0.1,()=>doRefuel(amt)));
  p.appendChild(f);
}

function panelShipyard(p:HTMLElement){
  const k=postAt(); if(!k||!k.hub){ openView('main'); return; }
  const locked=S.action.busy||S.domain.over, cur=eng();
  p.appendChild(phead('Shipyard', `${esc(postLabel(k))}. Balance ${fmtCr(S.domain.credits)}.`, ''));
  const note=document.createElement('p'); note.className='kinfo';
  note.textContent=`Your ${cur.name} is taken in part exchange at ${fmtCr(0.7*cur.price)}, 70% of its value. Cargo and fuel move across with you. The refit takes 5 days.`;
  p.appendChild(note);
  const list=document.createElement('div'); list.className='acts';
  const dvFull=(sh:{isp:number;dry:number;cap:number;slots:number})=>sh.isp*G0*Math.log((sh.dry+sh.cap+8*sh.slots)/(sh.dry+8*sh.slots));
  const dvEmpty=(sh:{isp:number;dry:number;cap:number})=>sh.isp*G0*Math.log((sh.dry+sh.cap)/sh.dry);
  Object.entries(SHIPS).forEach(([id,sh])=>{
    const mine=id===S.domain.ship, net=sh.price-0.7*cur.price, fits=slotsUsed()<=sh.slots, diff=sh.slots-cur.slots;
    const el=document.createElement('div'); el.className='shipcard'+(mine?' mine':'');
    el.innerHTML=`<div class="row"><div><b class="big">${sh.name}</b><div class="muted">${sh.drive}, Isp ${sh.isp} s</div></div>
      <div class="r">${mine?'<span class="muted">your ship</span>':`<b class="big">${fmtCr(net)}</b><div class="muted">list price ${fmtCr(sh.price)}</div>`}</div></div>
      <div class="stats3s"><div><span class="muted">Cargo slots</span><b>${sh.slots}${!mine&&diff?` <small class="${diff>0?'up':'down'}">${diff>0?'+':''}${diff}</small>`:''}</b></div>
      <div><span class="muted">Tank</span><b>${sh.cap} t</b></div><div><span class="muted">Δv empty / full of water</span><b>${km(dvEmpty(sh))} / ${km(dvFull(sh))}</b></div></div>`;
    const unlock=S.domain.eco.orders.filter(o=>o.state==='open' && o.n>cur.slots && o.n<=sh.slots);
    if(!mine && unlock.length){ const u=document.createElement('p'); u.className='o-note'; u.style.margin='0';
      const sum=unlock.reduce((a,o)=>a+o.reward,0);
      u.textContent=`Opens up ${unlock.length} bulk orders across the solar system, worth ${fmtCr(sum)} together.`; el.appendChild(u); }
    if(!mine) el.appendChild(btn(!fits?'Cargo does not fit':net>S.domain.credits?`${fmtCr(net-S.domain.credits)} short`:`Buy the ${sh.name}`,'go wide',locked||!fits||net>S.domain.credits,()=>buyShip(id)));
    list.appendChild(el);
  });
  p.appendChild(list);
}

export function renderPlace(){
  const w=$('placecard') as HTMLElement; w.innerHTML='';
  const k=postAt(), r=refuelInfo(), del=deliverables(), locked=S.action.busy||S.domain.over;
  const c=document.createElement('div'); c.className='place';
  const where=S.domain.node?nodeName(S.domain.node):`Under way to ${B[S.action.transit!.b].name}`;
  const info = k ? `${k.makes.length?'Produces '+k.makes.map(g=>GOODS[g].name).join(', ')+'. ':''}Needs ${k.needs.map(g=>GOODS[g].name).join(', ')}.${r?` Fuel ${r.price} Cr/t.`:''}`
    : r ? `Fuel depot, ${r.price} Cr/t.` : '';
  c.innerHTML=`<div class="phdr"><div class="pname"><div class="muted small">Location</div><b>${esc(where)}</b></div>${info?`<p class="kinfo">${esc(info)}</p>`:''}${k?`<span class="tag">${k.hub?'Hub':'Trading post'}</span>`:''}</div>`;
  const g=document.createElement('div'); g.className='pbtns';
  if(del.length){ const b=ibtn('deliver',`Deliver (${del.length}), ${fmtCr(del.reduce((s,o)=>s+payout(o),0))}`,'go full',locked,deliverAll); b.style.minHeight='44px'; b.style.display='inline-flex'; b.style.alignItems='center'; b.style.justifyContent='center'; b.style.gap='6px'; c.appendChild(b); }
  if(k){ const n=S.domain.eco.orders.filter(o=>o.state==='open'&&o.from===k.id).length; g.appendChild(ibtn('orders',`Orders (${n})`,del.length?'':'go',S.action.busy,()=>openView('post'))); }
  if(r) g.appendChild(ibtn('fuel','Refuel','',S.action.busy,()=>openView('refuel')));
  if(k&&k.hub) g.appendChild(ibtn('yard','Shipyard','',S.action.busy,()=>openView('shipyard')));
  // Equal columns: in German "Aufträge (11)" needed extra room, "Orders (8)" does not,
  // and weighting it that way squeezed "Shipyard" into an ellipsis.
  if(g.children.length) c.appendChild(g);
  w.appendChild(c);

  const rs=$('rescue') as HTMLElement; rs.innerHTML=''; rs.className='';
  if(S.domain.over){ rs.className='rescue'; rs.innerHTML=`<p>${esc(S.ui.msg)}</p>`; rs.appendChild(btn('Start over','go',false,resetGame)); return; }
  if(stranded()){
    rs.className='rescue';
    const ri=rescueInfo();
    rs.innerHTML=ri.local?`<p>No money for fuel. The depot will fill your tank on credit, for a 2,000 Cr surcharge. Your balance may go negative for it.</p>`:`<p>Stranded: with the fuel you have you can no longer reach any depot. A tanker will bring you a full tank, ${fmtDays(ri.days)} out; your cargo stays on board.${ri.lift?' Because not even a full tank is enough here, it will also lift you into orbit.':''}</p>`;
    rs.appendChild(btn(ri.local?`Fill up on credit, ${fmtCr(ri.cost)}`:`Call for emergency fuel, ${fmtCr(ri.cost)}`,'go',false,rescue));
  }
}

export function renderPanel(){
  const p=$('panel') as HTMLElement; p.innerHTML='';
  const v=S.ui.view;
  if(v==='post') panelPost(p); else if(v==='cargo') panelCargo(p);
  else if(v==='refuel') panelRefuel(p); else if(v==='shipyard') panelShipyard(p); else if(v==='route') panelRoute(p);
}

function panelRoute(p:HTMLElement){
  const R=S.ui.route; if(!R){ openView('main'); return; }
  const locked=S.action.busy||S.domain.over;
  const autoBtn=()=>{ const g=document.createElement('div'); g.className='pfoot'; g.appendChild(btn('Stop the autopilot','wide',false,()=>stopAutopilot('Autopilot stopped.'))); return g; };
  if(!S.domain.node){
    p.appendChild(phead(`Route: ${targetName(R.target)}`, `Under way to ${B[S.action.transit!.b].name}, arriving ${dateStr(S.action.transit!.arr)}.`, ''));
    const h=document.createElement('p'); h.className='hint'; h.textContent='The schedule is recalculated once you arrive.'; p.appendChild(h);
    if(S.ui.auto) p.appendChild(autoBtn());
    return;
  }
  if(atTarget(R.target)){
    p.appendChild(phead(`Route: ${targetName(R.target)}`, 'You are at the target.', ''));
    if(S.ui.rmsg && S.ui.msg){ const m=document.createElement('div'); m.className='msg'; m.style.margin='0 0 12px'; m.textContent=S.ui.msg; p.appendChild(m); }
    const del=deliverables();
    if(del.length){ const f=document.createElement('div'); f.className='pfoot'; f.appendChild(btn(`Deliver (${del.length}), ${fmtCr(del.reduce((s,o)=>s+payout(o),0))}`,'go wide',locked,()=>{ deliverAll(); })); p.appendChild(f); }
    return;
  }
  const plans: Record<string, ReturnType<typeof planRoute>> = {eco:planRoute(R.target,'eco'), now:planRoute(R.target,'now')};
  const plan=plans[R.mode];
  p.appendChild(phead(`Route: ${targetName(R.target)}`, `From ${esc(nodeName(S.domain.node))}.`, ''));
  if(S.ui.rmsg && S.ui.msg){ const m=document.createElement('div'); m.className='msg'; m.style.margin='0 0 12px'; m.textContent=S.ui.msg; p.appendChild(m); }
  if(!plan){ const e=document.createElement('p'); e.className='hint'; e.textContent='There is no route to that place.'; p.appendChild(e); return; }
  const chips=document.createElement('div'); chips.className='chips';
  ([['eco','Economical'],['now','Leave now']] as Array<[string,string]>).forEach(([m,t])=>{
    const pl=plans[m], ok=pl && pl.dv<=dvAvail()+0.5;
    const b=btn(`${t}: ${pl?km(pl.dv)+' km/s, '+fmtDays(pl.days):'–'}`, R.mode===m?'chip on':'chip'+(ok?'':' bad'), false, ()=>{ R.mode=m; changed(); });
    b.setAttribute('aria-pressed',String(R.mode===m)); chips.appendChild(b);
  });
  p.appendChild(chips);
  const tl=document.createElement('ol'); tl.className='timeline';
  let run=S.domain.day;
  plan.steps.forEach((st,i)=>{
    run+=st.days; const last=i===plan.steps.length-1;
    const li=document.createElement('li'); li.className=st.kind+(i===0?' first':'')+(last?' last':'');
    li.innerHTML=`<span class="dot"></span><div class="tx"><b>${esc(st.label)}</b><small>${st.kind==='wait'?`${fmtDays(st.days)}, until ${dateStr(run)}`:fmtDays(st.days)}${last?`, arriving ${dateStr(run)}`:''}</small></div><span class="num">${st.kind==='wait'?'–':km(st.dv)+' km/s'}</span>`;
    tl.appendChild(li);
  });
  p.appendChild(tl);
  const have=dvAvail(), ok=plan.dv<=have+0.5; R.strand=false;
  const sum=document.createElement('div'); sum.className='pfoot';
  const deadl=cargoOrders().filter(o=>{ const k=POST_BY_ID[o.to]; return k.node===R.target.node && (!k.site||k.site===R.target.site); });
  const late=deadl.filter(o=>plan.arrive>o.deadline);
  sum.innerHTML=`<div class="row"><span class="muted">Needs ${km(plan.dv)} of ${km(have)} km/s</span><b class="${ok?'okc':'badc'}">${ok?km(have-plan.dv)+' km/s left':km(plan.dv-have)+' km/s short'}</b></div>
    <div class="massbar"><i style="width:${Math.min(100,plan.dv/Math.max(have,1)*100).toFixed(0)}%;background:${ok?'var(--accent)':'var(--bad)'}"></i></div>
    <p class="kinfo">${deadl.length?(late.length?`${late.length} ${late.length>1?'orders arrive':'order arrives'} after the deadline.`:`${deadl.length>1?'All '+deadl.length+' orders':'The order'} for this destination ${deadl.length>1?'arrive':'arrives'} before the deadline.`):''}${plan.fee?` Launch fee ${fmtCr(plan.fee)}.`:''} ${ok?'The autopilot stops wherever cargo can be delivered on the way.':dvWith(eng().cap,cargoMass())<plan.dv?`Loaded too heavily: even with a full tank you would only have ${km(dvWith(eng().cap,cargoMass()))} km/s. Return an order or pick another destination.`:'Refuel first, or pick a different route.'}</p>`;
  if(ok){
    const cm=cargoMass(), m0=eng().dry+cm+S.domain.fuel, fAfter=Math.max(0, m0/Math.exp(plan.dv/(eng().isp*G0))-eng().dry-cm);
    const cmAfter=cm-deadl.reduce((s,o)=>s+o.n*GOODS[o.good].m,0), rest=dvWith(fAfter,cmAfter);
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
  if(!ok && !S.ui.auto){
    // route too expensive: offer the way to the nearest depot that is still in reach
    const nf=nearestFuel({node:S.domain.node,site:S.domain.site,day:S.domain.day});
    const spot=nf.spot;
    if(spot && nf.dv>0 && nf.dv<=have+0.5 && !(spot.node===R.target.node && (spot.site||null)===(R.target.site||null))){
      const fb=btn(`To the nearest depot first: ${targetName(spot)}, ${km(nf.dv)} km/s`,'wide',locked,()=>openRoute(spot,S.ui.back));
      fb.style.fontSize='.92rem'; sum.appendChild(fb);
    }
  }
  // refuelling straight from the route planner, if there is a depot here
  const rf=refuelInfo();
  if(rf && rf.need>0.5 && !S.ui.auto){
    const box=document.createElement('div'); box.className='rtank';
    const dvFull=dvWith(S.domain.fuel+rf.max,cargoMass()), full=rf.max>=rf.need-0.05;
    const forRoute=Math.max(0,Math.min(rf.max, fuelFor(plan.dv,cargoMass())*1.03-S.domain.fuel));
    box.innerHTML=`<div class="row"><span class="muted">Fuel depot here, ${rf.price} Cr/t, takes ${fmtDays(rf.days)}</span></div>`;
    const tg=document.createElement('div'); tg.className='two';
    if(rf.max<0.1) tg.appendChild(btn('No money for fuel','span2',true,()=>{}));
    else {
      tg.appendChild(btn(`${full?'Fill up':'As much as affordable'}: ${tons(rf.max)}, ${fmtCr(rf.max*rf.price)} → ${km(dvFull)} km/s`,'',locked,()=>doRefuel(rf.max,true)));
      if(forRoute>0.5 && forRoute<rf.max-0.5) tg.appendChild(btn(`Enough for the route: ${tons(forRoute)}, ${fmtCr(forRoute*rf.price)}`,'',locked,()=>doRefuel(forRoute,true)));
      else (tg.firstElementChild as HTMLElement).classList.add('span2');
    }
    box.appendChild(tg);
    const more=document.createElement('button'); more.type='button'; more.className='linkbtn'; more.textContent='Choose a different amount';
    more.onclick=()=>openView('refuel','route'); box.appendChild(more);
    sum.appendChild(box);
  }
  const g=document.createElement('div'); g.className='two';
  g.appendChild(btn('Next step only','',locked||!!S.ui.auto||!plan.steps.length,()=>{ const st=plan.steps[0]; S.ui.rmsg=true; if(!execStep(st)){ S.ui.msg=`"${st.label}" is not possible right now. ${stepBlocker(st)}`; } changed(); }));
  if(S.ui.auto) g.appendChild(btn('Stop the autopilot','',false,()=>stopAutopilot('Autopilot stopped.')));
  else g.appendChild(R.strand ? btn('Start anyway','',locked||!ok,startAutopilot) : btn('Start the autopilot','go',locked||!ok,startAutopilot));
  sum.appendChild(g); p.appendChild(sum);
}
