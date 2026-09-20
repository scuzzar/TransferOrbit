// The card for whatever is selected on the map: a planet, a body or a single place.
// Sits in the main view next to the location card from ui/panels.js.

import { changed } from '../events.js';
import { $, esc, fmtDays, km } from '../basics.js';
import { B, FUEL_PRICE, GOODS, POSTS, M, ROT, SITES, bodyName, bodyOf, fuelHere, hasAtm, hasDepot, latStr, moonsOf, planetOfBody, rotPenalty, siteOf } from '../game/world.js';
import { transfer } from '../game/physics.js';
import { S, atTarget, homePlanet, pickTarget, targetName } from '../game/state.js';
import { idealTransfer } from '../game/graph.js';
import { cargoTo } from '../map/canvas.js';
import { setView } from '../map/view.js';
import { btn, openRoute } from './widgets.js';

export function renderPick(){
  const w=$('pickcard'); w.innerHTML='';
  const p=S.ui.pick; if(!p) return;
  const locked=S.busy||S.over, c=document.createElement('div'); c.className='pick';
  const tag=(cls,t)=>`<span class="mtag ${cls}">${t}</span>`;
  let title='', tags=[], info='', stats=[], btns=[];
  const close=`<button type="button" class="x" aria-label="Close the selection">×</button>`;
  if(p.type==='planet'){
    const k=p.planet, hp=homePlanet(), posts=POSTS.filter(x=>planetOfBody(bodyOf(x))===k);
    const n=cargoTo(x=>planetOfBody(bodyOf(x))===k).length;
    title=B[k].name; if(n) tags.push(tag('deliver',`Destination of ${n} ${n>1?'orders':'order'}`));
    const ms=moonsOf(k);
    info=`${ms.length?'With '+ms.map(m=>M[m].name).join(', ')+'. ':''}${posts.length?posts.length+(posts.length>1?' trading posts':' trading post')+(posts.some(x=>x.hub)?', one of them a hub.':'.'):'No trading post.'}`;
    if(hp && hp!==k){ const t=transfer(hp,k,S.day), id=idealTransfer(hp,k);
      stats.push(['Transfer at a window',`${km(id.total)} km/s`]);
      stats.push(['Next window', t.d<0.04?'<span class="ok">open</span>':`<span class="wait">in ${fmtDays(t.wait)}</span>`]); }
    else if(hp===k) stats.push(['You are','in this system']);
    const deeper = ms.length ? {level:'sys',planet:k} : SITES[k] ? {level:'body',planet:k,body:k} : null;
    if(deeper) btns.push(['Look closer','',()=>setView(deeper)]);
    if(hp!==k) btns.push(['Plan a route','go',()=>openRoute(pickTarget(p))]);
  } else if(p.type==='body'){
    const b=p.body, posts=POSTS.filter(x=>bodyOf(x)===b), n=cargoTo(x=>bodyOf(x)===b).length, st=SITES[b]||[];
    title=bodyName(b); if(n) tags.push(tag('deliver',`Destination of ${n} ${n>1?'orders':'order'}`));
    if(posts.length) tags.push(tag('post',posts.length>1?`${posts.length} trading posts`:'Trading post'));
    if(hasDepot(b)) tags.push(tag('toward','Fuel depot'));
    info = st.length ? `${st.length} landing ${st.length>1?'sites':'site'}: ${st.map(s=>s.name).join(', ')}.` : 'No solid surface.';
    if(st.length){ const down=M[b]?M[b].down:B[b].surf.down, up=M[b]?M[b].up:B[b].surf.up;
      stats.push(['Landing from orbit',`from ${km(down)} km/s`]); stats.push(['Getting back up',B[b]&&B[b].surf.launcher?'Launcher':`from ${km(up)} km/s`]); }
    if(st.length) btns.push(['Show the landing sites','',()=>setView({level:'body',planet:planetOfBody(b),body:b})]);
    const t=pickTarget(p); if(!atTarget(t)) btns.push([`Route: ${st.length?'orbit':'high orbit'}`,'go',()=>openRoute(t)]);
  } else {
    const t=pickTarget(p), [b,l]=p.node.split('.'), post=POSTS.find(x=>x.node===p.node && (!x.site||x.site===p.site));
    title=targetName(t).replace(/ \(.*\)$/,'');
    const n=post?cargoTo(x=>x.id===post.id).length:0;
    if(n) tags.push(tag('deliver',`Destination of ${n} ${n>1?'orders':'order'}`));
    if(post) tags.push(tag('post',post.hub?'Hub':'Trading post'));
    if(p.site){
      const st=siteOf(b,p.site), fp=FUEL_PRICE[p.node+'@'+p.site]??FUEL_PRICE[p.node];
      if(st.depot&&fp!==undefined) tags.push(tag('toward',`Fuel depot, ${fp} Cr/t`));
      info=`${latStr(st.lat)}, ${bodyName(b)}.${post?(post.makes.length?' Produces '+post.makes.map(g=>GOODS[g].name).join(', ')+'.':'')+' Needs '+post.needs.map(g=>GOODS[g].name).join(', ')+'.':''}${st.note?' '+st.note+'.':''}`;
      const pen=rotPenalty(b,st.lat), down=(M[b]?M[b].down:B[b].surf.down)+(hasAtm(b)?0:pen), up=(M[b]?M[b].up:B[b].surf.up)+pen;
      stats.push(['Landing from orbit',`${km(down)} km/s`]);
      stats.push([(ROT[b]||0)>=20?`Getting back up, ${Math.round((ROT[b]||0)-pen)} of ${ROT[b]} m/s bonus`:'Getting back up', B[b]&&B[b].surf.launcher?`Launcher${pen>1?', '+km(pen)+' km/s yourself':''}`:`${km(up)} km/s`]);
    } else {
      info = l==='capt' ? 'Gateway to the other planets and to the moons.' : 'Gateway to the surface.';
      if(fuelHere(p.node,null)) tags.push(tag('toward',`Fuel depot, ${FUEL_PRICE[p.node]} Cr/t`));
      if(post) info+=` ${post.name}: ${post.makes.length?'produces '+post.makes.map(g=>GOODS[g].name).join(', ')+', ':''}needs ${post.needs.map(g=>GOODS[g].name).join(', ')}.`;
    }
    if(!atTarget(t)) btns.push([p.site?'Route to here':'Plan a route','go',()=>openRoute(t)]);
  }
  const hereNow = (p.type!=='planet') && atTarget(pickTarget(p));
  if(hereNow) tags.push(tag('here','You are here'));
  c.innerHTML=`<div class="row"><b class="big">${esc(title)}</b>${close}</div>${tags.length?`<div class="mtags">${tags.join('')}</div>`:''}
    ${info?`<p class="kinfo">${esc(info)}</p>`:''}${stats.length?`<div class="pstats">${stats.map(([a,b])=>`<div><span class="muted">${a}</span><b>${b}</b></div>`).join('')}</div>`:''}`;
  c.querySelector('.x').onclick=()=>{ S.ui.pick=null; changed(); };
  if(btns.length){ const g=document.createElement('div'); g.className='two';
    btns.forEach(([t,cls,fn])=>g.appendChild(btn(t,cls,cls==='go'&&locked,fn))); if(btns.length===1) g.firstChild.classList.add('span2'); c.appendChild(g); }
  w.appendChild(c);
}
