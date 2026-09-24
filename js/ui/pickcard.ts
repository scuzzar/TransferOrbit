// The card for whatever is selected on the map: a planet, a body or a single place.
// Sits in the main view next to the location card from ui/panels.js.

import { changed } from '../events.js';
import { dateStr, esc, fmtDays, km, byId, find } from '../basics.js';
import { BODIES, DAY_VALUE, GOODS, fmtCr, ROT, SITES, Site, bodyName, hasAtm, hasDepot, latStr, launcherAt, moonsOf, planetOfBody, rotPenalty, siteOf, splitNode } from '../game/world.js';
import { bodyDown, bodyUp, searchTransfer } from '../game/physics.js';
import { Hub, S, Starport, postLabel } from '../game/state.js';
import { idealTransfer } from '../game/graph.js';
import { cargoTo } from '../map/canvas.js';
import { setView } from '../map/view.js';
import { UI, ViewLevel, pickTarget } from './state.js';
import { btn, gchip, openRoute } from './widgets.js';

// The orders on the boards of these starports, to look at: they are taken on at the trading post
const SHOWN=5;
function ordersList(posts:Starport[], here:boolean){
  const os=posts.flatMap(k=>k.offers).sort((a,b)=>b.reward-a.reward);
  const rows=os.slice(0,SHOWN).map(o=>{ const G=GOODS[o.good], from=posts.length>1?`from ${S.market.post(o.from).name}, `:'';
    return `<div class="prow">${gchip(o.good)}<span class="ot"><b>${o.containers} × ${esc(G.name)}</b><small>${esc(from)}to ${esc(postLabel(S.market.post(o.to)))}, due ${dateStr(o.deadline)}</small></span><span class="num">${fmtCr(o.reward)}</span></div>`; });
  const more=os.length>SHOWN?`<p class="hint">and ${os.length-SHOWN} more</p>`:'';
  const note=!os.length?'<p class="hint">No orders right now.</p>':here?'':'<p class="hint">Fly there to take them on.</p>';
  return `<div class="porders"><h3>Orders here (${os.length})</h3>${rows.join('')}${more}${note}</div>`;
}

export function renderPick(){
  const w = byId('pickcard',HTMLElement); w.innerHTML='';
  const p = UI.pick; if(!p) return;
  const locked = !S.canAct, c = document.createElement('div'); c.className='pick';
  const tag = (cls:string, t:string) => `<span class="mtag ${cls}">${t}</span>`;
  let title='', tags:string[]=[], info='', stats:[string,string][]=[], btns:[string,string,()=>void][]=[], boards:Starport[]=[];
  const close = `<button type="button" class="x" aria-label="Close the selection">×</button>`;
  if(p.type==='planet'){
    const k = p.planet, hp = (S.player.ship.near?.planet??null), posts = S.market.list.filter(x=>planetOfBody(x.at.body)===k);
    const n = cargoTo(x=>planetOfBody(x.at.body)===k).length;
    title = BODIES[k].name; if(n) tags.push(tag('deliver',`Destination of ${n} ${n>1?'orders':'order'}`));
    const ms = moonsOf(k);
    info = `${ms.length?'With '+ms.map(m=>BODIES[m].name).join(', ')+'. ':''}${posts.length?posts.length+(posts.length>1?' trading posts':' trading post')+(posts.some(x=>x instanceof Hub)?', one of them a hub.':'.'):'No trading post.'}`;
    if(hp && hp!==k){ const t = searchTransfer(hp,k,S.day,DAY_VALUE.economical), id = idealTransfer(hp,k), wait = t ? t.dep-S.day : 0;
      stats.push(['Transfer at a window',`${km(id.total)} km/s`]);
      stats.push(['Next window', wait<1?'<span class="ok">open</span>':`<span class="wait">in ${fmtDays(wait)}</span>`]); }
    else if(hp===k) stats.push(['You are','in this system']);
    const deeper: ViewLevel|null = ms.length ? {level:'sys',planet:k} : SITES[k] ? {level:'body',planet:k,body:k} : null;
    if(deeper) btns.push(['Look closer','',()=>setView(deeper)]);
    if(hp!==k) btns.push(['Plan a route','go',()=>openRoute(pickTarget(p),null)]);
  } else if(p.type==='body'){
    const b = p.body, posts = S.market.list.filter(x=>x.at.body===b), n = cargoTo(x=>x.at.body===b).length, st = SITES[b]||[];
    boards = posts;
    title = bodyName(b); if(n) tags.push(tag('deliver',`Destination of ${n} ${n>1?'orders':'order'}`));
    if(posts.length) tags.push(tag('post',posts.length>1?`${posts.length} trading posts`:'Trading post'));
    if(hasDepot(b)) tags.push(tag('toward','Fuel depot'));
    info = st.length ? `${st.length} landing ${st.length>1?'sites':'site'}: ${st.map((s:Site)=>s.name).join(', ')}.` : 'No solid surface.';
    if(st.length){ stats.push(['Landing from orbit',`from ${km(bodyDown(b))} km/s`]); stats.push(['Getting back up',launcherAt(b)?'Launcher':`from ${km(bodyUp(b))} km/s`]); }
    if(st.length) btns.push(['Show the landing sites','',()=>setView({level:'body',planet:planetOfBody(b),body:b})]);
    const t = pickTarget(p); if(!S.player.ship.isAt(t)) btns.push([`Route: ${st.length?'orbit':'high orbit'}`,'go',()=>openRoute(t,null)]);
  } else {
    const t = pickTarget(p), nd = p.node, [b,l] = splitNode(nd), post = S.market.at(t);
    title = t.label.replace(/ \(.*\)$/,'');
    if(post) boards = [post];
    const n = post?cargoTo(x=>x.id===post.id).length:0;
    if(n) tags.push(tag('deliver',`Destination of ${n} ${n>1?'orders':'order'}`));
    if(post) tags.push(tag('post',post instanceof Hub?'Hub':'Trading post'));
    const st = p.site ? siteOf(b,p.site) : null;
    if(st){
      const dp = t.depot;
      if(dp) tags.push(tag('toward',`Fuel depot, ${dp.fuelPrice} Cr/t`));
      info = `${latStr(st.lat)}, ${bodyName(b)}.${post?(post.industry.makes.length?' Produces '+post.industry.makes.map(g=>GOODS[g].name).join(', ')+'.':'')+' Needs '+post.industry.needs.map(g=>GOODS[g].name).join(', ')+'.':''}${st.note?' '+st.note+'.':''}`;
      const pen = rotPenalty(b,st.lat), rot = ROT[b]||0, down = bodyDown(b)+(hasAtm(b)?0:pen), up = bodyUp(b)+pen;
      stats.push(['Landing from orbit',`${km(down)} km/s`]);
      stats.push([rot>=20?`Getting back up, ${Math.round(rot-pen)} of ${rot} m/s bonus`:'Getting back up', launcherAt(b)?`Launcher${pen>1?', '+km(pen)+' km/s yourself':''}`:`${km(up)} km/s`]);
    } else {
      info = l==='capt' ? 'Gateway to the other planets and to the moons.' : 'Gateway to the surface.';
      const dp = t.depot; if(dp) tags.push(tag('toward',`Fuel depot, ${dp.fuelPrice} Cr/t`));
      if(post) info+=` ${post.name}: ${post.industry.makes.length?'produces '+post.industry.makes.map(g=>GOODS[g].name).join(', ')+', ':''}needs ${post.industry.needs.map(g=>GOODS[g].name).join(', ')}.`;
    }
    if(!S.player.ship.isAt(t)) btns.push([p.site?'Route to here':'Plan a route','go',()=>openRoute(t,null)]);
  }
  const hereNow = (p.type!=='planet') && S.player.ship.isAt(pickTarget(p));
  if(hereNow) tags.push(tag('here','You are here'));
  c.innerHTML=`<div class="row"><b class="big">${esc(title)}</b>${close}</div>${tags.length?`<div class="mtags">${tags.join('')}</div>`:''}
    ${info?`<p class="kinfo">${esc(info)}</p>`:''}${stats.length?`<div class="pstats">${stats.map(([a,b])=>`<div><span class="muted">${a}</span><b>${b}</b></div>`).join('')}</div>`:''}${boards.length?ordersList(boards,hereNow):''}`;
  find(c,'.x',HTMLButtonElement).onclick = ()=>{ UI.pick=null; changed(); };
  if(btns.length){ const g = document.createElement('div'); g.className='two';
    btns.forEach(([t,cls,fn])=>g.appendChild(btn(t,cls,cls==='go'&&locked,fn))); if(btns.length===1) g.firstElementChild?.classList.add('span2'); c.appendChild(g); }
  w.appendChild(c);
}
