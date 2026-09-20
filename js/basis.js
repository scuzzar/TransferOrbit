// Kleinteile ohne Spielwissen: Zahlen formatieren, Winkel, DOM-Kürzel.

export const VERSION = '41'; // steht im Menü, damit man eine veraltete Fassung aus dem Cache erkennt

export const TAU = Math.PI*2;

export const wrap = a => { a = (a+Math.PI) % TAU; if (a<0) a += TAU; return a-Math.PI; };

export const randInt = (a,b) => a+Math.floor(Math.random()*(b-a+1));

export const km = m => (m/1000).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});

export const fmtDays = d => d<1 ? `${Math.max(1,Math.round(d*24))} Std.` :
  d<730 ? (Math.round(d)===1?'1 Tag':`${Math.round(d)} Tage`) : `${(d/365.25).toLocaleString('de-DE',{maximumFractionDigits:1})} Jahre`;

export const dateStr = day => new Date(Date.UTC(2000,0,1,12)+day*864e5)
  .toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});

export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Animationen laufen gemächlich; ein Tippen auf die Karte beschleunigt (beim Autopilot bis zum Ziel)
export const SLOW = 2.3, FAST = 6;

export const ANIM = {active:false, fast:false, long:false, sofort:false};

export const $ = id => document.getElementById(id);

export const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export const tons = t => `${t.toLocaleString('de-DE',{maximumFractionDigits:1})} t`;

export const isDesk = () => matchMedia('(min-width:900px)').matches;
