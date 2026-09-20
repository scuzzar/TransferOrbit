// Die Karte zu dem, was gerade auf der Karte ausgewählt ist: Planet, Körper oder
// ein einzelner Ort. Steht im Hauptbild neben der Standortkarte aus ui/panels.js.

import { geaendert } from '../ereignisse.js';
import { $, esc, fmtDays, km } from '../basis.js';
import { B, FUEL_PRICE, GOODS, KONTORE, M, ROT, SITES, bodyName, bodyOf, fuelHere, hasAtm, hasDepot, latStr, moonsOf, planetOfBody, rotPenalty, siteOf } from '../spiel/welt.js';
import { transfer } from '../spiel/physik.js';
import { S, atTarget, homePlanet, pickTarget, targetName } from '../spiel/zustand.js';
import { idealTransfer } from '../spiel/graph.js';
import { cargoTo } from '../karte/leinwand.js';
import { setView } from '../karte/ansicht.js';
import { btn, openRoute } from './bausteine.js';

export function renderPick(){
  const w=$('pickcard'); w.innerHTML='';
  const p=S.ui.pick; if(!p) return;
  const locked=S.busy||S.over, c=document.createElement('div'); c.className='pick';
  const tag=(cls,t)=>`<span class="mtag ${cls}">${t}</span>`;
  let title='', tags=[], info='', stats=[], btns=[];
  const close=`<button type="button" class="x" aria-label="Auswahl schließen">×</button>`;
  if(p.type==='planet'){
    const k=p.planet, hp=homePlanet(), kon=KONTORE.filter(x=>planetOfBody(bodyOf(x))===k);
    const n=cargoTo(x=>planetOfBody(bodyOf(x))===k).length;
    title=B[k].name; if(n) tags.push(tag('deliver',`Lieferziel: ${n} ${n>1?'Aufträge':'Auftrag'}`));
    const ms=moonsOf(k);
    info=`${ms.length?'Mit '+ms.map(m=>M[m].name).join(', ')+'. ':''}${kon.length?kon.length+(kon.length>1?' Kontore':' Kontor')+(kon.some(x=>x.hub)?', davon ein Drehkreuz.':'.'):'Kein Kontor.'}`;
    if(hp && hp!==k){ const t=transfer(hp,k,S.day), id=idealTransfer(hp,k);
      stats.push(['Transfer bei Fenster',`${km(id.total)} km/s`]);
      stats.push(['Nächstes Fenster', t.d<0.04?'<span class="ok">offen</span>':`<span class="wait">in ${fmtDays(t.wait)}</span>`]); }
    else if(hp===k) stats.push(['Du bist','in diesem System']);
    const deeper = ms.length ? {level:'sys',planet:k} : SITES[k] ? {level:'body',planet:k,body:k} : null;
    if(deeper) btns.push(['Näher ansehen','',()=>setView(deeper)]);
    if(hp!==k) btns.push(['Route planen','go',()=>openRoute(pickTarget(p))]);
  } else if(p.type==='body'){
    const b=p.body, kon=KONTORE.filter(x=>bodyOf(x)===b), n=cargoTo(x=>bodyOf(x)===b).length, st=SITES[b]||[];
    title=bodyName(b); if(n) tags.push(tag('deliver',`Lieferziel: ${n} ${n>1?'Aufträge':'Auftrag'}`));
    if(kon.length) tags.push(tag('kontor',kon.length>1?`${kon.length} Kontore`:'Kontor'));
    if(hasDepot(b)) tags.push(tag('toward','Tankstelle'));
    info = st.length ? `${st.length} ${st.length>1?'Landeplätze':'Landeplatz'}: ${st.map(s=>s.name).join(', ')}.` : 'Keine feste Oberfläche.';
    if(st.length){ const down=M[b]?M[b].down:B[b].surf.down, up=M[b]?M[b].up:B[b].surf.up;
      stats.push(['Landung aus dem Orbit',`ab ${km(down)} km/s`]); stats.push(['Rückstart',B[b]&&B[b].surf.launcher?'Trägerrakete':`ab ${km(up)} km/s`]); }
    if(st.length) btns.push(['Landeplätze zeigen','',()=>setView({level:'body',planet:planetOfBody(b),body:b})]);
    const t=pickTarget(p); if(!atTarget(t)) btns.push([`Route: ${st.length?'Orbit':'hoher Orbit'}`,'go',()=>openRoute(t)]);
  } else {
    const t=pickTarget(p), [b,l]=p.node.split('.'), kon=KONTORE.find(x=>x.node===p.node && (!x.site||x.site===p.site));
    title=targetName(t).replace(/ \(.*\)$/,'');
    const n=kon?cargoTo(x=>x.id===kon.id).length:0;
    if(n) tags.push(tag('deliver',`Lieferziel: ${n} ${n>1?'Aufträge':'Auftrag'}`));
    if(kon) tags.push(tag('kontor',kon.hub?'Drehkreuz':'Kontor'));
    if(p.site){
      const st=siteOf(b,p.site), fp=FUEL_PRICE[p.node+'@'+p.site]??FUEL_PRICE[p.node];
      if(st.depot&&fp!==undefined) tags.push(tag('toward',`Tankstelle, ${fp} Cr/t`));
      info=`${latStr(st.lat)}, ${bodyName(b)}.${kon?(kon.makes.length?' Erzeugt '+kon.makes.map(g=>GOODS[g].name).join(', ')+'.':'')+' Braucht '+kon.needs.map(g=>GOODS[g].name).join(', ')+'.':''}${st.note?' '+st.note+'.':''}`;
      const pen=rotPenalty(b,st.lat), down=(M[b]?M[b].down:B[b].surf.down)+(hasAtm(b)?0:pen), up=(M[b]?M[b].up:B[b].surf.up)+pen;
      stats.push(['Landung aus dem Orbit',`${km(down)} km/s`]);
      stats.push([(ROT[b]||0)>=20?`Rückstart, ${Math.round((ROT[b]||0)-pen)} von ${ROT[b]} m/s Bonus`:'Rückstart', B[b]&&B[b].surf.launcher?`Trägerrakete${pen>1?', '+km(pen)+' km/s selbst':''}`:`${km(up)} km/s`]);
    } else {
      info = l==='capt' ? 'Tor zu anderen Planeten und zu den Monden.' : 'Tor zur Oberfläche.';
      if(fuelHere(p.node,null)) tags.push(tag('toward',`Tankstelle, ${FUEL_PRICE[p.node]} Cr/t`));
      if(kon) info+=` ${kon.name}: ${kon.makes.length?'erzeugt '+kon.makes.map(g=>GOODS[g].name).join(', ')+', ':''}braucht ${kon.needs.map(g=>GOODS[g].name).join(', ')}.`;
    }
    if(!atTarget(t)) btns.push([p.site?'Route hierher':'Route planen','go',()=>openRoute(t)]);
  }
  const hereNow = (p.type!=='planet') && atTarget(pickTarget(p));
  if(hereNow) tags.push(tag('here','Du bist hier'));
  c.innerHTML=`<div class="row"><b class="big">${esc(title)}</b>${close}</div>${tags.length?`<div class="mtags">${tags.join('')}</div>`:''}
    ${info?`<p class="kinfo">${esc(info)}</p>`:''}${stats.length?`<div class="pstats">${stats.map(([a,b])=>`<div><span class="muted">${a}</span><b>${b}</b></div>`).join('')}</div>`:''}`;
  c.querySelector('.x').onclick=()=>{ S.ui.pick=null; geaendert(); };
  if(btns.length){ const g=document.createElement('div'); g.className='two';
    btns.forEach(([t,cls,fn])=>g.appendChild(btn(t,cls,cls==='go'&&locked,fn))); if(btns.length===1) g.firstChild.classList.add('span2'); c.appendChild(g); }
  w.appendChild(c);
}
