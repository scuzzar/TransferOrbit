const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>{errs.push('dialog');d.dismiss();});
  await p.goto('http://localhost:8765/tests/harness.html'); await p.waitForTimeout(800);
  const f=p.frames().find(x=>x.url().includes('index.html'));
  // Karte nach Panel schließen (mobil)
  await f.click('#cargotile'); await f.click('.phead .back'); await p.waitForTimeout(100);
  console.log('Karte nach Zurück (Breite x Höhe):', await f.evaluate(()=>{ const c=[...document.querySelectorAll('canvas')].find(c=>!c.hidden); return c.clientWidth+'x'+c.clientHeight; }));
  // Neustart per Menü
  await f.evaluate(()=>{ TO.S.credits=5; TO.geaendert(); });
  await f.click('#menubtn'); await f.click('[data-menu="reset"]'); await f.click('[data-menu="reset"]'); await p.waitForTimeout(100);
  console.log('Konto nach Neustart:', await f.evaluate(()=>TO.S.credits));
  // Menü schließen setzt Bestätigung zurück
  await f.click('#menubtn'); await f.click('[data-menu="reset"]'); await f.click('#menubtn'); await f.click('#menubtn');
  console.log('Reset-Knopf nach Schließen:', await f.textContent('[data-menu="reset"]'));
  // Trotzdem starten
  await f.evaluate(()=>{ TO.openRoute({node:'moon.surf',site:'tranquillitatis'}); });
  console.log('Knopf bei Strand-Warnung:', await f.evaluate(()=>[...document.querySelectorAll('#panel .two button')].map(b=>b.textContent).join(' | ')));
  // Kredit-Falle: Pavonis ohne Geld, halber Tank, Aufträge vorhanden
  await f.evaluate(()=>{ TO.openView('main'); TO.S.node='mars.surf'; TO.S.site='pavonis'; TO.S.credits=0; TO.S.fuel=45; TO.strandCache.key=null; TO.geaendert(); });
  console.log('Gestrandet bei 0 Cr, 45 t in Pavonis:', await f.evaluate(()=>TO.stranded()));
  await f.evaluate(()=>{ TO.S.fuel=1; TO.strandCache.key=null; TO.geaendert(); });
  console.log('Gestrandet bei 0 Cr, 1 t in Pavonis:', await f.evaluate(()=>TO.stranded()), '| Box:', (await f.textContent('#rescue')).slice(0,60));
  console.log('Fehler:', errs.length?errs:'keine');
  await p.screenshot({path:'regress_mob.png'});
  await b.close();
})();
