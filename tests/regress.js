const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>{errs.push('dialog');d.dismiss();});
  await p.goto('http://localhost:8765/tests/harness.html'); await p.waitForTimeout(800);
  const f=p.frames().find(x=>x.url().includes('index.html'));
  await f.evaluate(()=>{ TO.ANIM.instant=true; });
  // closing a panel must give the map its size back (mobile)
  await f.click('#cargotile'); await f.click('.phead .back'); await p.waitForTimeout(100);
  console.log('Map after going back (width x height):', await f.evaluate(()=>{ const c=[...document.querySelectorAll('canvas')].find(c=>!c.hidden); return c.clientWidth+'x'+c.clientHeight; }));
  // restart from the menu
  await f.evaluate(()=>{ TO.S.player.credits=5; TO.changed(); });
  await f.click('#menubtn'); await f.click('[data-menu="reset"]'); await f.click('[data-menu="reset"]'); await p.waitForTimeout(100);
  console.log('Balance after restart:', await f.evaluate(()=>TO.S.player.credits));
  // closing the menu resets the confirmation
  await f.click('#menubtn'); await f.click('[data-menu="reset"]'); await f.click('#menubtn'); await f.click('#menubtn');
  console.log('Reset button after closing:', await f.textContent('[data-menu="reset"]'));
  // "start anyway" on a stranding warning
  await f.evaluate(()=>{ TO.openRoute(TO.nodeOf('moon.surf','tranquillitatis')); });
  console.log('Buttons on the stranding warning:', await f.evaluate(()=>[...document.querySelectorAll('#panel .two button')].map(b=>b.textContent).join(' | ')));
  // the credit trap: Pavonis with no money, half a tank, orders available
  await f.evaluate(()=>{ TO.openView('main'); TO.S.player.ship.dock(TO.nodeOf('mars.surf','pavonis')); TO.S.player.credits=0; TO.S.player.ship.fuel=45; TO.strandCache.key=null; TO.changed(); });
  console.log('Stranded at 0 Cr, 45 t on Pavonis:', await f.evaluate(()=>TO.stranded()));
  await f.evaluate(()=>{ TO.S.player.ship.fuel=1; TO.strandCache.key=null; TO.changed(); });
  console.log('Stranded at 0 Cr, 1 t on Pavonis:', await f.evaluate(()=>TO.stranded()), '| box:', (await f.textContent('#rescue')).slice(0,60));
  // the two route modes have to offer a real choice: "economical" takes the 40-day
  // aerobraking step into low Earth orbit, "leave now" pays for the direct burn instead
  const modes=await f.evaluate(()=>{
    TO.newGame();
    TO.S.player.ship.dock(TO.nodeOf('moon.surf','shackleton')); TO.S.player.ship.fuel=TO.S.player.ship.def.cap;
    const tgt=TO.nodeOf('earth.surf','kourou'), r={};
    for(const m of ['eco','now']){ const pl=TO.planRoute(tgt,m);
      r[m]={dv:+(pl.dv/1000).toFixed(2), days:Math.round(pl.days), brake:pl.steps.map(s=>s.label).find(l=>/low orbit/.test(l))}; }
    return r;
  });
  console.log('Moon -> Earth, economical:', JSON.stringify(modes.eco));
  console.log('Moon -> Earth, leave now :', JSON.stringify(modes.now),
    modes.now.days<10 && modes.eco.days>30 ? '| ok' : '| WRONG: the modes do not differ');

  console.log('Errors:', errs.length?errs:'none');
  await p.screenshot({path:'regress_mob.png'});
  await b.close();
})();
