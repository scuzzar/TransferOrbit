const { chromium } = require('playwright');
const AI = String.raw`
(()=>{
  // run animations instantly so the bot plays fast
  TO.ANIM.instant=true;
  window.LOG=[]; window.EV={trips:0,profit:0,fuel:0,rescues:0,rescueCost:0,fees:0,ships:[],late:0,warnings:[],stuck:0,orders:0,waitDays:0};
  const log=(t)=>LOG.push('T'+Math.round(TO.S.day-TO.START_DAY)+' '+t+' | '+Math.round(TO.S.player.credits)+' Cr');
  const priceHere=()=>TO.S.player.ship.place?.fuelPrice??220;
  window.refuel=function(){ const r=TO.refuelInfo(); if(!r||r.need<0.5||r.max<0.5) return; const c=Math.round(r.max*r.price); EV.fuel+=c; TO.doRefuel(r.max); };
  // route from an arbitrary start: delta-v, days, arrival
  const planFrom=(start,target)=>TO.planRoute(target,'eco',start);
  const reserveAt=(t,day)=>{ const nf=TO.nearestFuel({node:t.node,site:t.site,day}); return nf.dv; };
  const shipAt=(fuel,cm)=>TO.S.player.ship.dvWith(fuel,cm);
  // best load from post k (start 'start', fuel 'fuel'): per destination the most valuable orders that fit the hold and the delta-v
  function bestLoad(k,start,fuel){
    const offers=TO.S.market.post(k.id).offers;
    const byTo={}; offers.forEach(o=>(byTo[o.to]=byTo[o.to]||[]).push(o));
    let best=null;
    for(const [to,os] of Object.entries(byTo)){
      const tk=TO.POST_BY_ID[to], tgt=TO.kTarget(tk), pl=planFrom(start,tgt); if(!pl) continue;
      os.sort((a,b)=>b.reward/(b.containers*TO.GOODS[b.good].m+2)-a.reward/(a.containers*TO.GOODS[a.good].m+2));
      let pick=[], slots=0, cm=0;
      for(const o of os){ if(slots+o.containers>TO.S.player.ship.def.slots) continue; const m=o.containers*TO.GOODS[o.good].m;
        if(shipAt(fuel,cm+m)<pl.dv+60) continue;
        const dl=start.day+TO.legWait(TO.route(TO.POST_BY_ID[o.from],TO.POST_BY_ID[o.to]),start.day)+1.5*o.days+30; if(pl.arrive>dl) continue;
        pick.push(o); slots+=o.containers; cm+=m; }
      if(!pick.length) continue;
  // reserve: after delivering there must be enough left to reach the nearest depot
      const m0=TO.S.player.ship.def.dry+cm+fuel, fAfter=Math.max(0,m0/Math.exp(pl.dv/(TO.S.player.ship.def.isp*TO.G0))-TO.S.player.ship.def.dry-cm);
      const res=reserveAt(tgt,pl.arrive); if(shipAt(fAfter,0)<res+100) continue;
      const rew=pick.reduce((s,o)=>s+o.reward,0), burned=fuel-fAfter, cost=burned*priceHere();
      const val=rew-cost, score=val/(pl.days+3);
      if(!best||score>best.score) best={to:tk,pick,pl,val,score,rew,cost};
    }
    return best;
  }
  function travel(target){
    for(let i=0;i<40;i++){
      if(TO.S.player.ship.isAt(target)) return true;
      const pl=TO.planRoute(target,'eco'); if(!pl||!pl.steps.length){ log('no route to '+TO.targetName(target)); return false; }
      const st=pl.steps[0];
      if(st.kind!=='wait' && st.dv>TO.S.player.ship.dvAvail+0.5){ log('not enough delta-v for '+st.label+' ('+TO.km(st.dv)+' > '+TO.km(TO.S.player.ship.dvAvail)+')'); return false; }
      if(st.kind==='wait') EV.waitDays+=st.days;
      if(!TO.execStep(st)){ log('step failed: '+st.label+' - '+TO.stepBlocker(st)); return false; }
      if(TO.stranded()) return false;
      if(TO.S.player.ship.busy){ log('still busy after a step?!'); }
      // refuel automatically on the way, if there is a depot
      if(!TO.S.player.ship.isAt(target)) { const r=TO.refuelInfo(); if(r && r.need>5) refuel(); }
    }
    log('route to '+TO.targetName(target)+' not reached after 40 steps'); return false;
  }
  function tryBuy(){
    const k=TO.S.player.ship.place?.post; if(!k||!k.hub) return;
    const order=['hulk','galleon','carrack'];
    for(const id of order.slice().reverse()){
      if(id===TO.S.player.ship.type) return; const sh=TO.SHIPS[id]; if(sh.price<=TO.S.player.ship.def.price) continue;
      const net=sh.price-0.7*TO.S.player.ship.def.price;
      const buffer= id==='carrack'?0:60000;
      if(TO.S.player.credits>=net+buffer && TO.S.player.ship.slotsUsed<=sh.slots){ TO.buyShip(id); EV.ships.push({ship:id,day:Math.round(TO.S.day-TO.START_DAY),credits:Math.round(TO.S.player.credits)}); log('BOUGHT '+sh.name+' for '+TO.fmtCr(net)); refuel(); return; }
    }
  }
  window.turn=function(){
    if(TO.S.player.bankrupt){ log('BANKRUPT'); return 'over'; }
    // deliver
    const del=TO.deliverables(); if(del.length){ const sum=del.reduce((s,o)=>s+o.payout(TO.S.day),0); del.forEach(o=>{ if(o.payout(TO.S.day)<o.reward) EV.late++; }); TO.deliverAll(); EV.profit+=sum; log('delivered '+del.length+' orders, '+TO.fmtCr(sum)); }
    if(TO.stranded()){ const r=TO.rescueInfo(); EV.rescues++; EV.rescueCost+=r.cost; log('RESCUE '+(r.local?'credit':'tanker')+' '+TO.fmtCr(r.cost)+' @'+TO.S.player.ship.place?.key); TO.rescue(); return 'rescue'; }
    refuel(); tryBuy();
    if(TO.S.player.ship.type==='carrack') return 'done';
    const start={node:TO.S.player.ship.place.node,site:TO.S.player.ship.place.site,day:TO.S.day};
    const k=TO.S.player.ship.place?.post;
    let here=k?bestLoad(k,start,TO.S.player.ship.fuel):null;
    // alternative: fly empty to another post and load there
    let alt=null;
    for(const kk of TO.POSTS){ if(k&&kk.id===k.id) continue;
      if(!TO.S.market.post(kk.id).offers.length) continue;
      const t=TO.kTarget(kk), pl=planFrom(start,t); if(!pl||pl.dv>TO.S.player.ship.dvAvail-100) continue;
      const m0=TO.S.player.ship.def.dry+TO.S.player.ship.cargoMass+TO.S.player.ship.fuel, fAfter=Math.max(0,m0/Math.exp(pl.dv/(TO.S.player.ship.def.isp*TO.G0))-TO.S.player.ship.def.dry-TO.S.player.ship.cargoMass);
      const fuelThere=TO.fuelHere(t.node,t.site||null)?TO.S.player.ship.def.cap:fAfter;
      if(!TO.fuelHere(t.node,t.site||null) && shipAt(fAfter,0)<reserveAt(t,pl.arrive)+100) continue;
      const b=bestLoad(kk,{node:t.node,site:t.site||(t.node==='earth.surf'?'kourou':null),day:pl.arrive},fuelThere); if(!b) continue;
      const score=(b.val-(TO.S.player.ship.fuel-fAfter)*priceHere())/(pl.days+b.pl.days+3);
      if(!alt||score>alt.score) alt={kk,t,pl,b,score};
    }
    if(here && (!alt || here.score>=alt.score*0.9)){
  // accept
      TO.acceptOrders(here.pick.map(o=>o.id)); EV.orders+=here.pick.length;
      log('loading '+here.pick.map(o=>o.containers+'×'+TO.GOODS[o.good].sh).join(', ')+' for '+here.to.name+' ('+TO.fmtCr(here.rew)+', '+TO.km(here.pl.dv)+' km/s, '+TO.fmtDays(here.pl.days)+')');
      EV.trips++; const ok=travel(TO.kTarget(here.to)); if(!ok) EV.stuck++;
      return 'trip';
    }
    if(alt){ log('empty run to '+alt.kk.name+' ('+TO.km(alt.pl.dv)+' km/s, '+TO.fmtDays(alt.pl.days)+')'); const ok=travel(alt.t); if(!ok) EV.stuck++; return 'move'; }
  // nothing possible: head for the nearest depot, or wait
    if(!TO.refuelInfo()){ const nf=TO.nearestFuel(start); if(nf.spot && nf.dv<=TO.S.player.ship.dvAvail){ log('heading for the depot '+TO.targetName(nf.spot)); travel(nf.spot); return 'fuel'; } }
    log('waiting 30 days (nothing worthwhile)'); EV.waitDays+=30; TO.waitDays(30); return 'wait';
  };
})();`;
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:860}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8765/dist/index.html'); await p.waitForTimeout(800);
  await p.evaluate(()=>{ try{localStorage.clear();}catch(e){} TO.newGame(); TO.changed(); });
  await p.evaluate(AI);
  const hist=[]; let res;
  for(let i=0;i<4000;i++){
    res=await p.evaluate(()=>{ let r; try{ r=turn(); }catch(e){ r='ERR '+e.message+' '+e.stack.split('\n')[1]; } TO.changed(); return {r, day:Math.round(TO.S.day-TO.START_DAY), cr:Math.round(TO.S.player.credits), ship:TO.S.player.ship.type}; });
    if(i%10===0) hist.push(res);
    if(res.r==='done'||res.r==='over'||res.r.startsWith('ERR')||res.day>365*80) break;
    if(i===0||[100,300].includes(i)) await p.screenshot({path:`play3_${i}.png`});
  }
  await p.screenshot({path:'play3_end.png'});
  const out=await p.evaluate(()=>({EV, LOG, day:Math.round(TO.S.day-TO.START_DAY), cr:Math.round(TO.S.player.credits), ship:TO.S.player.ship.type, used:Math.round(TO.S.player.ship.dvUsed)}));
  require('fs').writeFileSync('play_log3.json',JSON.stringify({out,hist,errs,res},null,1));
  console.log('End:',res, 'errors:',errs.slice(0,5));
  console.log(JSON.stringify(out.EV));
  await b.close();
})();
