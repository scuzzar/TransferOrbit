// Kopfzeile, Meldung, Autopilotleiste und render() - der eine vollständige Aufbau.

import { geaendert, zeitLief } from '../ereignisse.js';
import { $, ANIM, dateStr, esc, fmtDays, km } from '../basis.js';
import { B, FUEL_PRICE, GOODS, KONTORE, M, ROT, SITES, START_DAY, bodyName, bodyOf, fuelHere, hasAtm, hasDepot, latStr, moonsOf, planetOfBody, rotPenalty, siteOf } from '../spiel/welt.js';
import { transfer } from '../spiel/physik.js';
import { S, atTarget, cargoOrders, dvAvail, dvOf, eng, homePlanet, pickTarget, slotsUsed, targetName } from '../spiel/zustand.js';
import { idealTransfer } from '../spiel/graph.js';
import { planRoute } from '../spiel/planer.js';
import { stopAutopilot } from '../spiel/steuerung.js';
import { cargoTo } from '../karte/leinwand.js';
import { setView } from '../karte/ansicht.js';
import { draw } from '../karte/zeichnen.js';
import { btn, openRoute } from './bausteine.js';
import { renderPanel, renderPlace } from './panels.js';

export function speedHint(){ const h=document.getElementById('speedhint'); if(!h) return;
  const show=ANIM.active && (ANIM.long||ANIM.fast); h.hidden=!show; if(!show) return;
  h.textContent = ANIM.fast ? '» schneller' : 'Tippen: schneller'; h.classList.toggle('on',ANIM.fast); }

export function header(){
  $('date').textContent=dateStr(S.day);
  $('mday').textContent=`Tag ${Math.floor(S.day-START_DAY)}`;
  const dv=dvAvail(), max=dvOf(eng().cap);
  $('dv').innerHTML=`${km(dv)} <small>km/s</small>`;
  $('gauge').style.width=`${Math.max(0,Math.min(100,dv/max*100))}%`;
  $('shipname').textContent=eng().name;
  $('shipinfo').textContent=`${eng().drive}, Isp ${eng().isp} s`;
  $('credits').innerHTML=`${Math.round(S.credits).toLocaleString('de-DE')} <small>Cr</small>`; $('credits').classList.toggle('neg',S.credits<0);
  const cells=[]; cargoOrders().forEach(o=>{ for(let i=0;i<o.n;i++) cells.push(`<i style="background:${GOODS[o.good].color}"></i>`); });
  while(cells.length<eng().slots) cells.push('<i></i>');
  $('mslots').innerHTML=cells.join('');
  $('slotinfo').textContent=`${eng().slots-slotsUsed()} von ${eng().slots} frei`;
  const af=$('autofill'); af.setAttribute('aria-pressed',!!S.autoFill);
  $('cargotile').classList.toggle('on',S.ui.view==='fracht');
}

// Kurze Meldung unten links auf der Karte
let toastMsg=null, toastT=null;

function toast(){
  if(S.msg===toastMsg) return; toastMsg=S.msg;
  const t=$('toast'); if(!S.msg){ t.hidden=true; return; }
  t.textContent=S.msg; t.hidden=false; t.classList.remove('fade');
  clearTimeout(toastT); toastT=setTimeout(()=>{ t.classList.add('fade'); toastT=setTimeout(()=>{ t.hidden=true; },450); },5000);
}

export function render(){
  // Erst Sichtbarkeit setzen, dann zeichnen: sonst misst die Karte mobil eine ausgeblendete Fläche (Größe 0)
  const pv=S.ui.view!=='main';
  document.body.classList.toggle('panel-open',pv);
  header(); draw(); renderPick(); renderAutobar(); toast();
  $('mainview').hidden=pv; $('panel').hidden=!pv;
  $('used').textContent=`Gesamt verbraucht: ${km(S.used)} km/s`;
  document.querySelectorAll('[data-wait]').forEach(b=>b.disabled=S.busy||S.over);
  if(pv){ renderPanel(); document.querySelectorAll('#panel button').forEach(b=>{ if(S.over && !b.classList.contains('back')) b.disabled=true; }); return; }
  renderPlace();
}

function actionTags(a,H){
  const T=[];
  if(a.to){
    const k=KONTORE.find(k=>k.node===a.to && (!k.site || k.site===(a.site||null) || (!a.site && k.node==='earth.surf')));
    H.step.filter(s=>s.node===a.to && (s.site||null)===(a.site||null) && Math.abs(s.dv-a.dv)<1).forEach(s=>{
      T.push(s.final?{cls:'deliver',txt:`Lieferziel: ${s.n} ${s.n>1?'Aufträge':'Auftrag'}`}:{cls:'toward',txt:`Richtung ${s.name}`});
    });
    if(k && !T.some(t=>t.cls==='deliver')){
      const n=S.eco.orders.filter(o=>o.state==='open'&&o.from===k.id).length;
      T.push({cls:'kontor',txt:`Kontor${n?`, ${n} ${n>1?'Aufträge':'Auftrag'}`:''}`});
    }
  }
  return T;
}

function renderPick(){
  const w=$('pickcard'); w.innerHTML='';
  const p=S.ui.pick; if(!p) return;
  const locked=S.busy||S.over, c=document.createElement('div'); c.className='pick';
  const tag=(cls,t)=>`<span class="mtag ${cls}">${t}</span>`;
  let title='', tags=[], info='', stats=[], btns=[];
  const close=`<button type="button" class="x" aria-label="Auswahl schließen">×</button>`;
  if(p.type==='planet'){
    const k=p.planet, hp=homePlanet(), kon=KONTORE.filter(x=>planetOfBody(bodyOf(x))===k);
    const n=cargoTo(x=>planetOfBody(bodyOf(x))===k).length;
    title=B[k].name; if(n) tags.push(tag('deliver',`Lieferziel: ${n} ${n>1?'Aufträge':'Auftrag'}`));
    const ms=moonsOf(k);
    info=`${ms.length?'Mit '+ms.map(m=>M[m].name).join(', ')+'. ':''}${kon.length?kon.length+(kon.length>1?' Kontore':' Kontor')+(kon.some(x=>x.hub)?', davon ein Drehkreuz.':'.'):'Kein Kontor.'}`;
    if(hp && hp!==k){ const t=transfer(hp,k,S.day), id=idealTransfer(hp,k);
      stats.push(['Transfer bei Fenster',`${km(id.total)} km/s`]);
      stats.push(['Nächstes Fenster', t.d<0.04?'<span class="ok">offen</span>':`<span class="wait">in ${fmtDays(t.wait)}</span>`]); }
    else if(hp===k) stats.push(['Du bist','in diesem System']);
    const deeper = ms.length ? {level:'sys',planet:k} : SITES[k] ? {level:'body',planet:k,body:k} : null;
    if(deeper) btns.push(['Näher ansehen','',()=>setView(deeper)]);
    if(hp!==k) btns.push(['Route planen','go',()=>openRoute(pickTarget(p))]);
  } else if(p.type==='body'){
    const b=p.body, kon=KONTORE.filter(x=>bodyOf(x)===b), n=cargoTo(x=>bodyOf(x)===b).length, st=SITES[b]||[];
    title=bodyName(b); if(n) tags.push(tag('deliver',`Lieferziel: ${n} ${n>1?'Aufträge':'Auftrag'}`));
    if(kon.length) tags.push(tag('kontor',kon.length>1?`${kon.length} Kontore`:'Kontor'));
    if(hasDepot(b)) tags.push(tag('toward','Tankstelle'));
    info = st.length ? `${st.length} ${st.length>1?'Landeplätze':'Landeplatz'}: ${st.map(s=>s.name).join(', ')}.` : 'Keine feste Oberfläche.';
    if(st.length){ const down=M[b]?M[b].down:B[b].surf.down, up=M[b]?M[b].up:B[b].surf.up;
      stats.push(['Landung aus dem Orbit',`ab ${km(down)} km/s`]); stats.push(['Rückstart',B[b]&&B[b].surf.launcher?'Trägerrakete':`ab ${km(up)} km/s`]); }
    if(st.length) btns.push(['Landeplätze zeigen','',()=>setView({level:'body',planet:planetOfBody(b),body:b})]);
    const t=pickTarget(p); if(!atTarget(t)) btns.push([`Route: ${st.length?'Orbit':'hoher Orbit'}`,'go',()=>openRoute(t)]);
  } else {
    const t=pickTarget(p), [b,l]=p.node.split('.'), kon=KONTORE.find(x=>x.node===p.node && (!x.site||x.site===p.site));
    title=targetName(t).replace(/ \(.*\)$/,'');
    const n=kon?cargoTo(x=>x.id===kon.id).length:0;
    if(n) tags.push(tag('deliver',`Lieferziel: ${n} ${n>1?'Aufträge':'Auftrag'}`));
    if(kon) tags.push(tag('kontor',kon.hub?'Drehkreuz':'Kontor'));
    if(p.site){
      const st=siteOf(b,p.site), fp=FUEL_PRICE[p.node+'@'+p.site]??FUEL_PRICE[p.node];
      if(st.depot&&fp!==undefined) tags.push(tag('toward',`Tankstelle, ${fp} Cr/t`));
      info=`${latStr(st.lat)}, ${bodyName(b)}.${kon?(kon.makes.length?' Erzeugt '+kon.makes.map(g=>GOODS[g].name).join(', ')+'.':'')+' Braucht '+kon.needs.map(g=>GOODS[g].name).join(', ')+'.':''}${st.note?' '+st.note+'.':''}`;
      const pen=rotPenalty(b,st.lat), down=(M[b]?M[b].down:B[b].surf.down)+(hasAtm(b)?0:pen), up=(M[b]?M[b].up:B[b].surf.up)+pen;
      stats.push(['Landung aus dem Orbit',`${km(down)} km/s`]);
      stats.push([(ROT[b]||0)>=20?`Rückstart, ${Math.round((ROT[b]||0)-pen)} von ${ROT[b]} m/s Bonus`:'Rückstart', B[b]&&B[b].surf.launcher?`Trägerrakete${pen>1?', '+km(pen)+' km/s selbst':''}`:`${km(up)} km/s`]);
    } else {
      info = l==='capt' ? 'Tor zu anderen Planeten und zu den Monden.' : 'Tor zur Oberfläche.';
      if(fuelHere(p.node,null)) tags.push(tag('toward',`Tankstelle, ${FUEL_PRICE[p.node]} Cr/t`));
      if(kon) info+=` ${kon.name}: ${kon.makes.length?'erzeugt '+kon.makes.map(g=>GOODS[g].name).join(', ')+', ':''}braucht ${kon.needs.map(g=>GOODS[g].name).join(', ')}.`;
    }
    if(!atTarget(t)) btns.push([p.site?'Route hierher':'Route planen','go',()=>openRoute(t)]);
  }
  const hereNow = (p.type!=='planet') && atTarget(pickTarget(p));
  if(hereNow) tags.push(tag('here','Du bist hier'));
  c.innerHTML=`<div class="row"><b class="big">${esc(title)}</b>${close}</div>${tags.length?`<div class="mtags">${tags.join('')}</div>`:''}
    ${info?`<p class="kinfo">${esc(info)}</p>`:''}${stats.length?`<div class="pstats">${stats.map(([a,b])=>`<div><span class="muted">${a}</span><b>${b}</b></div>`).join('')}</div>`:''}`;
  c.querySelector('.x').onclick=()=>{ S.ui.pick=null; geaendert(); };
  if(btns.length){ const g=document.createElement('div'); g.className='two';
    btns.forEach(([t,cls,fn])=>g.appendChild(btn(t,cls,cls==='go'&&locked,fn))); if(btns.length===1) g.firstChild.classList.add('span2'); c.appendChild(g); }
  w.appendChild(c);
}

function renderAutobar(){
  const w=$('autobar'); w.innerHTML=''; w.hidden=!S.ui.auto; if(!S.ui.auto) return;
  const plan=planRoute(S.ui.auto.target,S.ui.auto.mode), nx=plan&&plan.steps[0];
  w.innerHTML=`<div><b>Autopilot</b> nach ${esc(targetName(S.ui.auto.target))}${nx?`<br><span class="muted">Jetzt: ${esc(nx.label)}</span>`:''}</div>`;
  w.appendChild(btn('Stopp','',false,()=>stopAutopilot('Autopilot gestoppt.')));
}

// Ein Tippen auf die Karte beschleunigt eine laufende Animation.
export function verdrahteAnzeige(){
  $('stage').addEventListener('pointerdown',()=>{ if(ANIM.active && !ANIM.fast){ ANIM.fast=true; zeitLief(); } });
}
