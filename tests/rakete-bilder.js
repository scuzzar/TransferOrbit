const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const errs=[];
  const p=await b.newPage({viewport:{width:1100,height:760},deviceScaleFactor:4}); p.on('pageerror',e=>errs.push(e.message));
  // Über den Server, nicht über file://: ES-Module laden nur über http, und three.js braucht das Netz.
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(2500);
  console.log('3D-Ebene an:', await p.evaluate(()=>TO.GL.on));
  await p.evaluate(()=>{ try{localStorage.clear();}catch(e){} TO.newGame(); TO.S.fuel=80; TO.geaendert(); });
  // Wo die Rakete zuletzt lag, merkt sich karte/rakete selbst: kein Umbiegen der Funktion nötig.
  const ort=()=>p.evaluate(()=>{ const r=TO.RAKETE_ZULETZT; if(!r.ebene) return null;
    const box=r.ebene.getBoundingClientRect(); return {x:box.left+r.x, y:box.top+r.y}; });
  // Den Zug aufbauen, aber nicht ablaufen lassen: so lässt sich jede Phase einzeln abbilden.
  const zug=w=>p.evaluate(w=>{ const a=eval(w); if(!a) return false;
    TO.S.move=TO.bewegungPlanen(a); TO.S.busy=true; return true; },w);
  const shots=[];
  const snap=async(aufbau,ts,tag)=>{
    await aufbau();
    for(const t of ts){
      await p.evaluate(t=>{ const m=TO.S.move; if(m){TO.S.day=m.d0+(m.d1-m.d0)*t;} TO.RAKETE_ZULETZT.ebene=null; TO.draw(); },t);
      const rp=await ort(); if(!rp) continue;
      await p.screenshot({path:`z_${tag}_${t}.png`,clip:{x:rp.x-40,y:rp.y-40,width:80,height:80}});
      shots.push(`z_${tag}_${t}.png`);
    }
    await p.evaluate(()=>{ TO.S.move=null; TO.S.busy=false; TO.S.anim=null; TO.geaendert(); });
  };
  await snap(()=>zug("TO.localActions().find(a=>a.site==='kourou')"),[0.1,0.4,0.7,0.9],'land');
  await p.evaluate(()=>{ TO.S.node='earth.surf'; TO.S.site='kourou'; TO.S.fuel=80; TO.geaendert(); });
  await snap(()=>p.evaluate(()=>TO.draw()),[0],'pad');
  await snap(()=>zug("TO.localActions().find(a=>a.to==='earth.orbit')"),[0.1,0.5,0.9],'up');
  await p.evaluate(()=>{ TO.S.node='earth.orbit'; TO.S.site=null; TO.S.fuel=80; TO.geaendert(); TO.setView({level:'sys',planet:'earth'}); });
  await snap(()=>zug("TO.localActions().find(a=>/moon/.test(a.to||''))||TO.localActions().find(a=>a.to==='earth.capt')"),[0.2,0.6],'sys');
  console.log(JSON.stringify(shots),'Fehler',errs); await b.close(); })();
