// The map of one transfer in the route panel: what it costs over departure day and flight time,
// read from its transfer table. Tapping the map picks when to leave and how long to fly.

import { ctx2d, dateStr, esc, fmtDays, km } from '../basics.js';
import { PlanetId, transferTable } from '../game/world.js';
import { cheapestCell, synodic, tableCost } from '../game/physics.js';

export interface TransferMapSpec {
  a:PlanetId; b:PlanetId;
  from:number;                          // the earliest departure: the day the ship gets there
  dep:number; days:number;              // the choice as it stands
  budget:number;                        // the delta-v the ship has left for this transfer, m/s
  deadline:number|null; after:number;   // latest arrival at the target, and the days the steps after this one take
  pick:(dep:number, days:number)=>void;
}

// One hue, light to dark: the lighter, the cheaper, as a multiple of the ideal window
const RAMP = ['#cde2fb','#9ec5f4','#6da7ec','#3987e5','#256abf','#184f95','#104281'];
const STEPS = [1.1, 1.25, 1.5, 2, 3, 5];
const OVER = '#232a45';                 // more than the ship has
const W = 340, H = 210, L = 44, R = 6, T = 6, B = 24, CELL = 3;

export function transferMap(s:TransferMapSpec): HTMLElement{
  const wrap=document.createElement('div'); wrap.className='tmap';
  const t=transferTable(s.a,s.b), best=cheapestCell(s.a,s.b);
  if(!t || !best){ wrap.textContent='No table for this transfer.'; return wrap; }
  const [f0,f1]=t.flightRange, span=synodic(s.a,s.b), pw=W-L-R, ph=H-T-B;
  const xOf=(dep:number)=>L+(dep-s.from)/span*pw, yOf=(days:number)=>T+ph-(days-f0)/(f1-f0)*ph;
  const depAt=(x:number)=>s.from+Math.max(0,Math.min(1,(x-L)/pw))*span, daysAt=(y:number)=>f0+Math.max(0,Math.min(1,(T+ph-y)/ph))*(f1-f0);
  const band=(dv:number)=>{ const r=dv/best.dv; let i=0; while(i<STEPS.length && r>(STEPS[i]??Infinity)) i++; return i; };

  const cv=document.createElement('canvas'), dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width='100%'; cv.style.aspectRatio=`${W} / ${H}`; cv.style.touchAction='manipulation';
  cv.setAttribute('role','img'); cv.setAttribute('aria-label',`Delta-v of the transfer by departure day and flight time. Chosen: leave ${dateStr(s.dep)}, fly ${fmtDays(s.days)}.`);
  const g=ctx2d(cv); g.scale(dpr,dpr);
  // cells: the colour of their centre, grey with a hatch where it costs more than the ship has
  for(let x=L;x<L+pw;x+=CELL) for(let y=T;y<T+ph;y+=CELL){
    const dv=tableCost(s.a,s.b,depAt(x+CELL/2),daysAt(y+CELL/2));
    g.fillStyle = dv>s.budget ? OVER : (RAMP[band(dv)] ?? OVER); g.fillRect(x,y,CELL+0.5,CELL+0.5);
  }
  g.save(); g.beginPath(); g.rect(L,T,pw,ph); g.clip(); g.strokeStyle='rgba(154,162,194,0.18)'; g.lineWidth=1;
  for(let x=L-ph;x<L+pw;x+=8){ g.beginPath(); g.moveTo(x,T+ph); g.lineTo(x+ph,T); g.stroke(); }
  // the hatch only shows where the fill is grey: repaint the affordable cells over it
  for(let x=L;x<L+pw;x+=CELL) for(let y=T;y<T+ph;y+=CELL){
    const dv=tableCost(s.a,s.b,depAt(x+CELL/2),daysAt(y+CELL/2)); if(dv>s.budget) continue;
    g.fillStyle=RAMP[band(dv)] ?? OVER; g.fillRect(x,y,CELL+0.5,CELL+0.5);
  }
  // the deadline: everything to the upper right of the line arrives late
  if(s.deadline!==null){ const lim=s.deadline-s.after;
    g.strokeStyle='#f2b33d'; g.setLineDash([5,4]); g.lineWidth=1.5; g.beginPath();
    g.moveTo(xOf(s.from), yOf(lim-s.from)); g.lineTo(xOf(s.from+span), yOf(lim-s.from-span)); g.stroke(); g.setLineDash([]); }
  g.restore();
  // axes
  g.fillStyle='#9aa2c2'; g.font='11px system-ui, sans-serif'; const short=(d:number)=>new Date(Date.UTC(2000,0,1,12)+d*864e5).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}); g.textBaseline='middle'; g.textAlign='right';
  for(let k=0;k<=4;k++){ const d=f0+(f1-f0)*k/4, y=yOf(d); g.fillText(fmtDays(d).replace(' days',' d'),L-5,y); }
  g.textAlign='center'; g.textBaseline='top';
  for(let k=0;k<=2;k++){ const d=s.from+span*k/2, x=Math.min(W-R-26,Math.max(L+26,xOf(d))); g.fillText(short(d),x,T+ph+6); }
  // the choice
  const cx=xOf(s.dep), cy=yOf(s.days);
  g.beginPath(); g.arc(cx,cy,6,0,Math.PI*2); g.fillStyle='#ffffff'; g.fill(); g.lineWidth=2.5; g.strokeStyle='#10162b'; g.stroke();

  const readout=document.createElement('p'); readout.className='tmap-read';
  const say=(dep:number, days:number)=>{ const dv=tableCost(s.a,s.b,dep,days), late=s.deadline!==null && dep+days+s.after>s.deadline;
    readout.innerHTML=`Leave <b>${esc(dateStr(dep))}</b>, fly <b>${esc(fmtDays(days))}</b>: <b>${km(dv)} km/s</b>${dv>s.budget?' <span class="badc">more than you have</span>':''}${late?' <span class="badc">late</span>':''}`; };
  say(s.dep,s.days);
  const toMap=(e:PointerEvent)=>{ const r=cv.getBoundingClientRect(); return [(e.clientX-r.left)/r.width*W, (e.clientY-r.top)/r.height*H] as const; };
  cv.onpointermove=e=>{ const [x,y]=toMap(e); if(x>=L && y<=T+ph) say(depAt(x),daysAt(y)); };
  cv.onpointerleave=()=>say(s.dep,s.days);
  cv.onclick=e=>{ const [x,y]=toMap(e); if(x<L-4 || y>T+ph+4) return; s.pick(depAt(x),daysAt(y)); };

  const legend=document.createElement('div'); legend.className='tmap-legend';
  const edges=[best.dv, ...STEPS.map(f=>f*best.dv)];
  legend.innerHTML=RAMP.map((c,i)=>{ const lo=edges[i]??0, hi=edges[i+1];
    return `<span><i style="background:${c}"></i>${hi!==undefined?`${km(lo)}–${km(hi)}`:`over ${km(lo)}`}</span>`; }).join('')
    +`<span><i class="over"></i>more than you have</span>${s.deadline!==null?'<span><i class="dl"></i>deadline</span>':''}`;
  const hint=document.createElement('p'); hint.className='hint';
  hint.textContent='Tap to choose when to leave and how long to fly. Delta-v in km/s; the lighter, the cheaper.';
  wrap.append(hint, cv, readout, legend);
  return wrap;
}
