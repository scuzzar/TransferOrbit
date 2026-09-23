const { chromium } = require('playwright');
const STEPS = +process.env.STEPS || 120;
(async()=>{
  const b=await chromium.launch();
  const report=[];
  for(const [name,vp] of (process.env.ONLY==='mob'?[['mob',{width:390,height:844}]]:process.env.ONLY==='desk'?[['desk',{width:1440,height:860}]]:[['desk',{width:1440,height:860}],['mob',{width:390,height:844}]])){
    const p=await b.newPage({viewport:vp, reducedMotion:'reduce'});
    const errs=[]; p.on('pageerror',e=>errs.push('pageerror: '+e.message));
    p.on('console',m=>{ if(m.type()==='error' && !/fonts|ERR_FAILED/.test(m.text())) errs.push('console: '+m.text()); });
    p.on('dialog',d=>{ errs.push('DIALOG '+d.type()+': '+d.message()); d.dismiss(); });
    await p.goto('http://localhost:8765/tests/harness.html'); await p.waitForTimeout(800);
    const f=p.frames().find(x=>x.url().includes('index.html'));
    await f.evaluate(()=>{ TO.ANIM.instant=true; });
    const st=()=>f.evaluate(()=>({node:TO.S.domain.node,site:TO.S.domain.site,busy:TO.S.action.busy,auto:!!TO.S.ui.auto,view:TO.S.ui.view,fuel:TO.S.domain.fuel,cr:TO.S.domain.credits,day:TO.S.domain.day,over:TO.S.domain.over,
      cargo:TO.cargoOrders().length,msg:TO.S.ui.msg,dv:document.getElementById('dv').textContent}));
    const idle=async(max=20000)=>{ const t=Date.now(); while(Date.now()-t<max){ const s=await st(); if(!s.busy&&!s.auto) return true; await p.waitForTimeout(20);} return false; };
    // Book the money flows: modules cannot be patched from outside any more, so the balance is
    // read before and after every click and filed under the button that was pressed.
    const SPEND={rescue:0,rescueN:0,cancel:0,cancelN:0,fuel:0,fee:0,income:0,other:0,where:[]};
    const kind=l=>/Rescue/.test(l)?'rescue':/Cancel/.test(l)?'cancel':/Refuel/.test(l)?'fuel':/Deliver|Accept/.test(l)?'income':'other';
    const click=async(sel,label)=>{ const el=await f.$(sel); if(!el) return false; if(!(await el.isVisible())||await el.isDisabled()) return false;
      const how=kind(label||sel);
      if(how==='rescue') SPEND.where.push(await f.evaluate(()=>{ const r=TO.rescueInfo(); return TO.locKey()+(r&&r.local?'[credit]':'[tanker]')+' cr='+Math.round(TO.S.domain.credits)+' fuel='+TO.S.domain.fuel.toFixed(1)+' cargo='+TO.cargoMass(); }));
      const before=await f.evaluate(()=>TO.S.domain.credits);
      try{ await el.click({timeout:3000}); }catch(e){ bad.push('CLICK BLOCKED: '+(label||sel)+' — '+(e.message.match(/<[^>]+> from[^\n]*intercepts/)||[''])[0]); await p.screenshot({path:'blocked_'+name+'.png'}); return false; }
      const d=(await f.evaluate(()=>TO.S.domain.credits))-before;
      if(Math.abs(d)>0.5){ SPEND[how]+=Math.round(-d); if(how==='rescue') SPEND.rescueN++; if(how==='cancel') SPEND.cancelN++; }
      log.push(label||sel); return true; };
    const log=[]; const bad=[];
    const check=async(tag)=>{ const s=await st();
      if(!isFinite(s.fuel)||s.fuel<-1e-6) bad.push(`${tag}: fuel ${s.fuel}`);
      if(!isFinite(s.cr)) bad.push(`${tag}: balance ${s.cr}`);
      if(!isFinite(s.day)) bad.push(`${tag}: day ${s.day}`);
      if(/NaN|undefined/.test(s.dv)) bad.push(`${tag}: delta-v readout "${s.dv}"`);
      const txt=await f.evaluate(()=>document.body.innerText); if(/NaN|undefined|\[object/.test(txt)) bad.push(`${tag}: page shows "${txt.match(/.{0,40}(NaN|undefined|\[object).{0,20}/)[0]}"`);
      const ov=await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1); if(ov) bad.push(`${tag}: horizontal scroll`);
      return s; };

    // --- 1. restart from the menu (two steps)
    await f.evaluate(()=>{ TO.S.domain.credits=12345; TO.changed(); });
    await click('#menubtn','Menu'); await click('[data-menu="reset"]','Start over (1)');
    let armed=await f.evaluate(()=>document.querySelector('[data-menu="reset"]').textContent);
    await click('[data-menu="reset"]','Start over (2)'); await p.waitForTimeout(200);
    let s=await st(); report.push(`${name}: restart -> balance ${s.cr} (expected 20000), button text after the 1st click: "${armed}"`);
    // --- 2. save / load
    await f.evaluate(()=>{ TO.S.domain.credits=777; TO.changed(); }); await click('#menubtn'); await click('[data-menu="save"]','Save');
    await f.evaluate(()=>{ TO.S.domain.credits=1; TO.changed(); }); await click('#menubtn'); await click('[data-menu="load"]','Load');
    s=await st(); report.push(`${name}: save/load -> balance ${s.cr} (expected 777), message: ${s.msg}`);
    await click('#menubtn'); await click('[data-menu="reset"]'); await click('[data-menu="reset"]'); await p.waitForTimeout(150);
    // --- 3. waiting from the menu
    const d0=(await st()).day; await click('#menubtn'); await click('[data-wait="30"]','+30 d'); await idle();
    report.push(`${name}: +30 days -> ${((await st()).day-d0).toFixed(1)} days passed`);
    // --- 4. info button, cargo tile, always full
    await click('#infobtn'); const lg=await f.evaluate(()=>!document.getElementById('legend').hidden); await click('#infobtn');
    await click('#cargotile','cargo tile'); const v1=(await st()).view; await click('.phead .back');
    report.push(`${name}: legend open=${lg}, the cargo tile opens "${v1}"`);

    // --- 5. the playing bot (the bookkeeping now lives in click(), see above)
    let deliveries=0, trips=0, stuck=0;
    for(let i=0;i<STEPS;i++){
      await idle(); s=await check('step '+i);
      if(s.over){ report.push(`${name}: bankrupt at step ${i}`); await click('#rescue button','restart after bankruptcy'); continue; }
      if(s.view!=='main' && s.view!=='route'){ const ok=await click('.phead .back','back from '+s.view); if(!ok){ log.push('BACK MISSING in '+s.view); await f.evaluate(()=>TO.openView('main')); } continue; }
      if(s.view==='route'){ await click('.phead .back'); if((await st()).view!=='main') await f.evaluate(()=>TO.openView('main')); continue; }
      // rescue
      if(await click('#rescue button','Rescue')){ await idle(); continue; }
      // deliver
      if(await click('#placecard button.full','Deliver')){ deliveries++; continue; }
      // random side actions
      const r=Math.random();
      if(r<0.05){ await click('#autofill','toggle always full'); continue; }
      if(r<0.08){ // double click on a random map target
        const h=await f.evaluate(()=>{ const x=TO.HITS[Math.floor(Math.random()*TO.HITS.length)]; if(!x) return null; const b=x.canvas.getBoundingClientRect(); return [b.left+x.x,b.top+x.y]; });
        if(h){ const fr=await (await p.$('#f')).boundingBox(); await p.mouse.dblclick(fr.x+h[0],fr.y+h[1]); log.push('double click'); }
        await f.evaluate(()=>TO.setView(null)); continue; }
      if(r<0.11){ // a hop, if one is possible
        const hop=await f.evaluate(()=>{ const a=TO.localActions().find(a=>a.hop && a.dv<TO.dvAvail()); if(!a) return null; TO.openRoute({node:a.to,site:a.site}); return a.label; });
        if(hop){ log.push(hop); await click('text=Next step only','execute the hop'); await idle(); await check('after the hop'); }
        continue; }
      // refuel when delta-v is low
      if(await f.evaluate(()=>!!TO.refuelInfo() && TO.refuelInfo().max>1 && TO.refuelInfo().need>2)){
        await click('#placecard button:has-text("Refuel")','open Refuel'); await click('#panel .pfoot button.go','Refuel'); await idle(); continue; }
      // cargo on board -> route to the first destination via the link in the hold
      if(s.cargo>0){
        await click('#cargotile'); const ok=await click('#panel .o-btns .olink','route link');
        if(!ok){ await f.evaluate(()=>TO.openView('main')); stuck++; continue; }
        if(await click('#panel button:has-text("Start the autopilot")','autopilot')){ trips++; await idle(60000); log.push('  -> '+(await st()).msg+' @'+(await st()).node+'/'+(await st()).site+' fuel '+(await st()).fuel.toFixed(1)); }
        else { log.push('NO AUTOPILOT: '+(await f.evaluate(()=>document.getElementById('panel').innerText.replace(/\s+/g,' ').slice(0,260)))); // too little delta-v: cancel cargo for a penalty, or refuel
          if(await click('#panel button:has-text("To the nearest depot first")','-> nearest depot')){ if(await click('#panel button:has-text("Start the autopilot")','autopilot to the depot')){ trips++; await idle(60000); } await f.evaluate(()=>{ if(TO.S.ui.view!=='main') TO.openView('main'); }); continue; }
          const tank=await f.evaluate(()=>{ const r=TO.refuelInfo(); return !!r && r.need>0.5 && r.max>0.5; });
          if(tank){ await f.evaluate(()=>TO.openView('refuel')); await click('#panel .pfoot button.go','Refuel (before the route)'); await idle(); }
          else { await f.evaluate(()=>TO.openView('cargo')); const a=await click('#panel .o-btns button:has-text("Return")','return an order') || await click('#panel .o-btns button:has-text("Cancel")','Cancel an order'); if(!a) stuck++;
            // otherwise the same order is taken straight back on (a destination it would strand at, say): let the board move on
            else { await f.evaluate(()=>TO.openView('main')); await click('#menubtn'); await click('[data-wait="30"]','wait after returning'); await idle(); } }
        }
        await f.evaluate(()=>{ if(TO.S.ui.view!=='main') TO.openView('main'); });
        continue;
      }
      // accept orders
      if(await click('#placecard button:has-text("Orders")','order board')){
        // pick up to 2 reachable orders
        // one at a time: every click redraws the board, and only then do the warnings count the selection
        const n=await f.evaluate(()=>{ const free='.orow input:not(:disabled):not(:checked)', groups=()=>[...document.querySelectorAll('.ogroup')];
          for(let c=0;c<2;c++){ const g=groups().find(g=>!g.querySelector('.o-warn') && g.querySelector(free)); if(!g) break; g.querySelector(free).click();
            let bad; while((bad=groups().find(g=>g.querySelector('.o-warn') && g.querySelector('.orow input:checked')))) bad.querySelector('.orow input:checked').click();
          }
          return document.querySelectorAll('.orow input:checked').length; });
        if(n && await click('#panel .pfoot button.go','Accept')) continue;
        // nothing reachable: back out again
        await f.evaluate(()=>TO.openView('main'));
      }
      // nothing to do: fly to the nearest post that has orders (pick card -> route)
      const tgt=await f.evaluate(()=>{ const cand=TO.POSTS.filter(k=>TO.S.domain.eco.orders.some(o=>o.state==='open'&&o.from===k.id)&&!(TO.postAt()&&TO.postAt().id===k.id));
        const pl=cand.map(k=>({k,p:TO.planRoute(TO.kTarget(k),'eco')})).filter(x=>x.p && x.p.dv<TO.dvAvail()-200).sort((a,b)=>a.p.dv-b.p.dv)[0];
        if(!pl) return null; TO.openRoute(TO.kTarget(pl.k)); return pl.k.name; });
      if(tgt){ log.push('flying to '+tgt); if(await click('#panel button:has-text("Start the autopilot")','autopilot')){ trips++; await idle(60000); log.push('  -> '+(await st()).msg+' @'+(await st()).node+'/'+(await st()).site+' fuel '+(await st()).fuel.toFixed(1)); } await f.evaluate(()=>{ if(TO.S.ui.view!=='main') TO.openView('main'); }); }
      else if(await f.evaluate(()=>{ if(TO.refuelInfo()) return false; const nf=TO.nearestFuel({node:TO.S.domain.node,site:TO.S.domain.site,day:TO.S.domain.day}); if(!nf.spot||nf.dv>TO.dvAvail()) return false; TO.openRoute(nf.spot); return true; })){
        if(await click('#panel button:has-text("Start the autopilot")','autopilot to the depot (empty)')){ trips++; await idle(60000); } await f.evaluate(()=>{ if(TO.S.ui.view!=='main') TO.openView('main'); }); }
      else { await click('#menubtn'); await click('[data-wait="30"]','wait'); await idle(); stuck++; log.push('AT A LOSS @'+s.node+'/'+s.site+' dv='+Math.round(await f.evaluate(()=>TO.dvAvail()))+' cr='+Math.round(s.cr)); }
    }
    s=await check('end');
    if(process.env.LOG) console.log(name+' NOTABLE:\n'+[...(log.filter(x=>/NO AUTOPILOT|AT A LOSS|BACK|Rescue|bankrupt|flying|->|Refuel|Accept|Deliver/.test(x)))].slice(0,+process.env.LOG).join('\n'));
    report.push(`${name}: spending ${JSON.stringify(SPEND)}`);
    report.push(`${name}: bot ${STEPS} steps: ${trips} flights, ${deliveries} deliveries, ${stuck}× at a loss, ended on day ${Math.round(s.day-10957.5)}, balance ${Math.round(s.cr)}, ${s.node}`);
    report.push(`${name}: errors: ${errs.length?[...new Set(errs)].join(' | '):'none'}`);
    report.push(`${name}: invariants: ${bad.length?[...new Set(bad)].slice(0,8).join(' | '):'ok'}`);
    await p.screenshot({path:`bot_${name}.png`});
    await p.close();
  }
  console.log(report.join('\n'));
  await b.close();
})();
