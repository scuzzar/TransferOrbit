// Menü, Vollbild, Legende, Versionszeile.

import { geaendert } from '../ereignisse.js';
import { $, VERSION, isDesk } from '../basis.js';
import { S } from '../spiel/zustand.js';
import { autoFill, loadSlot, openView, resetGame, saveSlot, waitDays } from '../spiel/steuerung.js';
import { draw } from '../karte/zeichnen.js';

export const menu=$('menu'), menubtn=$('menubtn');

const resetBtn=menu.querySelector('[data-menu="reset"]');

function disarmReset(){ resetBtn.classList.remove('armed'); resetBtn.textContent='Neu starten'; }

export function setMenu(open){ menu.hidden=!open; menubtn.setAttribute('aria-expanded',open); if(!open) disarmReset(); }

export const infobtn=$('infobtn');

export function setLegend(open){ $('legend').hidden=!open; infobtn.setAttribute('aria-expanded',open); }

// Vollbild, wo der Browser es erlaubt (iPhone-Safari kann es für Seiten nicht)
export const isFs = () => !!(document.fullscreenElement||document.webkitFullscreenElement);

export function toggleFs(){
  const el=document.documentElement;
  try{
    if(isFs()) (document.exitFullscreen||document.webkitExitFullscreen).call(document);
    else { const r=(el.requestFullscreen||el.webkitRequestFullscreen).call(el); if(r&&r.catch) r.catch(()=>{ S.msg='Vollbild ist hier gesperrt.'; geaendert(); }); }
  }catch(e){ S.msg='Vollbild ist hier gesperrt.'; geaendert(); }
}

export function verdrahteMenue(){
  menubtn.onclick=e=>{ e.stopPropagation(); setMenu(menu.hidden); };
  menu.onclick=e=>e.stopPropagation();
  document.addEventListener('click',()=>{ setMenu(false); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ setMenu(false); setLegend(false); } });
  menu.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>{
    const a=b.dataset.menu;
    // Browser-Dialoge (confirm) sind in eingebetteten Seiten oft gesperrt, daher Bestätigung per zweitem Klick
    if(a==='reset' && !b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='Wirklich neu starten? Nochmal tippen'; return; }
    setMenu(false);
    if(a==='fs') toggleFs(); else if(a==='save') saveSlot(); else if(a==='load') loadSlot();
    else if(a==='reset') resetGame();
  });
  document.querySelectorAll('[data-wait]').forEach(b=>b.onclick=()=>{ setMenu(false); if(S.ui.view!=='main' && !isDesk()) openView('main'); waitDays(+b.dataset.wait); });
  infobtn.onclick=e=>{ e.stopPropagation(); setLegend($('legend').hidden); };
  $('legend').onclick=()=>setLegend(false);
  $('autofill').onclick=()=>{ S.autoFill=!S.autoFill; S.msg=S.autoFill?'Immer volltanken: an. An jeder Tankstelle wird der Tank gefuellt, soweit das Geld reicht.':'Immer volltanken: aus.'; geaendert(); autoFill(); };
  $('cargotile').onclick=()=>openView(S.ui.view==='fracht'?'main':'fracht');
  verdrahteVollbild();
  zeigeVersion();
}

// Vollbild nur anbieten, wo der Browser es erlaubt.
function verdrahteVollbild(){
  const b=$('fs'), m=$('menufs');
  if(!(document.fullscreenEnabled||document.webkitFullscreenEnabled)) return;
  b.hidden=false; m.hidden=false;
  b.onclick=toggleFs;
  const upd=()=>{ const on=isFs(); b.setAttribute('aria-label',on?'Vollbild beenden':'Vollbild'); m.textContent=on?'Vollbild beenden':'Vollbild'; setTimeout(draw,100); };
  document.addEventListener('fullscreenchange',upd); document.addEventListener('webkitfullscreenchange',upd);
}

// document.lastModified ist der Stand der ausgelieferten Datei: zeigt es ein altes
// Datum, liegt eine veraltete Fassung im Browser-Cache (GitHub Pages: 10 Minuten).
function zeigeVersion(){
  const d=new Date(document.lastModified);
  const stand = isNaN(d) ? '' : ' · Stand ' + d.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  $('ver').textContent = `Version ${VERSION}${stand}`;
}
