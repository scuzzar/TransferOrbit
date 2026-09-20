// Small helpers that know nothing about the game: formatting, angles, a DOM shorthand.

export const VERSION = '43'; // shown in the menu so a stale copy from the browser cache is easy to spot

export const TAU = Math.PI*2;

export const wrap = a => { a = (a+Math.PI) % TAU; if (a<0) a += TAU; return a-Math.PI; };

export const randInt = (a,b) => a+Math.floor(Math.random()*(b-a+1));

export const km = m => (m/1000).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});

export const fmtDays = d => d<1 ? `${Math.max(1,Math.round(d*24))} h` :
  d<730 ? (Math.round(d)===1?'1 day':`${Math.round(d)} days`) : `${(d/365.25).toLocaleString('en-GB',{maximumFractionDigits:1})} years`;

export const dateStr = day => new Date(Date.UTC(2000,0,1,12)+day*864e5)
  .toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});

export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Animations run at a leisurely pace; tapping the map speeds them up (with the autopilot, all the way)
export const SLOW = 2.3, FAST = 6;

export const ANIM = {active:false, fast:false, long:false, instant:false};

export const $ = id => document.getElementById(id);

export const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export const tons = t => `${t.toLocaleString('en-GB',{maximumFractionDigits:1})} t`;

export const isDesk = () => matchMedia('(min-width:900px)').matches;
