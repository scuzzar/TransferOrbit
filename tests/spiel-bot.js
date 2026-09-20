const { chromium } = require('playwright');
const AI = String.raw`
(()=>{
  // Animationen sofort ausführen, damit der Bot schnell spielt
  animateTo=function(target,ms,done){ S.anim=null; S.day=target; econAdvance(S.day); done(); };
  window.LOG=[]; window.EV={trips:0,profit:0,fuel:0,rescues:0,rescueCost:0,fees:0,ships:[],late:0,warnings:[],stuck:0,orders:0,waitDays:0};
  const log=(t)=>LOG.push('T'+Math.round(S.day-START_DAY)+' '+t+' | '+Math.round(S.credits)+' Cr');
  const priceHere=()=>fuelPrice()??220;
  window.refuel=function(){ const r=refuelInfo(); if(!r||r.need<0.5||r.max<0.5) return; const c=Math.round(r.max*r.price); EV.fuel+=c; doRefuel(r.max,true); };
  // Route von beliebigem Start: Δv, Tage, Ankunft
  const planFrom=(start,target)=>planRoute(target,'eco',start);
  const reserveAt=(t,day)=>{ const nf=nearestFuel({node:t.node,site:t.site,day}); return nf.dv; };
  const shipAt=(fuel,cm)=>dvWith(fuel,cm);
  // beste Ladung ab Kontor k (Start 'start', Treibstoff 'fuel'): pro Ziel die wertvollsten Aufträge, die in Laderaum und Δv passen
  function bestLoad(k,start,fuel){
    const offers=S.eco.orders.filter(o=>o.state==='open'&&o.from===k.id);
    const byTo={}; offers.forEach(o=>(byTo[o.to]=byTo[o.to]||[]).push(o));
    let best=null;
    for(const [to,os] of Object.entries(byTo)){
      const tk=KBY[to], tgt=kTarget(tk), pl=planFrom(start,tgt); if(!pl) continue;
      os.sort((a,b)=>b.reward/(b.n*GOODS[b.good].m+2)-a.reward/(a.n*GOODS[a.good].m+2));
      let pick=[], slots=0, cm=0;
      for(const o of os){ if(slots+o.n>eng().slots) continue; const m=o.n*GOODS[o.good].m;
        if(shipAt(fuel,cm+m)<pl.dv+60) continue;
        const dl=start.day+legWait(route(KBY[o.from],KBY[o.to]),start.day)+1.5*o.days+30; if(pl.arrive>dl) continue;
        pick.push(o); slots+=o.n; cm+=m; }
      if(!pick.length) continue;
      // Reserve: nach Ablieferung muss es zur nächsten Tankstelle reichen
      const m0=eng().dry+cm+fuel, fAfter=Math.max(0,m0/Math.exp(pl.dv/(eng().isp*G0))-eng().dry-cm);
      const res=reserveAt(tgt,pl.arrive); if(shipAt(fAfter,0)<res+100) continue;
      const rew=pick.reduce((s,o)=>s+o.reward,0), burned=fuel-fAfter, cost=burned*priceHere();
      const val=rew-cost, score=val/(pl.days+3);
      if(!best||score>best.score) best={to:tk,pick,pl,val,score,rew,cost};
    }
    return best;
  }
  function travel(target){
    for(let i=0;i<40;i++){
      if(atTarget(target)) return true;
      const pl=planRoute(target,'eco'); if(!pl||!pl.steps.length){ log('Keine Route nach '+targetName(target)); return false; }
      const st=pl.steps[0];
      if(st.kind!=='wait' && st.dv>dvAvail()+0.5){ log('Zu wenig Δv für '+st.label+' ('+km(st.dv)+' > '+km(dvAvail())+')'); return false; }
      if(st.kind==='wait') EV.waitDays+=st.days;
      if(!execStep(st)){ log('Schritt scheitert: '+st.label+' – '+stepBlocker(st)); return false; }
      if(stranded()) return false;
      if(S.busy){ log('Noch busy nach Schritt?!'); }
      // unterwegs automatisch tanken, falls Tankstelle
      if(!atTarget(target)) { const r=refuelInfo(); if(r && r.need>5) refuel(); }
    }
    log('Route nach '+targetName(target)+' nach 40 Schritten nicht erreicht'); return false;
  }
  function tryBuy(){
    const k=kontorAt(); if(!k||!k.hub) return;
    const order=['holk','hulk','karacke'];
    for(const id of order.slice().reverse()){
      if(id===S.ship) return; const sh=SHIPS[id]; if(sh.price<=eng().price) continue;
      const net=sh.price-0.7*eng().price;
      const buffer= id==='karacke'?0:60000;
      if(S.credits>=net+buffer && slotsUsed()<=sh.slots){ buyShip(id); EV.ships.push({ship:id,day:Math.round(S.day-START_DAY),credits:Math.round(S.credits)}); log('KAUF '+sh.name+' für '+fmtCr(net)); refuel(); return; }
    }
  }
  window.turn=function(){
    if(S.over){ log('KONKURS'); return 'over'; }
    // Abliefern
    const del=deliverables(); if(del.length){ const sum=del.reduce((s,o)=>s+payout(o),0); del.forEach(o=>{ if(payout(o)<o.reward) EV.late++; }); deliverAll(); EV.profit+=sum; log('Abgeliefert '+del.length+' Aufträge, '+fmtCr(sum)); }
    if(stranded()){ const r=rescueInfo(); EV.rescues++; EV.rescueCost+=r.cost; log('RETTUNG '+(r.local?'Kredit':'Tanker')+' '+fmtCr(r.cost)+' @'+locKey()); rescue(); return 'rescue'; }
    refuel(); tryBuy();
    if(S.ship==='karacke') return 'done';
    const start={node:S.node,site:S.site,day:S.day};
    const k=kontorAt();
    let here=k?bestLoad(k,start,S.fuel):null;
    // Alternativen: zu einem anderen Kontor fliegen (leer), dort laden
    let alt=null;
    for(const kk of KONTORE){ if(k&&kk.id===k.id) continue;
      if(!S.eco.orders.some(o=>o.state==='open'&&o.from===kk.id)) continue;
      const t=kTarget(kk), pl=planFrom(start,t); if(!pl||pl.dv>dvAvail()-100) continue;
      const m0=eng().dry+cargoMass()+S.fuel, fAfter=Math.max(0,m0/Math.exp(pl.dv/(eng().isp*G0))-eng().dry-cargoMass());
      const fuelThere=fuelHere(t.node,t.site||null)?eng().cap:fAfter;
      if(!fuelHere(t.node,t.site||null) && shipAt(fAfter,0)<reserveAt(t,pl.arrive)+100) continue;
      const b=bestLoad(kk,{node:t.node,site:t.site||(t.node==='earth.surf'?'kourou':null),day:pl.arrive},fuelThere); if(!b) continue;
      const score=(b.val-(S.fuel-fAfter)*priceHere())/(pl.days+b.pl.days+3);
      if(!alt||score>alt.score) alt={kk,t,pl,b,score};
    }
    if(here && (!alt || here.score>=alt.score*0.9)){
      // annehmen
      here.pick.forEach(o=>S.ui.sel.add(o.id)); acceptSelected(); S.ui.view='main'; EV.orders+=here.pick.length;
      log('Lade '+here.pick.map(o=>o.n+'×'+GOODS[o.good].sh).join(', ')+' nach '+here.to.name+' ('+fmtCr(here.rew)+', '+km(here.pl.dv)+' km/s, '+fmtDays(here.pl.days)+')');
      EV.trips++; const ok=travel(kTarget(here.to)); if(!ok) EV.stuck++;
      return 'trip';
    }
    if(alt){ log('Leerflug nach '+alt.kk.name+' ('+km(alt.pl.dv)+' km/s, '+fmtDays(alt.pl.days)+')'); const ok=travel(alt.t); if(!ok) EV.stuck++; return 'move'; }
    // nichts möglich: zur nächsten Tankstelle oder warten
    if(!refuelInfo()){ const nf=nearestFuel({node:S.node,site:S.site,day:S.day}); if(nf.spot && nf.dv<=dvAvail()){ log('Zur Tankstelle '+targetName(nf.spot)); travel(nf.spot); return 'fuel'; } }
    log('Warte 30 Tage (nichts Lohnendes)'); EV.waitDays+=30; waitDays(30); return 'wait';
  };
})();`;
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:860}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+__dirname+'/../index.html'); await p.waitForTimeout(500);
  await p.evaluate(()=>{ try{localStorage.clear();}catch(e){} newGame(); render(); });
  await p.evaluate(AI);
  const hist=[]; let res;
  for(let i=0;i<4000;i++){
    res=await p.evaluate(()=>{ let r; try{ r=turn(); }catch(e){ r='ERR '+e.message+' '+e.stack.split('\n')[1]; } render(); return {r, day:Math.round(S.day-START_DAY), cr:Math.round(S.credits), ship:S.ship}; });
    if(i%10===0) hist.push(res);
    if(res.r==='done'||res.r==='over'||res.r.startsWith('ERR')||res.day>365*80) break;
    if(i===0||[100,300].includes(i)) await p.screenshot({path:`play3_${i}.png`});
  }
  await p.screenshot({path:'play3_end.png'});
  const out=await p.evaluate(()=>({EV, LOG, day:Math.round(S.day-START_DAY), cr:Math.round(S.credits), ship:S.ship, used:Math.round(S.used)}));
  require('fs').writeFileSync('play_log3.json',JSON.stringify({out,hist,errs,res},null,1));
  console.log('Ende:',res, 'Fehler:',errs.slice(0,5));
  console.log(JSON.stringify(out.EV));
  await b.close();
})();
