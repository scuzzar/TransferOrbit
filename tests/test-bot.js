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
    const st=()=>f.evaluate(()=>({node:TO.S.node,site:TO.S.site,busy:TO.S.busy,auto:!!TO.S.ui.auto,view:TO.S.ui.view,fuel:TO.S.fuel,cr:TO.S.credits,day:TO.S.day,over:TO.S.over,
      cargo:TO.cargoOrders().length,msg:TO.S.msg,dv:document.getElementById('dv').textContent}));
    const idle=async(max=20000)=>{ const t=Date.now(); while(Date.now()-t<max){ const s=await st(); if(!s.busy&&!s.auto) return true; await p.waitForTimeout(100);} return false; };
    // Geldflüsse buchen: Module lassen sich nicht mehr von außen umbiegen, also wird
    // vor und nach jedem Klick der Kontostand gelesen und nach Knopf einsortiert.
    const SPEND={rettung:0,rettungN:0,abbruch:0,abbruchN:0,tanken:0,gebuehr:0,einnahme:0,sonst:0,wo:[]};
    const kat=l=>/Rettung/.test(l)?'rettung':/[Aa]bbrechen/.test(l)?'abbruch':/Tanken/.test(l)?'tanken':/Abliefern|Annehmen/.test(l)?'einnahme':'sonst';
    const click=async(sel,label)=>{ const el=await f.$(sel); if(!el) return false; if(!(await el.isVisible())||await el.isDisabled()) return false;
      const wie=kat(label||sel);
      if(wie==='rettung') SPEND.wo.push(await f.evaluate(()=>{ const r=TO.rescueInfo(); return TO.locKey()+(r&&r.local?'[Kredit]':'[Tanker]')+' cr='+Math.round(TO.S.credits)+' fuel='+TO.S.fuel.toFixed(1)+' cargo='+TO.cargoMass(); }));
      const vor=await f.evaluate(()=>TO.S.credits);
      try{ await el.click({timeout:3000}); }catch(e){ bad.push('KLICK BLOCKIERT: '+(label||sel)+' — '+(e.message.match(/<[^>]+> from[^\n]*intercepts/)||[''])[0]); await p.screenshot({path:'blocked_'+name+'.png'}); return false; }
      const d=(await f.evaluate(()=>TO.S.credits))-vor;
      if(Math.abs(d)>0.5){ SPEND[wie]+=Math.round(-d); if(wie==='rettung') SPEND.rettungN++; if(wie==='abbruch') SPEND.abbruchN++; }
      log.push(label||sel); return true; };
    const log=[]; const bad=[];
    const check=async(tag)=>{ const s=await st();
      if(!isFinite(s.fuel)||s.fuel<-1e-6) bad.push(`${tag}: Treibstoff ${s.fuel}`);
      if(!isFinite(s.cr)) bad.push(`${tag}: Konto ${s.cr}`);
      if(!isFinite(s.day)) bad.push(`${tag}: Tag ${s.day}`);
      if(/NaN|undefined/.test(s.dv)) bad.push(`${tag}: Δv-Anzeige "${s.dv}"`);
      const txt=await f.evaluate(()=>document.body.innerText); if(/NaN|undefined|\[object/.test(txt)) bad.push(`${tag}: Seite zeigt "${txt.match(/.{0,40}(NaN|undefined|\[object).{0,20}/)[0]}"`);
      const ov=await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1); if(ov) bad.push(`${tag}: horizontal scroll`);
      return s; };

    // --- 1. Neustart über das Menü (zweistufig)
    await f.evaluate(()=>{ TO.S.credits=12345; TO.geaendert(); });
    await click('#menubtn','Menü'); await click('[data-menu="reset"]','Neu starten (1)');
    let armed=await f.evaluate(()=>document.querySelector('[data-menu="reset"]').textContent);
    await click('[data-menu="reset"]','Neu starten (2)'); await p.waitForTimeout(200);
    let s=await st(); report.push(`${name}: Neustart -> Konto ${s.cr} (erwartet 20000), Knopftext nach 1. Klick: "${armed}"`);
    // --- 2. Speichern / Laden
    await f.evaluate(()=>{ TO.S.credits=777; TO.geaendert(); }); await click('#menubtn'); await click('[data-menu="save"]','Speichern');
    await f.evaluate(()=>{ TO.S.credits=1; TO.geaendert(); }); await click('#menubtn'); await click('[data-menu="load"]','Laden');
    s=await st(); report.push(`${name}: Speichern/Laden -> Konto ${s.cr} (erwartet 777), Meldung: ${s.msg}`);
    await click('#menubtn'); await click('[data-menu="reset"]'); await click('[data-menu="reset"]'); await p.waitForTimeout(150);
    // --- 3. Warten über Menü
    const d0=(await st()).day; await click('#menubtn'); await click('[data-wait="30"]','+30 T'); await idle();
    report.push(`${name}: +30 Tage -> ${((await st()).day-d0).toFixed(1)} Tage vergangen`);
    // --- 4. Info-Knopf, Laderaum-Kachel, Immer voll
    await click('#infobtn'); const lg=await f.evaluate(()=>!document.getElementById('legend').hidden); await click('#infobtn');
    await click('#cargotile','Laderaum-Kachel'); const v1=(await st()).view; await click('.phead .back');
    report.push(`${name}: Legende offen=${lg}, Laderaum-Kachel öffnet "${v1}"`);

    // --- 5. Spiel-Bot
    // (Buchhaltung steckt jetzt in click(), siehe oben)
    let deliveries=0, trips=0, stuck=0;
    for(let i=0;i<STEPS;i++){
      await idle(); s=await check('Schritt '+i);
      if(s.over){ report.push(`${name}: Konkurs bei Schritt ${i}`); await click('#rescue button','Neustart nach Konkurs'); continue; }
      if(s.view!=='main' && s.view!=='route'){ const ok=await click('.phead .back','zurück von '+s.view); if(!ok){ log.push('BACK FEHLT in '+s.view); await f.evaluate(()=>TO.openView('main')); } continue; }
      if(s.view==='route'){ await click('.phead .back'); if((await st()).view!=='main') await f.evaluate(()=>TO.openView('main')); continue; }
      // Rettung
      if(await click('#rescue button','Rettung')){ await idle(); continue; }
      // Abliefern
      if(await click('#placecard button.full','Abliefern')){ deliveries++; continue; }
      // zufällige Nebenaktionen
      const r=Math.random();
      if(r<0.05){ await click('#autofill','Immer voll umschalten'); continue; }
      if(r<0.08){ // Doppelklick auf zufälliges Kartenziel
        const h=await f.evaluate(()=>{ const x=TO.HITS[Math.floor(Math.random()*TO.HITS.length)]; if(!x) return null; const b=x.canvas.getBoundingClientRect(); return [b.left+x.x,b.top+x.y]; });
        if(h){ const fr=await (await p.$('#f')).boundingBox(); await p.mouse.dblclick(fr.x+h[0],fr.y+h[1]); log.push('Doppelklick'); }
        await f.evaluate(()=>TO.setView(null)); continue; }
      if(r<0.11){ // Hüpfer, falls möglich
        const hop=await f.evaluate(()=>{ const a=TO.localActions().find(a=>a.hop && a.dv<TO.dvAvail()); if(!a) return null; TO.openRoute({node:a.to,site:a.site}); return a.label; });
        if(hop){ log.push(hop); await click('text=Nur nächster Schritt','Hüpfer ausführen'); await idle(); await check('nach Hüpfer'); }
        continue; }
      // Tanken wenn wenig Δv
      const dvNum=await f.evaluate(()=>TO.dvAvail());
      if(await f.evaluate(()=>!!TO.refuelInfo() && TO.refuelInfo().max>1 && TO.refuelInfo().need>2)){
        await click('#placecard button:has-text("Tanken")','Tanken öffnen'); await click('#panel .pfoot button.go','Tanken'); await idle(); continue; }
      // Fracht an Bord → Route zum ersten Ziel per Link im Laderaum
      if(s.cargo>0){
        await click('#cargotile'); const ok=await click('#panel .o-btns .olink','Route-Link');
        if(!ok){ await f.evaluate(()=>TO.openView('main')); stuck++; continue; }
        if(await click('#panel button:has-text("Autopilot starten")','Autopilot')){ trips++; await idle(60000); log.push('  -> '+(await st()).msg+' @'+(await st()).node+'/'+(await st()).site+' fuel '+(await st()).fuel.toFixed(1)); }
        else { log.push('KEIN AUTOPILOT: '+(await f.evaluate(()=>document.getElementById('panel').innerText.replace(/\s+/g,' ').slice(0,260)))); // zu wenig Δv: Fracht mit Strafe abbrechen oder tanken
          if(await click('#panel button:has-text("Erst zur nächsten Tankstelle")','→ nächste Tankstelle')){ if(await click('#panel button:has-text("Autopilot starten")','Autopilot zur Tankstelle')){ trips++; await idle(60000); } await f.evaluate(()=>{ if(TO.S.ui.view!=='main') TO.openView('main'); }); continue; }
          const tank=await f.evaluate(()=>{ const r=TO.refuelInfo(); return !!r && r.need>0.5 && r.max>0.5; });
          if(tank){ await f.evaluate(()=>TO.openView('tanken')); await click('#panel .pfoot button.go','Tanken (vor Route)'); await idle(); }
          else { await f.evaluate(()=>TO.openView('fracht')); const a=await click('#panel .o-btns button:has-text("Zurückgeben")','Auftrag zurückgeben') || await click('#panel .o-btns button:has-text("Abbrechen")','Auftrag abbrechen'); if(!a) stuck++; }
        }
        await f.evaluate(()=>{ if(TO.S.ui.view!=='main') TO.openView('main'); });
        continue;
      }
      // Aufträge annehmen
      if(await click('#placecard button:has-text("Aufträge")','Auftragsbrett')){
        // bis zu 3 erreichbare Aufträge wählen
        const n=await f.evaluate(()=>{ let c=0; const hdr=[...document.querySelectorAll('.ogroup')];
          for(const g of hdr){ if(g.querySelector('.o-warn')) continue; const inp=g.querySelector('.orow input:not(:disabled)'); if(inp && c<2){ inp.click(); c++; } } return c; });
        if(n && await click('#panel .pfoot button.go','Annehmen')) continue;
        // kein erreichbarer Auftrag: Route-Link des ersten Ziels testen, dann zurück
        await f.evaluate(()=>TO.openView('main'));
      }
      // nichts zu tun: zum nächsten Kontor mit Aufträgen fliegen (Pick-Karte → Route)
      const tgt=await f.evaluate(()=>{ const cand=TO.KONTORE.filter(k=>TO.S.eco.orders.some(o=>o.state==='open'&&o.from===k.id)&&!(TO.kontorAt()&&TO.kontorAt().id===k.id));
        const pl=cand.map(k=>({k,p:TO.planRoute(TO.kTarget(k),'eco')})).filter(x=>x.p && x.p.dv<TO.dvAvail()-200).sort((a,b)=>a.p.dv-b.p.dv)[0];
        if(!pl) return null; TO.openRoute(TO.kTarget(pl.k)); return pl.k.name; });
      if(tgt){ log.push('Fliege zu '+tgt); if(await click('#panel button:has-text("Autopilot starten")','Autopilot')){ trips++; await idle(60000); log.push('  -> '+(await st()).msg+' @'+(await st()).node+'/'+(await st()).site+' fuel '+(await st()).fuel.toFixed(1)); } await f.evaluate(()=>{ if(TO.S.ui.view!=='main') TO.openView('main'); }); }
      else if(await f.evaluate(()=>{ if(TO.refuelInfo()) return false; const nf=TO.nearestFuel({node:TO.S.node,site:TO.S.site,day:TO.S.day}); if(!nf.spot||nf.dv>TO.dvAvail()) return false; TO.openRoute(nf.spot); return true; })){
        if(await click('#panel button:has-text("Autopilot starten")','Autopilot zur Tankstelle (leer)')){ trips++; await idle(60000); } await f.evaluate(()=>{ if(TO.S.ui.view!=='main') TO.openView('main'); }); }
      else { await click('#menubtn'); await click('[data-wait="30"]','Warten'); await idle(); stuck++; log.push('RATLOS @'+s.node+'/'+s.site+' dv='+Math.round(await f.evaluate(()=>TO.dvAvail()))+' cr='+Math.round(s.cr)); }
    }
    s=await check('Ende');
    if(process.env.LOG) console.log(name+' AUFFÄLLIG:\n'+[...(log.filter(x=>/KEIN|RATLOS|BACK|Rettung|Konkurs|Fliege|->|Tanken|Annehmen|Abliefern/.test(x)))].slice(0,+process.env.LOG).join('\n'));
    report.push(`${name}: Ausgaben ${JSON.stringify(SPEND)}`);
    report.push(`${name}: Bot ${STEPS} Schritte: ${trips} Flüge, ${deliveries} Ablieferungen, ${stuck}× ratlos, Endstand Tag ${Math.round(s.day-10957.5)}, Konto ${Math.round(s.cr)}, ${s.node}`);
    report.push(`${name}: Fehler: ${errs.length?[...new Set(errs)].join(' | '):'keine'}`);
    report.push(`${name}: Invarianten: ${bad.length?[...new Set(bad)].slice(0,8).join(' | '):'ok'}`);
    await p.screenshot({path:`bot_${name}.png`});
    await p.close();
  }
  console.log(report.join('\n'));
  await b.close();
})();
