// Header, toast, autopilot bar and render() - the one complete rebuild.

import { tick } from '../events.js';
import { ANIM, dateStr, esc, km, byId, findAll, $ } from '../basics.js';
import { GOODS, START_DAY } from '../game/world.js';
import { S, cargoOrders, dvAvail, dvOf, eng, slotsUsed, targetName } from '../game/state.js';
import { planRoute } from '../game/planner.js';
import { stopAutopilot } from '../game/commands.js';
import { draw } from '../map/draw.js';
import { btn } from './widgets.js';
import { renderPick } from './pickcard.js';
import { renderPanel, renderPlace } from './panels.js';

export function speedHint(){ const h=$('speedhint'); if(!h) return;
  const show=ANIM.active && (ANIM.long||ANIM.fast); h.hidden=!show; if(!show) return;
  h.textContent = ANIM.fast ? '» schneller' : 'Tippen: schneller'; h.classList.toggle('on',ANIM.fast); }

export function header(){
  byId('date',HTMLElement).textContent=dateStr(S.domain.day);
  byId('mday',HTMLElement).textContent=`Day ${Math.floor(S.domain.day-START_DAY)}`;
  const dv=dvAvail(), max=dvOf(eng().cap);
  byId('dv',HTMLElement).innerHTML=`${km(dv)} <small>km/s</small>`;
  byId('gauge',HTMLElement).style.width=`${Math.max(0,Math.min(100,dv/max*100))}%`;
  byId('shipname',HTMLElement).textContent=eng().name;
  byId('shipinfo',HTMLElement).textContent=`${eng().drive}, Isp ${eng().isp} s`;
  const cr=byId('credits',HTMLElement); cr.innerHTML=`${Math.round(S.domain.credits).toLocaleString('en-GB')} <small>Cr</small>`; cr.classList.toggle('neg',S.domain.credits<0);
  const cells:string[]=[]; cargoOrders().forEach(o=>{ for(let i=0;i<o.n;i++) cells.push(`<i style="background:${GOODS[o.good].color}"></i>`); });
  while(cells.length<eng().slots) cells.push('<i></i>');
  byId('mslots',HTMLElement).innerHTML=cells.join('');
  byId('slotinfo',HTMLElement).textContent=`${eng().slots-slotsUsed()} of ${eng().slots} free`;
  byId('autofill',HTMLButtonElement).setAttribute('aria-pressed',String(!!S.domain.autoFill));
  byId('cargotile',HTMLButtonElement).classList.toggle('on',S.ui.view==='cargo');
}

// A short message in the bottom left of the map
let toastMsg: string|null=null, toastT: number|null=null;

function toast(){
  if(S.ui.msg===toastMsg) return; toastMsg=S.ui.msg;
  const t=byId('toast',HTMLElement);
  if(!S.ui.msg){ t.hidden=true; return; }
  t.textContent=S.ui.msg; t.hidden=false; t.classList.remove('fade');
  if(toastT) clearTimeout(toastT);
  toastT=setTimeout(()=>{ t.classList.add('fade'); toastT=setTimeout(()=>{ t.hidden=true; },450); },5000);
}

export function render(){
// Set visibility first, then draw: otherwise the map measures a hidden area on mobile (size 0)
  const pv=S.ui.view!=='main';
  document.body.classList.toggle('panel-open',pv);
  header(); draw(); renderPick(); renderAutobar(); toast();
  byId('mainview',HTMLElement).hidden=pv; byId('panel',HTMLElement).hidden=!pv;
  byId('used',HTMLElement).textContent=`Total used: ${km(S.domain.used)} km/s`;
  findAll(document,'[data-wait]',HTMLButtonElement).forEach(b=>b.disabled=S.action.busy||S.domain.over);
  if(pv){ renderPanel(); findAll(document,'#panel button',HTMLButtonElement).forEach(b=>{ if(S.domain.over && !b.classList.contains('back')) b.disabled=true; }); return; }
  renderPlace();
}

function renderAutobar(){
  const w=byId('autobar',HTMLElement);
  w.innerHTML=''; w.hidden=!S.ui.auto;
  const A=S.ui.auto; if(!A) return;
  const plan=planRoute(A.target,A.mode), nx=plan&&plan.steps[0];
  w.innerHTML=`<div><b>Autopilot</b> to ${esc(targetName(A.target))}${nx?`<br><span class="muted">Now: ${esc(nx.label)}</span>`:''}</div>`;
  w.appendChild(btn('Stop','',false,()=>stopAutopilot('Autopilot stopped.')));
}

// Tapping the map speeds up a running animation.
export function wireDisplay(){
  byId('stage',HTMLElement).addEventListener('pointerdown',()=>{ if(ANIM.active && !ANIM.fast){ ANIM.fast=true; tick(); } });
}