// Header, toast, autopilot bar and render() - the one complete rebuild.

import { tick } from '../events.js';
import { ANIM, dateStr, esc, fmtDays, km, byId, findAll, $ } from '../basics.js';
import { GOODS, START_DAY } from '../game/world.js';
import { S } from '../game/state.js';
import { remaining } from '../game/planner.js';
import { stopAutopilot } from '../game/commands.js';
import { draw } from '../map/draw.js';
import { btn, lifeLine } from './widgets.js';
import { renderPick } from './pickcard.js';
import { renderPanel, renderPlace } from './panels.js';
import { UI } from './state.js';

export function speedHint(){ const h=$('speedhint'); if(!h) return;
  const show=ANIM.active && (ANIM.long||ANIM.fast); h.hidden=!show; if(!show) return;
  h.textContent = ANIM.fast ? '» schneller' : 'Tippen: schneller'; h.classList.toggle('on',ANIM.fast); }

export function header(){
  byId('date',HTMLElement).textContent=dateStr(S.day);
  byId('mday',HTMLElement).textContent=`Day ${Math.floor(S.day-START_DAY)}`;
  const dv=S.player.ship.dvAvail, max=S.player.ship.dvWith(S.player.ship.def.cap);
  byId('dv',HTMLElement).innerHTML=`${km(dv)} <small>km/s</small>`;
  byId('gauge',HTMLElement).style.width=`${Math.max(0,Math.min(100,dv/max*100))}%`;
  byId('shipname',HTMLElement).textContent=S.player.ship.def.name;
  const pl=S.player, life=lifeLine(pl,S.day), info=byId('shipinfo',HTMLElement);
  info.textContent=pl.dead ? `${pl.name}, died at ${Math.floor(pl.ageOn(S.day))}` : `${pl.name}, ${Math.floor(pl.ageOn(S.day))} · ${life.text}`;
  info.classList.toggle('risk',life.risk||pl.dead);
  const cr=byId('credits',HTMLElement); cr.innerHTML=`${Math.round(S.player.credits).toLocaleString('en-GB')} <small>Cr</small>`; cr.classList.toggle('neg',S.player.credits<0);
  const cells:string[]=[]; S.player.ship.hold.forEach(o=>{ for(let i=0;i<o.containers;i++) cells.push(`<i style="background:${GOODS[o.good].color}"></i>`); });
  while(cells.length<S.player.ship.def.slots) cells.push('<i></i>');
  byId('mslots',HTMLElement).innerHTML=cells.join('');
  byId('slotinfo',HTMLElement).textContent=`${S.player.ship.def.slots-S.player.ship.slotsUsed} of ${S.player.ship.def.slots} free`;
  byId('autofill',HTMLButtonElement).setAttribute('aria-pressed',String(!!S.player.autoFill));
  byId('cargotile',HTMLButtonElement).classList.toggle('on',UI.view==='cargo');
  byId('shiptile',HTMLButtonElement).classList.toggle('on',UI.view==='ship');
  autobarTime();
}

// A short message in the bottom left of the map
let toastMsg: string|null=null, toastT: number|null=null;

function toast(){
  if(UI.msg===toastMsg) return; toastMsg=UI.msg;
  const t=byId('toast',HTMLElement);
  if(!UI.msg){ t.hidden=true; return; }
  t.textContent=UI.msg; t.hidden=false; t.classList.remove('fade');
  if(toastT) clearTimeout(toastT);
  toastT=setTimeout(()=>{ t.classList.add('fade'); toastT=setTimeout(()=>{ t.hidden=true; },450); },5000);
}

export function render(){
// Set visibility first, then draw: otherwise the map measures a hidden area on mobile (size 0)
  const pv=UI.view!=='main';
  document.body.classList.toggle('panel-open',pv);
  header(); draw(); renderPick(); renderAutobar(); toast();
  byId('mainview',HTMLElement).hidden=pv; byId('panel',HTMLElement).hidden=!pv;
  byId('used',HTMLElement).textContent=`Total used: ${km(S.player.ship.dvUsed)} km/s`;
  findAll(document,'[data-wait]',HTMLButtonElement).forEach(b=>b.disabled=!S.canAct);
  if(pv){ renderPanel(); findAll(document,'#panel button',HTMLButtonElement).forEach(b=>{ if(S.player.out && !b.classList.contains('back')) b.disabled=true; }); return; }
  renderPlace();
}

function renderAutobar(){
  const w=byId('autobar',HTMLElement);
  w.innerHTML=''; w.hidden=!S.player.ship.autopilot;
  const A=S.player.ship.autopilot; if(!A) return;
  const tr=S.player.ship.transit, rest=remaining(A.plan), nx=tr ? null : rest?.legs[0];
  const now=tr ? `Now: to ${tr.along.to.label}, there ${dateStr(tr.arr)}` : nx ? `Now: ${nx.label}` : '';
  w.innerHTML=`<div><b>Autopilot</b> to ${esc(A.target.label)}${rest?`<br><span id="abtime" data-arrive="${rest.arrive}"></span>`:''}${now?`<br><span class="muted">${esc(now)}</span>`:''}</div>`;
  autobarTime();
  w.appendChild(btn('Stop','',false,()=>stopAutopilot('Autopilot stopped.')));
}

// The autopilot's arrival and the time left to it, kept current while time runs
function autobarTime(){
  const t=$('abtime'); if(!t) return;
  const arrive=Number(t.dataset.arrive); t.textContent=`Arrives ${dateStr(arrive)}, in ${fmtDays(Math.max(0,arrive-S.day))}`;
}

// Tapping the map speeds up a running animation.
export function wireDisplay(){
  byId('stage',HTMLElement).addEventListener('pointerdown',()=>{ if(ANIM.active && !ANIM.fast){ ANIM.fast=true; tick(); } });
}