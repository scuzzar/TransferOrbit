const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
  await p.goto('http://localhost:8765/dist/index.html'); await p.waitForTimeout(600);
  const r=await p.evaluate(()=>{ const c=document.createElement('canvas'); c.width=300;c.height=300; const g=c.getContext('2d'); const t=performance.now(); for(let i=0;i<200;i++) TO.rocketMesh(g,150,150,i*0.1,'x'); return (performance.now()-t)/200; });
  console.log('ms per rocket',r.toFixed(3)); await b.close(); })();
