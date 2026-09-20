// Menu, fullscreen, legend, version line.

import { changed } from '../events.js';
import { $, VERSION, isDesk } from '../basics.js';
import { S } from '../game/state.js';
import { autoFill, loadSlot, openView, resetGame, saveSlot, waitDays } from '../game/commands.js';
import { draw } from '../map/draw.js';

export const menu=$('menu'), menubtn=$('menubtn');

const resetBtn=menu.querySelector('[data-menu="reset"]');

function disarmReset(){ resetBtn.classList.remove('armed'); resetBtn.textContent='Start over'; }

export function setMenu(open){ menu.hidden=!open; menubtn.setAttribute('aria-expanded',open); if(!open) disarmReset(); }

export const infobtn=$('infobtn');

export function setLegend(open){ $('legend').hidden=!open; infobtn.setAttribute('aria-expanded',open); }

// Fullscreen where the browser allows it (Safari on iPhone cannot do it for pages)
export const isFs = () => !!(document.fullscreenElement||document.webkitFullscreenElement);

export function toggleFs(){
  const el=document.documentElement;
  try{
    if(isFs()) (document.exitFullscreen||document.webkitExitFullscreen).call(document);
    else { const r=(el.requestFullscreen||el.webkitRequestFullscreen).call(el); if(r&&r.catch) r.catch(()=>{ S.msg='Fullscreen is blocked here.'; changed(); }); }
  }catch(e){ S.msg='Fullscreen is blocked here.'; changed(); }
}

export function wireMenu(){
  menubtn.onclick=e=>{ e.stopPropagation(); setMenu(menu.hidden); };
  menu.onclick=e=>e.stopPropagation();
  document.addEventListener('click',()=>{ setMenu(false); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ setMenu(false); setLegend(false); } });
  menu.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>{
    const a=b.dataset.menu;
// Browser dialogs (confirm) are often blocked on embedded pages, so the second tap confirms
    if(a==='reset' && !b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='Really start over? Tap again'; return; }
    setMenu(false);
    if(a==='fs') toggleFs(); else if(a==='save') saveSlot(); else if(a==='load') loadSlot();
    else if(a==='reset') resetGame();
  });
  document.querySelectorAll('[data-wait]').forEach(b=>b.onclick=()=>{ setMenu(false); if(S.ui.view!=='main' && !isDesk()) openView('main'); waitDays(+b.dataset.wait); });
  infobtn.onclick=e=>{ e.stopPropagation(); setLegend($('legend').hidden); };
  $('legend').onclick=()=>setLegend(false);
  $('autofill').onclick=()=>{ S.autoFill=!S.autoFill; S.msg=S.autoFill?'Always fill up: on. At every depot the tank is filled as far as the money goes.':'Always fill up: off.'; changed(); autoFill(); };
  $('cargotile').onclick=()=>openView(S.ui.view==='cargo'?'main':'cargo');
  wireFullscreen();
  showVersion();
}

// Only offer fullscreen where the browser allows it.
function wireFullscreen(){
  const b=$('fs'), m=$('menufs');
  if(!(document.fullscreenEnabled||document.webkitFullscreenEnabled)) return;
  b.hidden=false; m.hidden=false;
  b.onclick=toggleFs;
  const upd=()=>{ const on=isFs(); b.setAttribute('aria-label',on?'Exit fullscreen':'Fullscreen'); m.textContent=on?'Exit fullscreen':'Fullscreen'; setTimeout(draw,100); };
  document.addEventListener('fullscreenchange',upd); document.addEventListener('webkitfullscreenchange',upd);
}

// document.lastModified is the timestamp of the delivered file: an old date here means a
// stale copy sits in the browser cache (GitHub Pages: 10 minutes).
function showVersion(){
  const d=new Date(document.lastModified);
  const stand = isNaN(d) ? '' : ' · as of ' + d.toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  $('ver').textContent = `Version ${VERSION}${stand}`;
}
