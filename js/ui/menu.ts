// Menu, fullscreen, legend, version line.

import { changed } from '../events.js';
import { $, VERSION, isDesk } from '../basics.js';
import { S } from '../game/state.js';
import { autoFill, loadSlot, openView, resetGame, saveSlot, waitDays } from '../game/commands.js';
import { draw } from '../map/draw.js';

export const menu = $('menu') as HTMLElement, menubtn = $('menubtn') as HTMLButtonElement;

const resetBtn = menu.querySelector('[data-menu="reset"]') as HTMLButtonElement;

function disarmReset(){ resetBtn.classList.remove('armed'); resetBtn.textContent = 'Start over'; }

export function setMenu(open: boolean){ menu.hidden = !open; menubtn.setAttribute('aria-expanded', String(open)); if(!open) disarmReset(); }

export const infobtn = $('infobtn') as HTMLButtonElement;

export function setLegend(open: boolean){ ($('legend') as HTMLElement).hidden = !open; infobtn.setAttribute('aria-expanded', String(open)); }

// Fullscreen where the browser allows it (Safari on iPhone cannot do it for pages)
// Safari still ships only the prefixed fullscreen API
type WebkitDocument = Document & { webkitFullscreenElement?:Element|null; webkitExitFullscreen?:()=>void; webkitFullscreenEnabled?:boolean };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?:()=>void };
const doc = document as WebkitDocument;

export const isFs = () => !!(document.fullscreenElement || doc.webkitFullscreenElement);

export function toggleFs(){
  const el = document.documentElement as WebkitElement;
  try{
    if(isFs()){ if(document.exitFullscreen) document.exitFullscreen(); else doc.webkitExitFullscreen?.(); }
    else if(el.requestFullscreen) el.requestFullscreen().catch(()=>{ S.ui.msg = 'Fullscreen is blocked here.'; changed(); });
    else el.webkitRequestFullscreen?.();
  }catch(e){ S.ui.msg = 'Fullscreen is blocked here.'; changed(); }
}

export function wireMenu(){
  menubtn.onclick = (e)=>{ (e as MouseEvent).stopPropagation(); setMenu(menu.hidden === true); };
  menu.onclick = (e)=>(e as MouseEvent).stopPropagation();
  document.addEventListener('click',()=>{ setMenu(false); });
  document.addEventListener('keydown',(e)=>{ if((e as KeyboardEvent).key==='Escape'){ setMenu(false); setLegend(false); } });
  menu.querySelectorAll('[data-menu]').forEach((b)=>(b as HTMLButtonElement).onclick = ()=>{
    const a = (b as HTMLButtonElement).dataset.menu;
    // Browser dialogs (confirm) are often blocked on embedded pages, so the second tap confirms
    if(a==='reset' && !(b as HTMLButtonElement).classList.contains('armed')){ (b as HTMLButtonElement).classList.add('armed'); (b as HTMLButtonElement).textContent='Really start over? Tap again'; return; }
    setMenu(false);
    if(a==='fs') toggleFs(); else if(a==='save') saveSlot(); else if(a==='load') loadSlot();
    else if(a==='reset') resetGame();
  });
  document.querySelectorAll('[data-wait]').forEach((b)=>(b as HTMLButtonElement).onclick = ()=>{ setMenu(false); if(S.ui.view!=='main' && !isDesk()) openView('main'); waitDays(+(((b as HTMLButtonElement).dataset.wait as string))); });
  infobtn.onclick = (e)=>{ (e as MouseEvent).stopPropagation(); setLegend(($('legend') as HTMLElement).hidden === true); };
  ($('legend') as HTMLElement).onclick = ()=>setLegend(false);
  ($('autofill') as HTMLButtonElement).onclick = ()=>{ S.domain.autoFill = !S.domain.autoFill; S.ui.msg = S.domain.autoFill?'Always fill up: on. At every depot the tank is filled as far as the money goes.':'Always fill up: off.'; changed(); autoFill(); };
  ($('cargotile') as HTMLButtonElement).onclick = ()=>openView(S.ui.view==='cargo'?'main':'cargo');
  wireFullscreen();
  showVersion();
}

// Only offer fullscreen where the browser allows it.
function wireFullscreen(){
  const b = $('fs') as HTMLButtonElement, m = $('menufs') as HTMLElement;
  if(!(document.fullscreenEnabled || doc.webkitFullscreenEnabled)) return;
  b.hidden = false; m.hidden = false;
  b.onclick = toggleFs;
  const upd = ()=>{ const on = isFs(); b.setAttribute('aria-label', on?'Exit fullscreen':'Fullscreen'); m.textContent = on?'Exit fullscreen':'Fullscreen'; setTimeout(draw,100); };
  document.addEventListener('fullscreenchange',upd); document.addEventListener('webkitfullscreenchange',upd);
}

// document.lastModified is the timestamp of the delivered file: an old date here means a
// stale copy sits in the browser cache (GitHub Pages: 10 minutes).
function showVersion(){
  const d = new Date(document.lastModified);
  const stand = isNaN(d.getTime()) ? '' : ' · as of ' + d.toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  ($('ver') as HTMLElement).textContent = `Version ${VERSION}${stand}`;
}
