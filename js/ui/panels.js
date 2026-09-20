// Die Tafeln: Kontor, Fracht, Tanken, Werft, Route.

import { geaendert } from '../ereignisse.js';
import { $, dateStr, esc, fmtDays, km, tons } from '../basis.js';
import { B, FUEL_PRICE, G0, GOODS, HUB_CAP, KBY, REGION, SHIPS, bodyName, fmtCr, kontorLabel, kontorPlace, siteOf } from '../spiel/welt.js';
import { S, atTarget, cargoMass, cargoOrders, dvAvail, dvWith, eng, here, kontorAt, locKey, nodeName, slotsUsed, targetName } from '../spiel/zustand.js';
import { lateFactor, payout } from '../spiel/graph.js';
import { freshDeadline, hubRoom } from '../spiel/wirtschaft.js';
import { nearestFuel, planRoute, stepBlocker } from '../spiel/planer.js';
import { abortOrder, acceptSelected, buyShip, deliverAll, deliverOrder, deliverables, doRefuel, execStep, fuelFor, openView, refuelInfo, rescue, rescueInfo, resetGame, returnOrder, routeNeedHere, shipFor, startAutopilot, stopAutopilot, stranded } from '../spiel/steuerung.js';
import { btn, dots, gchip, ibtn, openRoute, phead, routeLink } from './bausteine.js';

function panelKontor(p){
  const k=kontorAt(); if(!k) return openView('main');
  const eco=S.eco, locked=S.busy||S.over, free=eng().slots-slotsUsed();
  p.appendChild(phead(`Kontor ${k.name}`, `${esc(kontorPlace(k))}. ${fmtCr(S.credits)}, ${free} ${free===1?'Frachtplatz':'Frachtplätze'} frei.`, k.hub?'Drehkreuz':''));
  const del=deliverables();
  if(del.length){
    const b=document.createElement('div'); b.className='banner';
    b.innerHTML=`<span>${del.length} ${del.length>1?'Aufträge':'Auftrag'} an Bord ${del.length>1?'gehen':'geht'} hierher.</span>`;
    b.appendChild(btn(`Abliefern, ${fmtCr(del.reduce((s,o)=>s+payout(o),0))}`,'go',locked,deliverAll)); p.appendChild(b);
  }
  const sel=eco.orders.filter(o=>S.ui.sel.has(o.id));
  const selN=sel.reduce((s,o)=>s+o.n,0), selM=sel.reduce((s,o)=>s+o.n*GOODS[o.good].m,0), selR=sel.reduce((s,o)=>s+o.reward,0);
  const offers=eco.orders.filter(o=>o.state==='open' && o.from===k.id);
  const h=document.createElement('h3'); h.textContent=`Aufträge ab hier (${offers.length})`; p.appendChild(h);
  const bigHere=offers.filter(o=>o.n>eng().slots);
  if(bigHere.length){ const hb=document.createElement('p'); hb.className='hint';
    hb.textContent=`${bigHere.length} ${bigHere.length>1?'Großaufträge passen':'Großauftrag passt'} nicht in deine ${eng().name} (${eng().slots} Plätze). Größere Schiffe gibt es an der Werft der Drehkreuze.`; p.appendChild(hb); }
  const list=document.createElement('div'); list.className='ogroups';
  if(!offers.length) list.innerHTML='<p class="hint">Gerade keine Aufträge. Die Lager füllen sich mit der Zeit.</p>';
  // Nach Zielort gruppieren, Gruppen nach Δv der Route sortieren
  const groups={};
  offers.forEach(o=>{ (groups[o.to]=groups[o.to]||[]).push(o); });
  const glist=Object.entries(groups).map(([to,os])=>{
    const tk=KBY[to], tpl=planRoute({node:tk.node, site:tk.site||(tk.node==='earth.surf'?'kourou':null)},'eco');
    return {tk, os:os.sort((a,b)=>b.reward-a.reward), tpl, dv:tpl?tpl.dv:os[0].dv, days:tpl?tpl.days:os[0].days};
  }).sort((a,b)=>a.dv-b.dv);
  glist.forEach(ziel=>{
    const {tk,os,tpl}=ziel, dl=freshDeadline(os[0],S.day), lateBy=tpl?tpl.arrive-dl:0;
    const gSel=os.filter(o=>S.ui.sel.has(o.id));
    const lightest=os.filter(o=>!S.ui.sel.has(o.id)).reduce((m,o)=>Math.min(m,o.n*GOODS[o.good].m),Infinity);
    const after = gSel.length ? dvWith(S.fuel,cargoMass()+selM) : dvWith(S.fuel,cargoMass()+selM+(isFinite(lightest)?lightest:0));
    const short = after < ziel.dv;
    const afterFull = gSel.length ? dvWith(eng().cap,cargoMass()+selM) : dvWith(eng().cap,cargoMass()+selM+(isFinite(lightest)?lightest:0));
    const grp=document.createElement('section'); grp.className='ogroup'+(gSel.length?' on':'');
    const nDel=cargoOrders().filter(o=>o.to===tk.id).length;
    grp.innerHTML=`<div class="og-head"><div class="og-title"><b>${esc(kontorLabel(tk))}</b>${tk.hub?' <span class="tag">Drehkreuz</span>':''}${nDel?` <span class="mtag deliver">schon ${nDel} an Bord</span>`:''}</div>
      <div class="og-meta"><span class="${short?'badc':''}">${km(ziel.dv)} km/s</span><span>${fmtDays(ziel.days)}</span><span class="${lateBy>0?'badc':''}">Frist ${dateStr(dl)}</span></div>
      ${lateBy>0?`<div class="o-warn bad">Frist nicht zu schaffen: Ankunft frühestens ${dateStr(tpl.arrive)}.</div>`:
        short?`<div class="o-warn">${gSel.length?'Mit deiner Auswahl':'Selbst mit dem leichtesten Auftrag'} bleiben ${km(after)} km/s. ${afterFull<ziel.dv?`Zu schwer: Auch vollgetankt wären es nur ${km(afterFull)} km/s.`:'Vorher tanken.'}</div>`:''}</div>`;
    const rl=routeLink(tk,'kontor'); rl.style.marginLeft='auto'; grp.querySelector('.og-meta').appendChild(rl);
    os.forEach(o=>{
      const Gd=GOODS[o.good], on=S.ui.sel.has(o.id), fits=on || slotsUsed()+selN+o.n<=eng().slots;
      const el=document.createElement('label'); el.className='orow'+(on?' on':'')+(fits?'':' dis');
      const tooBig=o.n>eng().slots, need=tooBig?shipFor(o.n):null;
      const why = fits ? '' : tooBig ? `, braucht ${o.n} Plätze: ${need?need.name+' oder größer':'kein Schiff groß genug'}` : `, braucht ${o.n} ${o.n>1?'Plätze':'Platz'}`;
      el.innerHTML=`<input type="checkbox" ${on?'checked':''} ${(!fits||locked)?'disabled':''}>${gchip(o.good)}<span class="ot"><b>${o.n} × ${Gd.name}${o.bulk?' <span class="mtag kontor">Großauftrag</span>':''}</b><small>${tons(o.n*Gd.m)}${why}</small></span><span class="num">${fmtCr(o.reward)}</span>`;
      el.querySelector('input').onchange=e=>{ e.target.checked?S.ui.sel.add(o.id):S.ui.sel.delete(o.id); geaendert(); };
      grp.appendChild(el);
    });
    list.appendChild(grp);
  });
  p.appendChild(list);

  if(k.needs.length){
    const h2=document.createElement('h3'); h2.textContent='Hier gesucht'; p.appendChild(h2);
    const g=document.createElement('div'); g.className='needgrid';
    g.innerHTML=k.needs.map(x=>`<div class="card">${gchip(x)} ${GOODS[x].name}${dots(eco.demand[k.id][x])}</div>`).join('');
    p.appendChild(g);
    const n=document.createElement('p'); n.className='hint';
    n.textContent=k.hub?`Punkte zeigen den Bedarf. Als Drehkreuz nimmt ${k.name} außerdem jedes Gut zum Umschlag an; belegt sind ${HUB_CAP-hubRoom(k)} von ${HUB_CAP} Plätzen.`:'Punkte zeigen den Bedarf. Aufträge hierher entstehen in anderen Kontoren.';
    p.appendChild(n);
  }

  const f=document.createElement('div'); f.className='pfoot';
  const before=dvAvail(), after=dvWith(S.fuel,cargoMass()+selM);
  f.innerHTML=`<div class="row"><span>Auswahl: ${selN} Container, ${tons(selM)}</span><b>${fmtCr(selR)}</b></div>
    <div class="row dvrow"><span class="muted">Δv</span><b>${km(before)}</b><span class="muted">→</span><b class="acc">${km(after)} km/s</b><span class="muted">nach Annahme</span></div>`;
  f.appendChild(btn(sel.length?`${sel.length} ${sel.length>1?'Aufträge':'Auftrag'} annehmen`:'Aufträge auswählen','go wide',locked||!sel.length,acceptSelected));
  p.appendChild(f);
}

function panelFracht(p){
  const locked=S.busy||S.over, co=cargoOrders(), hereK=kontorAt();
  p.appendChild(phead(`Laderaum der ${eng().name}`, S.node?`Liegt in ${esc(nodeName(S.node))}.`:'Unterwegs.'));
  const slots=document.createElement('div'); slots.className='bigslots';
  const cells=[]; co.forEach(o=>{ for(let i=0;i<o.n;i++) cells.push(`<div style="background:${GOODS[o.good].color}" title="${GOODS[o.good].name}"><b>${GOODS[o.good].sh}</b><span>${GOODS[o.good].m} t</span></div>`); });
  while(cells.length<eng().slots) cells.push('<div class="free">frei</div>');
  slots.innerHTML=cells.join(''); p.appendChild(slots);
  const tot=eng().dry+cargoMass()+S.fuel, pct=x=>(x/tot*100).toFixed(1)+'%';
  const m=document.createElement('div'); m.className='massbox';
  m.innerHTML=`<div class="row"><span class="muted">Masse</span><span>${tons(tot)} gesamt</span></div>
    <div class="massbar"><i style="width:${pct(eng().dry)};background:var(--muted)"></i><i style="width:${pct(cargoMass())};background:#2a6bd1"></i><i style="width:${pct(S.fuel)};background:var(--accent)"></i></div>
    <div class="legendrow"><span><i style="background:var(--muted)"></i>Schiff ${tons(eng().dry)}</span><span><i style="background:#2a6bd1"></i>Fracht ${tons(cargoMass())}</span><span><i style="background:var(--accent)"></i>Treibstoff ${tons(S.fuel)}</span></div>
    <p>Δv mit dieser Ladung: <b>${km(dvAvail())} km/s</b></p>`;
  const r=refuelInfo();
  if(r && r.need>0.05){ const a=document.createElement('button'); a.className='linkbtn'; a.textContent=`Volltanken hebt es auf ${km(dvWith(eng().cap,cargoMass()))} km/s`; a.onclick=()=>openView('tanken'); m.appendChild(a); }
  p.appendChild(m);
  const h=document.createElement('h3'); h.textContent='Angenommene Aufträge'; p.appendChild(h);
  const list=document.createElement('div'); list.className='acts';
  if(!co.length) list.innerHTML='<p class="hint">Laderaum leer. Aufträge gibt es an Kontoren.</p>';
  co.forEach(o=>{
    const G=GOODS[o.good], to=KBY[o.to], left=o.deadline-S.day, pay=payout(o);
    const span=Math.max(1,o.deadline-(o.created??(o.deadline-60))), frac=Math.max(0,Math.min(1,left/span));
    const el=document.createElement('div'); el.className='order';
    el.innerHTML=`<div class="o-top">${gchip(o.good)}<b>${o.n} × ${G.name} nach ${esc(kontorLabel(to))}</b><span class="num">${fmtCr(pay)}</span></div>
      <div class="o-meta"><span>${tons(o.n*G.m)}</span><span>Route ${km(o.dv)} km/s</span>${o.transship?'<span class="tag">Umschlag</span>':''}</div>
      <div class="frist"><div class="row"><span>Frist ${dateStr(o.deadline)}</span><span class="${left>=0?'ok':'late'}">${left>=0?'noch '+fmtDays(left):fmtDays(-left)+' überfällig, '+Math.round(lateFactor(o,S.day)*100)+' %'}</span></div>
      <div class="fbar"><i style="width:${(frac*100).toFixed(0)}%;background:${left>=0?(frac>0.25?'var(--good)':'var(--warn)'):'var(--bad)'}"></i></div></div>`;
    const row=document.createElement('div'); row.className='o-btns';
    if(!(hereK && hereK.id===o.to) && S.node){ const rl=routeLink(to,'fracht'); rl.style.marginRight='auto'; row.appendChild(rl); }
    if(hereK && hereK.id===o.to) row.appendChild(btn(`Abliefern, ${fmtCr(pay)}`,'go',locked,()=>deliverOrder(o)));
    else if(hereK && hereK.id===o.from){ row.appendChild(btn('Zurückgeben','',locked,()=>returnOrder(o))); }
    else { const pen=Math.round(o.reward*0.2); row.appendChild(btn(`Abbrechen, −${fmtCr(pen)}`,'',locked||pen>S.credits,()=>abortOrder(o))); }
    el.appendChild(row); list.appendChild(el);
  });
  p.appendChild(list);
}

function depotLabel(key){
  if(key==='earth.orbit') return 'Orbitalwerft, Erdorbit';
  if(key==='earth.surf') return 'Erde, alle Bahnhöfe';
  const [node,site]=key.split('@'), body=node.split('.')[0], st=siteOf(body,site);
  return `${st?st.name:''}, ${bodyName(body)}`;
}

function panelTanken(p){
  const r=refuelInfo(); if(!r) return openView('main');
  const locked=S.busy||S.over;
  p.appendChild(phead(`Tanken`, `${esc(nodeName(S.node))}. ${r.source}, ${r.price} Cr pro t, dauert ${fmtDays(r.days)}.`));
  if(S.ui.tank===null) S.ui.tank=+r.max.toFixed(1);
  const amt=Math.min(S.ui.tank,r.max), cost=Math.round(amt*r.price);
  const box=document.createElement('div'); box.className='tankbox';
  box.innerHTML=`<div class="row"><label for="tankamt"><b>Menge</b></label><b class="big">${tons(amt)}</b></div>
    <input id="tankamt" type="range" min="0" max="${r.max.toFixed(1)}" step="0.5" value="${amt}" ${locked||r.max<0.1?'disabled':''}>
    <div class="row muted"><span>Tank ${tons(S.fuel)}</span><span>voll ${tons(eng().cap)}</span></div>`;
  box.querySelector('input').oninput=e=>{ S.ui.tank=+e.target.value; geaendert(); document.getElementById('tankamt')?.focus(); };
  const quick=document.createElement('div'); quick.className='two';
  const needDv=routeNeedHere();
  const forRoute=Math.max(0,Math.min(r.max, fuelFor(needDv,cargoMass())*1.03-S.fuel));
  quick.appendChild(btn(needDv?'Bis Route reicht':'Keine Route geladen','',locked||!needDv,()=>{ S.ui.tank=+forRoute.toFixed(1); geaendert(); }));
  quick.appendChild(btn(r.max<r.need-0.05?'So viel wie bezahlbar':'Voll','',locked,()=>{ S.ui.tank=+r.max.toFixed(1); geaendert(); }));
  box.appendChild(quick); p.appendChild(box);
  const cmp=document.createElement('div'); cmp.className='cmp';
  const dvA=dvWith(S.fuel+amt,cargoMass());
  cmp.innerHTML=`<div><span class="muted">Δv mit Fracht</span><span>${km(dvAvail())} km/s</span><b class="acc">${km(dvA)} km/s</b></div>
    <div><span class="muted">Konto</span><span>${fmtCr(S.credits)}</span><b>${fmtCr(S.credits-cost)}</b></div>
    <p>Kosten ${fmtCr(cost)}.${needDv?` Deine Fracht braucht von hier bis zu ${km(needDv)} km/s, ${dvA>=needDv?'das reicht':'das reicht noch nicht'}.`:''}</p>`;
  p.appendChild(cmp);
  const h=document.createElement('h3'); h.textContent='Preise in der Region'; p.appendChild(h);
  const reg=REGION[here()[0]];
  const rows=Object.entries(FUEL_PRICE).filter(([key])=>REGION[key.split('.')[0]]===reg).sort((a,b)=>a[1]-b[1]);
  const lst=document.createElement('div'); lst.className='pricelist';
  const me=locKey();
  lst.innerHTML=rows.map(([key,pr])=>`<div class="${key===me||key===S.node&&!FUEL_PRICE[me]?'me':''}"><span>${esc(depotLabel(key))}${key===me||key===S.node&&!FUEL_PRICE[me]?' (hier)':''}</span><span>${pr} Cr/t</span></div>`).join('');
  p.appendChild(lst);
  const f=document.createElement('div'); f.className='pfoot';
  f.appendChild(btn(amt>=0.1?`${tons(amt)} für ${fmtCr(cost)} tanken`:(r.need<0.05?'Tank ist voll':'Kein Geld für Treibstoff'),'go wide',locked||amt<0.1,()=>doRefuel(amt)));
  p.appendChild(f);
}

function panelWerft(p){
  const k=kontorAt(); if(!k||!k.hub) return openView('main');
  const locked=S.busy||S.over, cur=eng();
  p.appendChild(phead('Werft', `${esc(kontorLabel(k))}. Konto ${fmtCr(S.credits)}.`));
  const note=document.createElement('p'); note.className='kinfo';
  note.textContent=`Deine ${cur.name} wird mit ${fmtCr(0.7*cur.price)} angerechnet, 70 % ihres Werts. Fracht und Treibstoff ziehen mit um. Der Umbau dauert 5 Tage.`;
  p.appendChild(note);
  const list=document.createElement('div'); list.className='acts';
  const dvFull=sh=>sh.isp*G0*Math.log((sh.dry+sh.cap+8*sh.slots)/(sh.dry+8*sh.slots));
  const dvEmpty=sh=>sh.isp*G0*Math.log((sh.dry+sh.cap)/sh.dry);
  Object.entries(SHIPS).forEach(([id,sh])=>{
    const mine=id===S.ship, net=sh.price-0.7*cur.price, fits=slotsUsed()<=sh.slots, diff=sh.slots-cur.slots;
    const el=document.createElement('div'); el.className='shipcard'+(mine?' mine':'');
    el.innerHTML=`<div class="row"><div><b class="big">${sh.name}</b><div class="muted">${sh.drive}, Isp ${sh.isp} s</div></div>
      <div class="r">${mine?'<span class="muted">dein Schiff</span>':`<b class="big">${fmtCr(net)}</b><div class="muted">Listenpreis ${fmtCr(sh.price)}</div>`}</div></div>
      <div class="stats3s"><div><span class="muted">Frachtplätze</span><b>${sh.slots}${!mine&&diff?` <small class="${diff>0?'up':'down'}">${diff>0?'+':''}${diff}</small>`:''}</b></div>
      <div><span class="muted">Tank</span><b>${sh.cap} t</b></div><div><span class="muted">Δv leer / voll Wasser</span><b>${km(dvEmpty(sh))} / ${km(dvFull(sh))}</b></div></div>`;
    const unlock=S.eco.orders.filter(o=>o.state==='open' && o.n>cur.slots && o.n<=sh.slots);
    if(!mine && unlock.length){ const u=document.createElement('p'); u.className='o-note'; u.style.margin='0';
      const sum=unlock.reduce((a,o)=>a+o.reward,0);
      u.textContent=`Erschließt ${unlock.length} offene Großaufträge im Sonnensystem, zusammen ${fmtCr(sum)}.`; el.appendChild(u); }
    if(!mine) el.appendChild(btn(!fits?'Fracht passt nicht':net>S.credits?`Es fehlen ${fmtCr(net-S.credits)}`:`${sh.name} kaufen`,'go wide',locked||!fits||net>S.credits,()=>buyShip(id)));
    list.appendChild(el);
  });
  p.appendChild(list);
}

export function renderPlace(){
  const w=$('placecard'); w.innerHTML='';
  const k=kontorAt(), r=refuelInfo(), del=deliverables(), locked=S.busy||S.over;
  const c=document.createElement('div'); c.className='place';
  const where=S.node?nodeName(S.node):`Unterwegs nach ${B[S.transit.b].name}`;
  const info = k ? `${k.makes.length?'Erzeugt '+k.makes.map(g=>GOODS[g].name).join(', ')+'. ':''}Braucht ${k.needs.map(g=>GOODS[g].name).join(', ')}.${r?` Treibstoff ${r.price} Cr/t.`:''}`
    : r ? `Tankstelle, ${r.price} Cr/t.` : '';
  c.innerHTML=`<div class="phdr"><div class="pname"><div class="muted small">Standort</div><b>${esc(where)}</b></div>${info?`<p class="kinfo">${esc(info)}</p>`:''}${k?`<span class="tag">${k.hub?'Drehkreuz':'Kontor'}</span>`:''}</div>`;
  const g=document.createElement('div'); g.className='pbtns';
  if(del.length){ const b=ibtn('deliver',`Abliefern (${del.length}), ${fmtCr(del.reduce((s,o)=>s+payout(o),0))}`,'go full',locked,deliverAll); b.style.minHeight='44px'; b.style.display='inline-flex'; b.style.alignItems='center'; b.style.justifyContent='center'; b.style.gap='6px'; c.appendChild(b); }
  if(k){ const n=S.eco.orders.filter(o=>o.state==='open'&&o.from===k.id).length; g.appendChild(ibtn('orders',`Aufträge (${n})`,del.length?'':'go',S.busy,()=>openView('kontor'))); }
  if(r) g.appendChild(ibtn('fuel','Tanken','',S.busy,()=>openView('tanken')));
  if(k&&k.hub) g.appendChild(ibtn('yard','Werft','',S.busy,()=>openView('werft')));
  if(g.children.length){ g.style.gridTemplateColumns=[...g.children].map((b,i)=>i===0&&k?'minmax(0,1.4fr)':'minmax(0,1fr)').join(' '); c.appendChild(g); }
  w.appendChild(c);

  const rs=$('rescue'); rs.innerHTML=''; rs.className='';
  if(S.over){ rs.className='rescue'; rs.innerHTML=`<p>${esc(S.msg)}</p>`; rs.appendChild(btn('Neu starten','go',false,resetGame)); return; }
  if(stranded()){
    rs.className='rescue';
    const ri=rescueInfo();
    rs.innerHTML=ri.local?`<p>Kein Geld für Treibstoff. Die Tankstelle füllt dir den Tank auf Kredit, gegen 2.000 Cr Aufschlag. Dein Konto darf dabei ins Minus gehen.</p>`:`<p>Gestrandet: Mit deinem Treibstoff erreichst du keine Tankstelle mehr. Ein Tanker bringt dir einen vollen Tank, Anfahrt ${fmtDays(ri.days)}; deine Fracht bleibt an Bord.${ri.lift?' Weil selbst ein voller Tank hier nicht reicht, hebt er dich in den Orbit.':''}</p>`;
    rs.appendChild(btn(ri.local?`Auf Kredit volltanken, ${fmtCr(ri.cost)}`:`Notbetankung rufen, ${fmtCr(ri.cost)}`,'go',false,rescue));
  }
}

export function renderPanel(){
  const p=$('panel'); p.innerHTML='';
  const v=S.ui.view;
  if(v==='kontor') panelKontor(p); else if(v==='fracht') panelFracht(p);
  else if(v==='tanken') panelTanken(p); else if(v==='werft') panelWerft(p); else if(v==='route') panelRoute(p);
}

function panelRoute(p){
  const R=S.ui.route; if(!R) return openView('main');
  const locked=S.busy||S.over;
  const autoBtn=()=>{ const g=document.createElement('div'); g.className='pfoot'; g.appendChild(btn('Autopilot stoppen','wide',false,()=>stopAutopilot('Autopilot gestoppt.'))); return g; };
  if(!S.node){
    p.appendChild(phead(`Route: ${targetName(R.target)}`, `Unterwegs nach ${B[S.transit.b].name}, Ankunft ${dateStr(S.transit.arr)}.`));
    const h=document.createElement('p'); h.className='hint'; h.textContent='Der Fahrplan wird nach der Ankunft neu berechnet.'; p.appendChild(h);
    if(S.ui.auto) p.appendChild(autoBtn());
    return;
  }
  if(atTarget(R.target)){
    p.appendChild(phead(`Route: ${targetName(R.target)}`, 'Du bist am Ziel.'));
    if(S.ui.rmsg && S.msg){ const m=document.createElement('div'); m.className='msg'; m.style.margin='0 0 12px'; m.textContent=S.msg; p.appendChild(m); }
    const del=deliverables();
    if(del.length){ const f=document.createElement('div'); f.className='pfoot'; f.appendChild(btn(`Abliefern (${del.length}), ${fmtCr(del.reduce((s,o)=>s+payout(o),0))}`,'go wide',locked,()=>{ deliverAll(); })); p.appendChild(f); }
    return;
  }
  const plans={eco:planRoute(R.target,'eco'), now:planRoute(R.target,'now')};
  const plan=plans[R.mode];
  p.appendChild(phead(`Route: ${targetName(R.target)}`, `Von ${esc(nodeName(S.node))}.`));
  if(S.ui.rmsg && S.msg){ const m=document.createElement('div'); m.className='msg'; m.style.margin='0 0 12px'; m.textContent=S.msg; p.appendChild(m); }
  if(!plan){ const e=document.createElement('p'); e.className='hint'; e.textContent='Dorthin gibt es keine Route.'; p.appendChild(e); return; }
  const chips=document.createElement('div'); chips.className='chips';
  [['eco','Sparsam'],['now','Sofort starten']].forEach(([m,t])=>{
    const pl=plans[m], ok=pl && pl.dv<=dvAvail()+0.5;
    const b=btn(`${t}: ${pl?km(pl.dv)+' km/s, '+fmtDays(pl.days):'–'}`, R.mode===m?'chip on':'chip'+(ok?'':' bad'), false, ()=>{ R.mode=m; geaendert(); });
    b.setAttribute('aria-pressed',R.mode===m); chips.appendChild(b);
  });
  p.appendChild(chips);
  const tl=document.createElement('ol'); tl.className='timeline';
  let run=S.day;
  plan.steps.forEach((st,i)=>{
    run+=st.days; const last=i===plan.steps.length-1;
    const li=document.createElement('li'); li.className=st.kind+(i===0?' first':'')+(last?' last':'');
    li.innerHTML=`<span class="dot"></span><div class="tx"><b>${esc(st.label)}</b><small>${st.kind==='wait'?`${fmtDays(st.days)}, bis ${dateStr(run)}`:fmtDays(st.days)}${last?`, Ankunft ${dateStr(run)}`:''}</small></div><span class="num">${st.kind==='wait'?'–':km(st.dv)+' km/s'}</span>`;
    tl.appendChild(li);
  });
  p.appendChild(tl);
  const have=dvAvail(), ok=plan.dv<=have+0.5; R.strand=false;
  const sum=document.createElement('div'); sum.className='pfoot';
  const deadl=cargoOrders().filter(o=>{ const k=KBY[o.to]; return k.node===R.target.node && (!k.site||k.site===R.target.site); });
  const late=deadl.filter(o=>plan.arrive>o.deadline);
  sum.innerHTML=`<div class="row"><span class="muted">Braucht ${km(plan.dv)} von ${km(have)} km/s</span><b class="${ok?'okc':'badc'}">${ok?'Rest '+km(have-plan.dv)+' km/s':'Es fehlen '+km(plan.dv-have)+' km/s'}</b></div>
    <div class="massbar"><i style="width:${Math.min(100,plan.dv/Math.max(have,1)*100).toFixed(0)}%;background:${ok?'var(--accent)':'var(--bad)'}"></i></div>
    <p class="kinfo">${deadl.length?(late.length?`${late.length} ${late.length>1?'Aufträge kommen':'Auftrag kommt'} nach der Frist an.`:`${deadl.length>1?'Alle '+deadl.length+' Aufträge':'Der Auftrag'} für dieses Ziel ${deadl.length>1?'treffen':'trifft'} vor der Frist ein.`):''}${plan.fee?` Startgebühr ${fmtCr(plan.fee)}.`:''} ${ok?'Der Autopilot hält, wenn unterwegs Fracht abgeliefert werden kann.':dvWith(eng().cap,cargoMass())<plan.dv?`Zu schwer beladen: Auch vollgetankt hättest du nur ${km(dvWith(eng().cap,cargoMass()))} km/s. Gib einen Auftrag zurück oder wähle ein anderes Ziel.`:'Tanke vorher oder wähle eine andere Route.'}</p>`;
  if(ok){
    const cm=cargoMass(), m0=eng().dry+cm+S.fuel, fAfter=Math.max(0, m0/Math.exp(plan.dv/(eng().isp*G0))-eng().dry-cm);
    const cmAfter=cm-deadl.reduce((s,o)=>s+o.n*GOODS[o.good].m,0), rest=dvWith(fAfter,cmAfter);
    const nf=nearestFuel({node:R.target.node, site:R.target.site, day:plan.arrive});
    if(nf.dv>rest+0.5){ R.strand=true;
      const w=document.createElement('p'); w.className='o-warn bad';
      w.textContent=`Achtung: Am Ziel gibt es keine Tankstelle. Danach bleiben dir ${km(rest)} km/s, bis zur nächsten Tankstelle brauchst du ${isFinite(nf.dv)?km(nf.dv)+' km/s':'mehr'}. Du würdest stranden.`;
      sum.appendChild(w);
    } else if(nf.dv>0){
      const w=document.createElement('p'); w.className='o-note';
      w.textContent=`Am Ziel gibt es keine Tankstelle. Mit dem Rest von ${km(rest)} km/s erreichst du die nächste (${km(nf.dv)} km/s).`;
      sum.appendChild(w);
    }
  }
  if(!ok && !S.ui.auto){
    // Route zu teuer: den Weg zur nächsten erreichbaren Tankstelle anbieten
    const nf=nearestFuel({node:S.node,site:S.site,day:S.day});
    if(nf.spot && nf.dv>0 && nf.dv<=have+0.5 && !(nf.spot.node===R.target.node && (nf.spot.site||null)===(R.target.site||null))){
      const fb=btn(`Erst zur nächsten Tankstelle: ${targetName(nf.spot)}, ${km(nf.dv)} km/s`,'wide',locked,()=>openRoute(nf.spot,S.ui.back));
      fb.style.fontSize='.92rem'; sum.appendChild(fb);
    }
  }
  // Tanken direkt im Routenplaner, wenn hier eine Tankstelle ist
  const rf=refuelInfo();
  if(rf && rf.need>0.5 && !S.ui.auto){
    const box=document.createElement('div'); box.className='rtank';
    const dvFull=dvWith(S.fuel+rf.max,cargoMass()), full=rf.max>=rf.need-0.05;
    const forRoute=Math.max(0,Math.min(rf.max, fuelFor(plan.dv,cargoMass())*1.03-S.fuel));
    box.innerHTML=`<div class="row"><span class="muted">Tankstelle hier, ${rf.price} Cr/t, dauert ${fmtDays(rf.days)}</span></div>`;
    const tg=document.createElement('div'); tg.className='two';
    if(rf.max<0.1) tg.appendChild(btn('Kein Geld für Treibstoff','span2',true,()=>{}));
    else {
      tg.appendChild(btn(`${full?'Volltanken':'So viel wie bezahlbar'}: ${tons(rf.max)}, ${fmtCr(rf.max*rf.price)} → ${km(dvFull)} km/s`,'',locked,()=>doRefuel(rf.max,true)));
      if(forRoute>0.5 && forRoute<rf.max-0.5) tg.appendChild(btn(`Bis Route reicht: ${tons(forRoute)}, ${fmtCr(forRoute*rf.price)}`,'',locked,()=>doRefuel(forRoute,true)));
      else tg.firstChild.classList.add('span2');
    }
    box.appendChild(tg);
    const more=document.createElement('button'); more.type='button'; more.className='linkbtn'; more.textContent='Andere Menge wählen';
    more.onclick=()=>openView('tanken','route'); box.appendChild(more);
    sum.appendChild(box);
  }
  const g=document.createElement('div'); g.className='two';
  g.appendChild(btn('Nur nächster Schritt','',locked||!!S.ui.auto||!plan.steps.length,()=>{ const st=plan.steps[0]; S.ui.rmsg=true; if(!execStep(st)){ S.msg=`„${st.label}“ ist gerade nicht möglich. ${stepBlocker(st)}`; } geaendert(); }));
  if(S.ui.auto) g.appendChild(btn('Autopilot stoppen','',false,()=>stopAutopilot('Autopilot gestoppt.')));
  else g.appendChild(R.strand ? btn('Trotzdem starten','',locked||!ok,startAutopilot) : btn('Autopilot starten','go',locked||!ok,startAutopilot));
  sum.appendChild(g); p.appendChild(sum);
}
