const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const errs=[];
  const p=await b.newPage({viewport:{width:1100,height:760},deviceScaleFactor:4}); p.on('pageerror',e=>errs.push(e.message));
  // Über den Server, nicht über file://: nur so lädt three.js die Texturen und die 3D-Ebene läuft.
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(2500);
  console.log('3D-Ebene an:', await p.evaluate(()=>GL.on));
  // An drawRocket hängen, nicht an rocketMesh: drawRocket läuft in beiden Wegen (2D und three.js).
  await p.evaluate(()=>{ try{localStorage.clear();}catch(e){} newGame(); S.fuel=80; render(); window._dr=drawRocket; drawRocket=function(g,key,x,y,...r){ const b=g.canvas.getBoundingClientRect(); window.RP={x:b.left+x,y:b.top+y}; return _dr(g,key,x,y,...r); }; animateTo=function(){}; });
  const shots=[];
  const snap=async(setup,ts,tag)=>{ await p.evaluate(setup); for(const t of ts){ await p.evaluate(t=>{ const m=S.move; if(m){S.day=m.d0+(m.d1-m.d0)*t;} draw(); },t); const rp=await p.evaluate(()=>window.RP); if(!rp) continue; await p.screenshot({path:`z_${tag}_${t}.png`,clip:{x:rp.x-40,y:rp.y-40,width:80,height:80}}); shots.push(`z_${tag}_${t}.png`); } await p.evaluate(()=>{ S.move=null; S.busy=false; S.anim=null; window.RP=null; render(); }); };
  await snap(()=>{ doAction(localActions().find(a=>a.site==='kourou')); },[0.1,0.4,0.7,0.9],'land');
  await p.evaluate(()=>{ S.node='earth.surf'; S.site='kourou'; S.fuel=80; render(); });
  await snap(()=>{ draw(); },[0],'pad');
  await snap(()=>{ doAction(localActions().find(a=>a.to==='earth.orbit')); },[0.1,0.5,0.9],'up');
  await p.evaluate(()=>{ S.node='earth.orbit'; S.site=null; S.fuel=80; render(); setView({level:'sys',planet:'earth'}); });
  await snap(()=>{ doAction(localActions().find(a=>/moon/.test(a.to||''))||localActions().find(a=>a.to==='earth.capt')); },[0.2,0.6],'sys');
  console.log(JSON.stringify(shots),'Fehler',errs); await b.close(); })();
