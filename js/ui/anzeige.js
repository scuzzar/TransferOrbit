// Kopfzeile, Meldung, Autopilotleiste und render() - der eine vollständige Aufbau.

import { zeitLief } from '../ereignisse.js';
import { $, ANIM, dateStr, esc, km } from '../basis.js';
import { GOODS, START_DAY } from '../spiel/welt.js';
import { S, cargoOrders, dvAvail, dvOf, eng, slotsUsed, targetName } from '../spiel/zustand.js';
import { planRoute } from '../spiel/planer.js';
import { stopAutopilot } from '../spiel/steuerung.js';
import { draw } from '../karte/zeichnen.js';
import { btn } from './bausteine.js';
import { renderPick } from './pickkarte.js';
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
