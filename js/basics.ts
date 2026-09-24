// Small helpers that know nothing about the game: formatting, angles, DOM shorthands.

export const VERSION = '56'; // shown in the menu so a stale copy from the browser cache is easy to spot

export const TAU = Math.PI*2;

export const wrap = (a: number) => { a = (a+Math.PI) % TAU; if (a<0) a += TAU; return a-Math.PI; };

export const randInt = (a: number, b: number) => a+Math.floor(Math.random()*(b-a+1));

export const km = (m: number) => (m/1000).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});

export const fmtDays = (d: number) => d<1 ? `${Math.max(1,Math.round(d*24))} h` :
  d<730 ? (Math.round(d)===1?'1 day':`${Math.round(d)} days`) : `${(d/365.25).toLocaleString('en-GB',{maximumFractionDigits:1})} years`;

export const dateStr = (day: number) => new Date(Date.UTC(2000,0,1,12)+day*864e5)
  .toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});

export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Animations run at a leisurely pace; tapping the map speeds them up (with the autopilot, all the way)
export const SLOW = 2.3, FAST = 6;

export const ANIM = {active:false, fast:false, long:false, instant:false};

export const $ = (id: string) => document.getElementById(id);

// Elements the code relies on, checked against the expected type. Missing or of the wrong
// kind means index.html and the code disagree, so that throws instead of failing later.
export function checked<T extends Element>(e: Element|null|undefined, type: new()=>T, what: string): T{
  if(e instanceof type) return e; throw new Error(`Expected ${type.name} for ${what}`);
}
export const byId = <T extends Element>(id: string, type: new()=>T) => checked($(id), type, '#'+id);
export const find = <T extends Element>(root: ParentNode, sel: string, type: new()=>T) => checked(root.querySelector(sel), type, sel);
export const findAll = <T extends Element>(root: ParentNode, sel: string, type: new()=>T) => [...root.querySelectorAll(sel)].map(e=>checked(e, type, sel));
export function ctx2d(c: HTMLCanvasElement){ const g=c.getContext('2d'); if(!g) throw new Error('No 2D canvas'); return g; }

// Dijkstra queue step: take the cheapest entry
export function popMin<T extends {c:number}>(q: T[]): T|undefined { q.sort((a,b)=>a.c-b.c); return q.shift(); }

const ESC: Record<string, string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'};
export const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ESC[c] ?? c);

export const tons = (t: number) => `${t.toLocaleString('en-GB',{maximumFractionDigits:1})} t`;

export const isDesk = () => matchMedia('(min-width:900px)').matches;
