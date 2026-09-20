const { chromium } = require('playwright');
const AI = String.raw`
(()=>{
  // Animationen sofort ausführen, damit der Bot schnell spielt
  TO.ANIM.sofort=true;
  window.LOG=[]; window.EV={trips:0,profit:0,fuel:0,rescues:0,rescueCost:0,fees:0,ships:[],late:0,warnings:[],stuck:0,orders:0,waitDays:0};
  const log=(t)=>LOG.push('T'+Math.round(TO.S.day-TO.START_DAY)+' '+t+' | '+Math.round(TO.S.credits)+' Cr');
  const priceHere=()=>TO.fuelPrice()??220;
  window.refuel=function(){ const r=TO.refuelInfo(); if(!r||r.need<0.5||r.max<0.5) return; const c=Math.round(r.max*r.price); EV.fuel+=c; TO.doRefuel(r.max,true); };
  // Route von beliebigem Start: Δv, Tage, Ankunft
  const planFrom=(start,target)=>TO.planRoute(target,'eco',start);
  const reserveAt=(t,day)=>{ const nf=TO.nearestFuel({node:t.node,site:t.site,day}); return nf.dv; };
  const shipAt=(fuel,cm)=>TO.dvWith(fuel,cm);
  // beste Ladung ab Kontor k (Start 'start', Treibstoff 'fuel'): pro Ziel die wertvollsten Aufträge, die in Laderaum und Δv passen
  function bestLoad(k,start,fuel){
    const offers=TO.S.eco.orders.filter(o=>o.state==='open'&&o.from===k.id);
    const byTo={}; offers.forEach(o=>(byTo[o.to]=byTo[o.to]||[]).push(o));
    let best=null;
    for(const [to,os] of Object.entries(byTo)){
      const tk=TO.KBY[to], tgt=TO.kTarget(tk), pl=planFrom(start,tgt); if(!pl) continue;
      os.sort((a,b)=>b.reward/(b.n*TO.GOODS[b.good].m+2)-a.reward/(a.n*TO.GOODS[a.good].m+2));
      let pick=[], slots=0, cm=0;
      for(const o of os){ if(slots+o.n>TO.eng().slots) continue; const m=o.n*TO.GOODS[o.good].m;
        if(shipAt(fuel,cm+m)<pl.dv+60) continue;
        const dl=start.day+TO.legWait(TO.route(TO.KBY[o.from],TO.KBY[o.to]),start.day)+1.5*o.days+30; if(pl.arrive>dl) continue;
        pick.push(o); slots+=o.n; cm+=m; }
      if(!pick.length) continue;
      // Reserve: nach Ablieferung muss es zur nächsten Tankstelle reichen
      const m0=TO.eng().dry+cm+fuel, fAfter=Math.max(0,m0/Math.exp(pl.dv/(TO.eng().isp*TO.G0))-TO.eng().dry-cm);
      const res=reserveAt(tgt,pl.arrive); if(shipAt(fAfter,0)<res+100) continue;
      const rew=pick.reduce((s,o)=>s+o.reward,0), burned=fuel-fAfter, cost=burned*priceHere();
      const val=rew-cost, score=val/(pl.days+3);
      if(!best||score>best.score) best={to:tk,pick,pl,val,score,rew,cost};
    }
    return best;
  }
  function travel(target){
    for(let i=0;i<40;i++){
      if(TO.atTarget(target)) return true;
      const pl=TO.planRoute(target,'eco'); if(!pl||!pl.steps.length){ log('Keine Route nach '+TO.targetName(target)); return false; }
      const st=pl.steps[0];
      if(st.kind!=='wait' && st.dv>TO.dvAvail()+0.5){ log('Zu wenig Δv für '+st.label+' ('+TO.km(st.dv)+' > '+TO.km(TO.dvAvail())+')'); return false; }
      if(st.kind==='wait') EV.waitDays+=st.days;
      if(!TO.execStep(st)){ log('Schritt scheitert: '+st.label+' – '+TO.stepBlocker(st)); return false; }
      if(TO.stranded()) return false;
      if(TO.S.busy){ log('Noch busy nach Schritt?!'); }
      // unterwegs automatisch tanken, falls Tankstelle
      if(!TO.atTarget(target)) { const r=TO.refuelInfo(); if(r && r.need>5) refuel(); }
    }
    log('Route nach '+TO.targetName(target)+' nach 40 Schritten nicht erreicht'); return false;
  }
  function tryBuy(){
    const k=TO.kontorAt(); if(!k||!k.hub) return;
    const order=['holk','hulk','karacke'];
    for(const id of order.slice().reverse()){
      if(id===TO.S.ship) return; const sh=TO.SHIPS[id]; if(sh.price<=TO.eng().price) continue;
      const net=sh.price-0.7*TO.eng().price;
      const buffer= id==='karacke'?0:60000;
      if(TO.S.credits>=net+buffer && TO.slotsUsed()<=sh.slots){ TO.buyShip(id); EV.ships.push({ship:id,day:Math.round(TO.S.day-TO.START_DAY),credits:Math.round(TO.S.credits)}); log('KAUF '+sh.name+' für '+TO.fmtCr(net)); refuel(); return; }
    }
  }
  window.turn=function(){
    if(TO.S.over){ log('KONKURS'); return 'over'; }
    // Abliefern
    const del=TO.deliverables(); if(del.length){ const sum=del.reduce((s,o)=>s+TO.payout(o),0); del.forEach(o=>{ if(TO.payout(o)<o.reward) EV.late++; }); TO.deliverAll(); EV.profit+=sum; log('Abgeliefert '+del.length+' Aufträge, '+TO.fmtCr(sum)); }
    if(TO.stranded()){ const r=TO.rescueInfo(); EV.rescues++; EV.rescueCost+=r.cost; log('RETTUNG '+(r.local?'Kredit':'Tanker')+' '+TO.fmtCr(r.cost)+' @'+TO.locKey()); TO.rescue(); return 'rescue'; }
    refuel(); tryBuy();
    if(TO.S.ship==='karacke') return 'done';
    const start={node:TO.S.node,site:TO.S.site,day:TO.S.day};
    const k=TO.kontorAt();
    let here=k?bestLoad(k,start,TO.S.fuel):null;
    // Alternativen: zu einem anderen Kontor fliegen (leer), dort laden
    let alt=null;
    for(const kk of TO.KONTORE){ if(k&&kk.id===k.id) continue;
      if(!TO.S.eco.orders.some(o=>o.state==='open'&&o.from===kk.id)) continue;
      const t=TO.kTarget(kk), pl=planFrom(start,t); if(!pl||pl.dv>TO.dvAvail()-100) continue;
      const m0=TO.eng().dry+TO.cargoMass()+TO.S.fuel, fAfter=Math.max(0,m0/Math.exp(pl.dv/(TO.eng().isp*TO.G0))-TO.eng().dry-TO.cargoMass());
      const fuelThere=TO.fuelHere(t.node,t.site||null)?TO.eng().cap:fAfter;
      if(!TO.fuelHere(t.node,t.site||null) && shipAt(fAfter,0)<reserveAt(t,pl.arrive)+100) continue;
      const b=bestLoad(kk,{node:t.node,site:t.site||(t.node==='earth.surf'?'kourou':null),day:pl.arrive},fuelThere); if(!b) continue;
      const score=(b.val-(TO.S.fuel-fAfter)*priceHere())/(pl.days+b.pl.days+3);
      if(!alt||score>alt.score) alt={kk,t,pl,b,score};
    }
    if(here && (!alt || here.score>=alt.score*0.9)){
      // annehmen
      here.pick.forEach(o=>TO.S.ui.sel.add(o.id)); TO.acceptSelected(); TO.S.ui.view='main'; EV.orders+=here.pick.length;
      log('Lade '+here.pick.map(o=>o.n+'×'+TO.GOODS[o.good].sh).join(', ')+' nach '+here.to.name+' ('+TO.fmtCr(here.rew)+', '+TO.km(here.pl.dv)+' km/s, '+TO.fmtDays(here.pl.days)+')');
      EV.trips++; const ok=travel(TO.kTarget(here.to)); if(!ok) EV.stuck++;
      return 'trip';
    }
    if(alt){ log('Leerflug nach '+alt.kk.name+' ('+TO.km(alt.pl.dv)+' km/s, '+TO.fmtDays(alt.pl.days)+')'); const ok=travel(alt.t); if(!ok) EV.stuck++; return 'move'; }
    // nichts möglich: zur nächsten Tankstelle oder warten
    if(!TO.refuelInfo()){ const nf=TO.nearestFuel({node:TO.S.node,site:TO.S.site,day:TO.S.day}); if(nf.spot && nf.dv<=TO.dvAvail()){ log('Zur Tankstelle '+TO.targetName(nf.spot)); travel(nf.spot); return 'fuel'; } }
    log('Warte 30 Tage (nichts Lohnendes)'); EV.waitDays+=30; TO.waitDays(30); return 'wait';
  };
})();`;
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:860}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
  await p.evaluate(()=>{ try{localStorage.clear();}catch(e){} TO.newGame(); TO.geaendert(); });
  await p.evaluate(AI);
  const hist=[]; let res;
  for(let i=0;i<4000;i++){
    res=await p.evaluate(()=>{ let r; try{ r=turn(); }catch(e){ r='ERR '+e.message+' '+e.stack.split('\n')[1]; } TO.geaendert(); return {r, day:Math.round(TO.S.day-TO.START_DAY), cr:Math.round(TO.S.credits), ship:TO.S.ship}; });
    if(i%10===0) hist.push(res);
    if(res.r==='done'||res.r==='over'||res.r.startsWith('ERR')||res.day>365*80) break;
    if(i===0||[100,300].includes(i)) await p.screenshot({path:`play3_${i}.png`});
  }
  await p.screenshot({path:'play3_end.png'});
  const out=await p.evaluate(()=>({EV, LOG, day:Math.round(TO.S.day-TO.START_DAY), cr:Math.round(TO.S.credits), ship:TO.S.ship, used:Math.round(TO.S.used)}));
  require('fs').writeFileSync('play_log3.json',JSON.stringify({out,hist,errs,res},null,1));
  console.log('Ende:',res, 'Fehler:',errs.slice(0,5));
  console.log(JSON.stringify(out.EV));
  await b.close();
})();
