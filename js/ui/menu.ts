// Menu, fullscreen, legend, version line.

import { changed } from '../events.js';
import { VERSION, isDesk, byId, find, findAll } from '../basics.js';
import { S } from '../game/state.js';
import { loadSlot, resetGame, saveSlot, setAutoFill, waitDays } from '../game/commands.js';
import { draw } from '../map/draw.js';
import { UI } from './state.js';
import { openView } from './widgets.js';

export const menu = byId('menu',HTMLElement), menubtn = byId('menubtn',HTMLButtonElement);

const resetBtn = find(menu,'[data-menu="reset"]',HTMLButtonElement);

function disarmReset(){ resetBtn.classList.remove('armed'); resetBtn.textContent = 'Start over'; }

export function setMenu(open: boolean){ menu.hidden = !open; menubtn.setAttribute('aria-expanded', String(open)); if(!open) disarmReset(); }

export const infobtn = byId('infobtn',HTMLButtonElement);

export function setLegend(open: boolean){ byId('legend',HTMLElement).hidden = !open; infobtn.setAttribute('aria-expanded', String(open)); }

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
    else if(el.requestFullscreen) el.requestFullscreen().catch(()=>{ UI.msg = 'Fullscreen is blocked here.'; changed(); });
    else el.webkitRequestFullscreen?.();
  }catch(e){ UI.msg = 'Fullscreen is blocked here.'; changed(); }
}

export function wireMenu(){
  menubtn.onclick = (e)=>{ e.stopPropagation(); setMenu(menu.hidden === true); };
  menu.onclick = (e)=>e.stopPropagation();
  document.addEventListener('click',()=>{ setMenu(false); });
  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ setMenu(false); setLegend(false); } });
  findAll(menu,'[data-menu]',HTMLButtonElement).forEach((b)=>b.onclick = ()=>{
    const a = b.dataset.menu;
    // Browser dialogs (confirm) are often blocked on embedded pages, so the second tap confirms
    if(a==='reset' && !b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='Really start over? Tap again'; return; }
    setMenu(false);
    if(a==='fs') toggleFs(); else if(a==='save') saveSlot(); else if(a==='load') loadSlot();
    else if(a==='reset') resetGame();
  });
  findAll(document,'[data-wait]',HTMLButtonElement).forEach((b)=>b.onclick = ()=>{ setMenu(false); if(UI.view!=='main' && !isDesk()) openView('main'); waitDays(Number(b.dataset.wait)); });
  infobtn.onclick = (e)=>{ e.stopPropagation(); setLegend(byId('legend',HTMLElement).hidden === true); };
  byId('legend',HTMLElement).onclick = ()=>setLegend(false);
  byId('autofill',HTMLButtonElement).onclick = ()=>setAutoFill(!S.domain.autoFill);
  byId('cargotile',HTMLButtonElement).onclick = ()=>openView(UI.view==='cargo'?'main':'cargo');
  wireFullscreen();
  showVersion();
}

// Only offer fullscreen where the browser allows it.
function wireFullscreen(){
  const b = byId('fs',HTMLButtonElement), m = byId('menufs',HTMLElement);
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
  byId('ver',HTMLElement).textContent = `Version ${VERSION}${stand}`;
}
