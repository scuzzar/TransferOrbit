// Small pieces of HTML: button, icon, chip, panel heading.

import { esc } from '../basics.js';
import { GOODS, postLabel, Post } from '../game/world.js';
import { S, Target } from '../game/state.js';
import { openView } from '../game/commands.js';

// The label of the back button, per view it returns to.
const BACK_LABEL: Record<string, string> = {main:'Map', post:'Order board', cargo:'Cargo hold', route:'Route'};

export const gchip = (g: string) => `<span class="gchip" style="background:${GOODS[g].color}"></span>`;

export function dots(n: number){ return `<span class="dots">${[0,1,2].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')}</span>`; }

export function btn(label: string, cls: string, disabled: boolean, fn: () => void){ const b = document.createElement('button'); b.textContent = label; if(cls) b.className = cls; b.disabled = disabled; b.onclick = fn; return b; }

export function phead(title: string, sub: string, tag: string){
  const d = document.createElement('div'); d.className = 'phead';
  d.innerHTML = `<button type="button" class="back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>${BACK_LABEL[S.ui.back||'main']}</button>
    <h2 class="ptitle">${esc(title)}${tag?` <span class="tag">${tag}</span>`:''}</h2>${sub?`<p class="kinfo">${sub}</p>`:''}`;
  (d.querySelector('.back') as HTMLButtonElement).onclick = () => openView(S.ui.back||'main');
  return d;
}

const IC: Record<string, string> = {
  orders:'<path d="M9 4h6v3H9z"/><path d="M9 5H6v15h12V5h-3"/><path d="M9 11h6M9 15h4"/>',
  fuel:'<path d="M4 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15"/><path d="M3 20h12M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  yard:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  deliver:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M8 12l3 3 5-6"/>',
  route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
};

const icon = (k: string, sz = 18) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

export function ibtn(ic: string, label: string, cls: string, disabled: boolean, fn: () => void){ const b = btn('', cls, disabled, fn); b.innerHTML = `${icon(ic)}<span>${label}</span>`; return b; }

export function openRoute(target: Target, back: string|null){ S.ui.route = {target, mode:'eco'}; openView('route', back); }

export const kTarget = (k: Post): Target => ({node: k.node, site: k.site||null});

export function routeLink(k: Post, back: string|null){ const b = document.createElement('button'); b.type = 'button'; b.className = 'olink';
  b.innerHTML = `${icon('route',15)}Route`; b.title = `Plan a route to ${postLabel(k)}`; b.onclick = (e) => { (e as MouseEvent).preventDefault(); (e as MouseEvent).stopPropagation(); openRoute(kTarget(k), back); }; return b; }
