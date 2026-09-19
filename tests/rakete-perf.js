const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
  await p.goto('file://'+__dirname+'/../index.html'); await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{ const c=document.createElement('canvas'); c.width=300;c.height=300; const g=c.getContext('2d'); const t=performance.now(); for(let i=0;i<200;i++) rocketMesh(g,150,150,i*0.1,'x'); return (performance.now()-t)/200; });
  console.log('ms pro Rakete',r.toFixed(3)); await b.close(); })();
