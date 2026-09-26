// Small pieces of HTML: button, icon, chip, panel heading - and opening the panels.

import { changed } from '../events.js';
import { esc, find, isDesk } from '../basics.js';
import { GOODS, GoodId, Node, RISK_AGE } from '../game/world.js';
import { Player, Starport, postLabel, yearlyRisk } from '../game/state.js';
import { UI, View } from './state.js';

// The label of the back button, per view it returns to.
const BACK_LABEL: Partial<Record<View, string>> = {main:'Map', post:'Order board', cargo:'Cargo hold', route:'Route', ship:'Ship and pilot'};

export const gchip = (g: GoodId) => `<span class="gchip" style="background:${GOODS[g].color}"></span>`;

export function dots(n: number){ return `<span class="dots">${[0,1,2].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')}</span>`; }

// Years with one decimal, and a chance in per cent
export const yrs = (y: number) => y.toLocaleString('en-GB',{minimumFractionDigits:1,maximumFractionDigits:1});
export const pct = (p: number) => `${(p*100).toLocaleString('en-GB',{maximumFractionDigits:p<0.1?1:0})}%`;

// How long the player has before the risk begins, or how great it is once it has
export function lifeLine(p: Player, day: number){
  const past=p.pastRisk(day);
  return past<0 ? {text:`${yrs(-past)} y to ${RISK_AGE+p.bought}`, risk:false} : {text:`${pct(yearlyRisk(past))} risk a year`, risk:true};
}

export function btn(label: string, cls: string, disabled: boolean, fn: () => void){ const b = document.createElement('button'); b.textContent = label; if(cls) b.className = cls; b.disabled = disabled; b.onclick = fn; return b; }

export function phead(title: string, sub: string, tag: string){
  const d = document.createElement('div'); d.className = 'phead';
  d.innerHTML = `<button type="button" class="back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>${BACK_LABEL[UI.back||'main']}</button>
    <h2 class="ptitle">${esc(title)}${tag?` <span class="tag">${tag}</span>`:''}</h2>${sub?`<p class="kinfo">${sub}</p>`:''}`;
  find(d,'.back',HTMLButtonElement).onclick = () => openView(UI.back||'main');
  return d;
}

const IC: Record<string, string> = {
  orders:'<path d="M9 4h6v3H9z"/><path d="M9 5H6v15h12V5h-3"/><path d="M9 11h6M9 15h4"/>',
  fuel:'<path d="M4 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15"/><path d="M3 20h12M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  yard:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  deliver:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M8 12l3 3 5-6"/>',
  clinic:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
};

const icon = (k: string, sz = 18) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

// Whether the ship can take on fuel at a place: a pump, or a greyed-out one where there is none
export const fuelTag = (n: Node) => { const d = n.depot;
  return d ? `<span class="tag fuel" title="Fuel depot, ${d.fuelPrice} Cr/t">${icon('fuel',12)}Fuel</span>` : `<span class="tag nofuel" title="No fuel depot">${icon('fuel',12)}No fuel</span>`; };

export function ibtn(ic: string, label: string, cls: string, disabled: boolean, fn: () => void){ const b = btn('', cls, disabled, fn); b.innerHTML = `${icon(ic)}<span>${label}</span>`; return b; }

export function openView(v: View, back?: View|null){ UI.rmsg=false; UI.back = v==='main' ? null : (back||null); UI.view=v; UI.sel=new Set<number>(); UI.tank=null; changed();
  if(isDesk()){ const cs=document.querySelector('.col-side'); if(cs) cs.scrollTop=0; } else window.scrollTo({top:0}); }

export function openRoute(target: Node, back: View|null){ UI.route = {target, preset:'economical', plan:null, open:null}; openView('route', back); }

export const kTarget = (k: Starport): Node => k.at;

export function routeLink(k: Starport, back: View|null){ const b = document.createElement('button'); b.type = 'button'; b.className = 'olink';
  b.innerHTML = `${icon('route',15)}Route`; b.title = `Plan a route to ${postLabel(k)}`; b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openRoute(kTarget(k), back); }; return b; }
