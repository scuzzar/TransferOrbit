const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const errs=[];
  const p=await b.newPage({viewport:{width:1100,height:760},deviceScaleFactor:4}); p.on('pageerror',e=>errs.push(e.message));
  // Over the server, not over file://: ES modules only load over http, and three.js needs the network.
  await p.goto('http://localhost:8765/dist/index.html'); await p.waitForTimeout(2500);
  console.log('3D layer on:', await p.evaluate(()=>TO.GL.on));
  await p.evaluate(()=>{ try{localStorage.clear();}catch(e){} TO.newGame(); TO.S.ship.fuel=80; TO.changed(); });
  // Where the rocket was drawn last is remembered by map/rocket itself: no need to patch the function.
  const spot=()=>p.evaluate(()=>{ const r=TO.LAST_ROCKET; if(!r.layer) return null;
    const box=r.layer.getBoundingClientRect(); return {x:box.left+r.x, y:box.top+r.y}; });
  // Set the move up but do not let it run: that way every phase can be captured on its own.
  const move=w=>p.evaluate(w=>{ const a=eval(w); if(!a) return false;
    TO.SCENE.move=TO.planMove(a); TO.S.ship.busy=true; return true; },w);
  const shots=[];
  const snap=async(setup,ts,tag)=>{
    await setup();
    for(const t of ts){
      await p.evaluate(t=>{ const m=TO.SCENE.move; if(m){TO.S.day=m.d0+(m.d1-m.d0)*t;} TO.LAST_ROCKET.layer=null; TO.draw(); },t);
      const rp=await spot(); if(!rp) continue;
      await p.screenshot({path:`z_${tag}_${t}.png`,clip:{x:rp.x-40,y:rp.y-40,width:80,height:80}});
      shots.push(`z_${tag}_${t}.png`);
    }
    await p.evaluate(()=>{ TO.SCENE.move=null; TO.S.ship.busy=false; TO.SCENE.anim=null; TO.changed(); });
  };
  await snap(()=>move("TO.localActions().find(a=>a.site==='kourou')"),[0.1,0.4,0.7,0.9],'land');
  await p.evaluate(()=>{ TO.S.ship.dock(new TO.Place('earth.surf','kourou')); TO.S.ship.fuel=80; TO.changed(); });
  await snap(()=>p.evaluate(()=>TO.draw()),[0],'pad');
  await snap(()=>move("TO.localActions().find(a=>a.to==='earth.orbit')"),[0.1,0.5,0.9],'up');
  await p.evaluate(()=>{ TO.S.ship.dock(new TO.Place('earth.orbit')); TO.S.ship.fuel=80; TO.changed(); TO.setView({level:'sys',planet:'earth'}); });
  await snap(()=>move("TO.localActions().find(a=>/moon/.test(a.to||''))||TO.localActions().find(a=>a.to==='earth.capt')"),[0.2,0.6],'sys');
  console.log(JSON.stringify(shots),'errors',errs); await b.close(); })();
