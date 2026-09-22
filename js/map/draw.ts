// The drawing code itself: solar system, system, body, with draw() as the entry point.

import { $, TAU, reduce } from '../basics.js';
import { B, POST_BY_ID, POSTS, M, PLANETS, SITES, bodyColor, bodyOf, fuelHere, hasAtm, hasDepot, moonsOf, planetOfBody } from '../game/world.js';
import { keplerNu, theta, transfer, transferConic } from '../game/physics.js';
import { S, burn, cargoOrders, here, homePlanet } from '../game/state.js';
import { D2R, R_HIGH, R_ORB, SYS_EL, Vec3, bodyLon0, bodyView, bvec, defaultOrb, makeCam, moonAngle, orbitPos, ringPt, shipOrb, sysState, vadd, vmul } from './geometry.js';
import { HITS, bctx, cargoTo, cssVar, ctx, cv, fitCanvas, clearHits, isPick, moveProg, prep, prepBack, sc, sctx } from './canvas.js';
import { RKT_LEN } from './rocketdata.js';
import { GL, glBegin, glEnd, glHide, glNote, glPath, glPut, glSaturnRing } from './gl.js';
import { drawRocket, setRocketMode } from './rocket.js';
import { mapView, renderCrumbs } from './view.js';

export function draw(){
  const v=mapView(); renderCrumbs(v); clearHits();
  cv.hidden=v.level==='sys'; sc.hidden=v.level!=='sys';
  if(v.level==='sys') drawSys(v.planet); else if(v.level==='body') drawBody(v.body); else drawSol();
}

function drawSol(){
  const [W]=fitCanvas(cv,1); if(W<60) return; prep(cv,ctx,W,W);
  setRocketMode('flat'); glHide(); // the top-down view of the solar system stays flat
  const v=cssVar(), c=W/2, maxR=W/2-20;
  const rOf=(a:number)=>16+(maxR-16)*Math.sqrt(a/9.537);
  const pos=(k:string,day:number)=>{const th=theta(k,day), r=rOf(B[k].a); return [c+r*Math.cos(th), c-r*Math.sin(th)];};
  ctx.lineWidth=1; ctx.strokeStyle=v('--orbit');
  PLANETS.forEach(k=>{ctx.beginPath(); ctx.arc(c,c,rOf(B[k].a),0,TAU); ctx.stroke();});
  ctx.fillStyle=v('--sun'); ctx.beginPath(); ctx.arc(c,c,6,0,TAU); ctx.fill();
  const from=homePlanet(), tgt=S.domain.target;
  if(from && tgt && tgt!==from){
    const t=transfer(from,tgt as string,S.domain.day), thA=theta(from,S.domain.day), thG=thA+t.phiStar, rT=rOf(B[tgt as string].a);
    ctx.strokeStyle=t.d<0.04?v('--good'):v('--accent'); ctx.setLineDash([4,4]); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(c,c); ctx.lineTo(c+rT*Math.cos(thG), c-rT*Math.sin(thG)); ctx.stroke();
    ctx.beginPath(); ctx.arc(c+rT*Math.cos(thG), c-rT*Math.sin(thG), 10,0,TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha=.5; ctx.beginPath(); ctx.moveTo(c,c); const [ax,ay]=pos(from,S.domain.day); ctx.lineTo(ax,ay); ctx.stroke(); ctx.globalAlpha=1;
    ctx.lineWidth=2; ctx.beginPath(); ctx.arc(c,c,26,-thA,-thG,t.phiStar>0); ctx.stroke();
  }
  ctx.font=`500 12px 'Saira Semi Condensed', 'Arial Narrow', sans-serif`; ctx.textBaseline='middle';
  const dests=new Set(cargoOrders().map(o=>planetOfBody(bodyOf(POST_BY_ID[o.to]))));
  PLANETS.forEach(k=>{
    const [x,y]=pos(k,S.domain.day), big=k==='jupiter'||k==='saturn'?6:k==='ceres'?3.5:4.5;
    ctx.fillStyle=bodyColor(k); ctx.beginPath(); ctx.arc(x,y,big,0,TAU); ctx.fill();
    if(dests.has(k)){ ctx.strokeStyle=v('--good'); ctx.lineWidth=1.5; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.arc(x,y,big+8,0,TAU); ctx.stroke(); ctx.setLineDash([]); }
    if(isPick({type:'planet',planet:k})){ ctx.strokeStyle=v('--accent'); ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,big+13,0,TAU); ctx.stroke(); }
    const th=theta(k,S.domain.day), lx=x+Math.cos(th)*16, ly=y-Math.sin(th)*16;
    ctx.fillStyle=isPick({type:'planet',planet:k})?v('--text'):v('--muted'); ctx.textAlign=Math.cos(th)>0.3?'left':Math.cos(th)<-0.3?'right':'center';
    ctx.fillText(B[k].name,lx,ly);
    HITS.push({canvas:cv,x,y,r:24,pick:{type:'planet',planet:k}});
    const ms=moonsOf(k); ctx.fillStyle=v('--muted');
    ms.forEach((m,i)=>{ const a=moonAngle(m,S.domain.day), r=big+4+i*2.5; ctx.beginPath(); ctx.arc(x+r*Math.cos(a), y-r*Math.sin(a), 1.3,0,TAU); ctx.fill(); });
  });
  if(S.action.transit){
    const T=S.action.transit, rA=rOf(B[T.a].a), rB=rOf(B[T.b].a), dth=((T.th1-T.th0)%TAU+TAU)%TAU;
    const conic=transferConic(rA,rB,dth);
    const pt=(s:number)=>{ const q=conic.at(s), th=T.th0+q.th; return [c+q.r*Math.cos(th), c-q.r*Math.sin(th)]; };
    ctx.strokeStyle=v('--accent'); ctx.setLineDash([3,4]); ctx.lineWidth=1.5; ctx.beginPath();
    for(let i=0;i<=96;i++){const [x,y]=conic.geo(i/96).map((z:number,j:number)=>z); const th=T.th0+y; const X=c+x*Math.cos(th), Y=c-x*Math.sin(th); i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);} ctx.stroke(); ctx.setLineDash([]);
    const p=Math.min(1,Math.max(0,(S.domain.day-T.dep)/(T.arr-T.dep))), [x,y]=pt(p), [x2,y2]=pt(Math.min(1,p+0.01));
// burning at departure (prograde) and on arrival (braking), with the rocket turning beforehand
    const bAt=(q:number)=>q<0.04?'pro':q>0.955?'retro':null;
    drawRocket(ctx,'sol',x,y,Math.atan2(-(y2-y),x2-x),bAt(p),bAt(Math.min(1,p+0.05)),null,v('--accent'));
  } else if(S.domain.node){
    const k=homePlanet(), [x,y]=pos(k,S.domain.day), th=theta(k,S.domain.day), off=k==='jupiter'||k==='saturn'?18:13;
    drawRocket(ctx,'solpark',x-Math.sin(th)*off, y-Math.cos(th)*off, th+Math.PI/2, null,null,null, v('--accent'));
  }
}

function drawSys(p:string){
  const ms=moonsOf(p), [W,H]=fitCanvas(sc,1.6); if(W<60||H<30) return;
  if(!GL.on) return glNote(sc,sctx,W,H);
  prep(sc,sctx,W,H);
  const g=sctx, v=cssVar(), cx=W/2, cy=H/2+6, ce=Math.cos(SYS_EL), se=Math.sin(SYS_EL);
// three.js draws the planet, its moons and Saturn's ring; the maths here is in pixels (scale 1).
  glBegin(W,H,cx,cy,1,SYS_EL); prepBack(W,H);
  const gb = bctx; // hidden parts belong behind the sphere
  const rH=Math.min(W/2-34, (H/2-26)/se), rMax=rH*0.82, Rp=Math.max(13,Math.min(22,W*0.028)), rLow=Rp+11, rMin=rLow+22, rMo=10;
  const lo=Math.log(Math.min(...ms.map(m=>M[m].rv))), hi=Math.log(Math.max(...ms.map(m=>M[m].rv)));
  const rOf=(m:string)=> ms.length===1 ? rMax*0.7 : rMin+(rMax-rMin)*(Math.log(M[m].rv)-lo)/(hi-lo);
  const P=(q:Vec3)=>{ const y2=q[1]*ce-q[2]*se, z2=q[1]*se+q[2]*ce; return {x:cx+q[0], y:cy-y2, z:z2, hidden:z2<0 && Math.hypot(q[0],y2)<Rp}; };
  const moonW=(m:string,day:number)=>ringPt(rOf(m),moonAngle(m,day));
  const [k,l]=here(), mine=homePlanet()===p && !S.action.transit, st=sysState(p);
  const font=(w:number, sz:number)=>g.font=`${w} ${sz}px 'Saira Semi Condensed','Arial Narrow',sans-serif`;
  const back:Function[]=[], front:Function[]=[];
// orbits in the 3D layer, in pixels including depth: planet and rocket hide them correctly
  const poly=(key:string,pts:Vec3[],style:{col:string;[k:string]:any})=>glPath(key,pts.map(P),style);
  const circle=(r:number)=>{ const a:Vec3[]=[]; for(let j=0;j<=120;j++) a.push(ringPt(r,j/120*TAU)); return a; };
  poly('hoch',circle(rH),{col:v('--line'),w:1.5,dash:[6,5]});
  ms.forEach(m=>poly('mond:'+m,circle(rOf(m)),{col:v('--orbit'),w:1}));
  poly('niedrig',circle(rLow),{col:v('--line'),w:1.5});

// position of the ship for a given state
  const shipW=(node:string):Vec3|null=>{ const [b,ll]=node.split('.');
    if(M[b]){ const c=moonW(b,S.domain.day); return ll==='surf' ? ([c[0],c[1]+7,c[2]] as Vec3) : vadd(c,ringPt(rMo,st.moonU)); }
    if(b!==p) return null;
    return ll==='capt'?ringPt(rH,st.capU):ll==='orbit'?ringPt(rLow,st.lowU):([0,Rp+5,0] as Vec3); };
// path of a manoeuvre: position at fraction t
  let path:((t:number)=>{q:Vec3; burn?:string|null; glow?:boolean})|null=null;
  if(mine && S.render.move && S.render.move.sys){
    const pl=S.render.move.sys, move=S.render.move;
    const hoh=(rp:number,ra:number)=>{ const a=(rp+ra)/2, e=(ra-rp)/(ra+rp); return {a,e,r:(nu:number)=>a*(1-e*e)/(1+e*Math.cos(nu))}; };
    if(pl.kind==='toMoon'){ const E=hoh(rOf(pl.m),rH), aDep=pl.aArr-Math.PI, da=((aDep-pl.p0)%TAU+TAU)%TAU;
      path=(t)=>{ if(t<0.25) return {q:ringPt(rH,pl.p0+da*t/0.25)};
        if(t<0.92){ const s=(t-0.25)/0.67, nu=keplerNu(Math.PI+Math.PI*s,E.e); return {q:ringPt(E.r(nu),pl.aArr-TAU+nu), burn:s<0.06?'retro':null}; }
        const s=(t-0.92)/0.08, a=ringPt(rOf(pl.m),pl.aArr), b=vadd(moonW(pl.m,move.d1),ringPt(rMo,pl.final.moonU)); return {q:vadd(vmul(a,1-s),vmul(b,s)), burn:'retro'}; }; }
    if(pl.kind==='fromMoon'){ const E=hoh(rOf(pl.m),rH);
       path=(t)=>{ if(t<0.08){ const s=t/0.08, a=vadd(moonW(pl.m,move.d0),ringPt(rMo,pl.m0)), b=ringPt(rOf(pl.m),pl.aDep); return {q:vadd(vmul(a,1-s),vmul(b,s)), burn:'pro'}; }
        const s=(t-0.08)/0.92, nu=keplerNu(Math.PI*s,E.e); return {q:ringPt(E.r(nu),pl.aDep+nu), burn:s>0.95?'pro':null}; }; }
    if(pl.kind==='raise'){ const E=hoh(rLow,rH); path=(t)=>{ const nu=keplerNu(Math.PI*t,E.e); return {q:ringPt(E.r(nu),pl.u0+nu), burn:(t<0.05||t>0.95)?'pro':null}; }; }
    if(pl.kind==='lower' && !pl.aero){ const E=hoh(rLow,rH); path=(t)=>{ const nu=keplerNu(Math.PI+Math.PI*t,E.e); return {q:ringPt(E.r(nu),pl.u0+nu-Math.PI), burn:(t<0.05||t>0.95)?'retro':null}; }; }
    if(pl.kind==='lower' && pl.aero){ // aerobraking: many passes through the upper atmosphere, the ellipse shrinks
      path=(t)=>{ const th=pl.th*t, ra=rH+(rLow-rH)*Math.min(1,t*1.05), rp=rLow*0.97, a=(rp+ra)/2, e=(ra-rp)/(ra+rp), nu=th+Math.PI;
        const r=a*(1-e*e)/(1+e*Math.cos(nu)); return {q:ringPt(r,pl.u0+th), glow:hasAtm(p) && r<rLow*1.08 && t<0.97}; }; }
  }
  let ship:any=null;
  if(mine && S.domain.node){
    if(path){ const t=moveProg(), c=path(t), a=P(path(Math.max(0,t-0.01)).q), b=P(path(Math.min(1,t+0.01)).q);
      const tr:Vec3[]=[]; for(let j=0;j<=120;j++) tr.push(path(j/120).q); poly('spur',tr,{col:v('--accent'),w:1.4,dash:[3,4],a:0.6,ghost:0.4});
      ship={pt:P(c.q), dir:[b.x-a.x,b.y-a.y], burn:c.burn, glow:c.glow, soon:path(Math.min(1,t+0.06)).burn}; }
    else { const w=shipW(S.render.move?S.render.move.from.node:S.domain.node); if(w){ const nd=S.domain.node.split('.')[1]; let dir=[1,0];
        if(!S.render.move && nd!=='surf'){ const [bb]=S.domain.node.split('.'); const base:Vec3=M[bb]?moonW(bb,S.domain.day):[0,0,0], rr=M[bb]?rMo:(nd==='capt'?rH:rLow), uu=M[bb]?st.moonU:(nd==='capt'?st.capU:st.lowU);
          const a=P(vadd(base,ringPt(rr,uu-0.05))), c=P(vadd(base,ringPt(rr,uu+0.05))); dir=[c.x-a.x,c.y-a.y]; }
        if(nd==='surf') dir=[0,-1];
        ship={pt:P(w), dir, up:nd==='surf'}; } }
  }
  if(ship){ const s=ship, hid=s.pt.hidden, c=hid?gb:g; (hid?back:front).push(()=>{ const dl=Math.hypot(...s.dir)||1, ux=s.dir[0]/dl, uy=s.dir[1]/dl;
      if(s.glow){ const gr=c.createRadialGradient(s.pt.x,s.pt.y,0,s.pt.x,s.pt.y,12); gr.addColorStop(0,'rgba(255,190,120,0.9)'); gr.addColorStop(1,'rgba(255,120,40,0)'); c.fillStyle=gr; c.beginPath(); c.arc(s.pt.x,s.pt.y,12,0,TAU); c.fill(); }
// real depth: the planet hides the rocket by itself. Standing on a moon it has to be in front.
      const va=Math.atan2(-uy,ux), z=s.pt.z+(s.up?RKT_LEN*0.6:0);
      if(s.up) drawRocket(c,'sys',s.pt.x,s.pt.y,va,null,null,{mode:'up',up:Math.PI/2},v('--accent'),z);
      else drawRocket(c,'sys',s.pt.x,s.pt.y,va,s.burn,s.soon,null,v('--accent'),z); }); }

// moons as small spheres, behind or in front
  const drawMoon=(m:string,w:CanvasRenderingContext2D)=>{ const c=P(moonW(m,S.domain.day)), x=c.x, y=c.y, pk={type:'body',body:m}, sel=isPick(pk);
    glPut(m, moonW(m,S.domain.day), 5.5);
    if(hasDepot(m)){ w.fillStyle=v('--good'); w.beginPath(); w.arc(x+7,y-6,2.5,0,TAU); w.fill(); }
    if(cargoTo(kk=>bodyOf(kk)===m).length){ w.strokeStyle=v('--good'); w.lineWidth=1.5; w.setLineDash([3,3]); w.beginPath(); w.arc(x,y,11,0,TAU); w.stroke(); w.setLineDash([]); }
    if(sel){ w.strokeStyle=v('--accent'); w.lineWidth=2; w.beginPath(); w.arc(x,y,15,0,TAU); w.stroke(); }
    font(sel?600:500,12); w.fillStyle=sel?v('--text'):'#c9cee0'; w.textAlign='center'; w.textBaseline='bottom'; w.shadowColor='rgba(0,0,0,0.9)'; w.shadowBlur=3; w.fillText(M[m].name,x,y-12); w.shadowBlur=0;
    HITS.push({canvas:sc,x,y,r:22,pick:pk}); };
  ms.forEach(m=>{ const c=P(moonW(m,S.domain.day)); const hid=c.z<0; (hid?back:front).push(()=>drawMoon(m,hid?gb:g)); });
  // Order: far side, the ring behind (Saturn), the planet, the near side
  back.forEach(f=>f());
  glPut(p,null,Rp);
  // The ring lies in the equatorial plane. The drawing reaches the edge of the image, so half the
  // edge length is the outer ring radius; inside it stays transparent.
  if(p==='saturn'){ const rg=glSaturnRing(); rg.visible=true; rg.scale.set(Rp*2.24,Rp*2.24,1); }
  const pp={type:'body',body:p};
  if(cargoTo(kk=>bodyOf(kk)===p && kk.node!==p+'.capt' && kk.node!==p+'.orbit').length){ g.strokeStyle=v('--good'); g.lineWidth=1.5; g.setLineDash([3,3]); g.beginPath(); g.arc(cx,cy,Rp+5,0,TAU); g.stroke(); g.setLineDash([]); }
  if(isPick(pp)){ g.strokeStyle=v('--accent'); g.lineWidth=2; g.beginPath(); g.arc(cx,cy,Rp+7,0,TAU); g.stroke(); }
  HITS.push({canvas:sc,x:cx,y:cy,r:Rp+3,pick:pp});
  front.forEach(f=>f());
  // Bahnmarkierungen
  const nodeMark=(q:Vec3,node:string,label:string,align:CanvasTextAlign)=>{ const c=P(q), x=c.x, y=c.y, pk={type:'node',node}, sel=isPick(pk), here_=mine&&S.domain.node===node;
    g.fillStyle=v('--bg'); g.strokeStyle=sel?v('--accent'):v('--text'); g.lineWidth=sel?2.5:1.5; g.beginPath(); g.arc(x,y,6,0,TAU); g.fill(); g.stroke();
    if(cargoTo(kk=>kk.node===node).length){ g.strokeStyle=v('--good'); g.lineWidth=1.5; g.setLineDash([3,3]); g.beginPath(); g.arc(x,y,12,0,TAU); g.stroke(); g.setLineDash([]); }
    if(fuelHere(node,null)){ g.fillStyle=v('--good'); g.beginPath(); g.arc(x+6,y-7,3,0,TAU); g.fill(); }
    font(here_||sel?600:500,12); g.fillStyle=sel?v('--text'):'#c9cee0'; g.textAlign=align; g.textBaseline='middle'; g.shadowColor='rgba(0,0,0,0.9)'; g.shadowBlur=3; g.fillText(label,x+(align==='left'?11:-11),y); g.shadowBlur=0;
    HITS.push({canvas:sc,x,y,r:22,pick:pk}); };
  nodeMark(ringPt(rLow,0),p+'.orbit','Low orbit','left');
  nodeMark(ringPt(rH,-0.75),p+'.capt','High orbit','left');
  glEnd();
}

function drawBody(b:string){
  const [W]=fitCanvas(cv,1); if(W<60) return;
  if(!GL.on) return glNote(cv,ctx,W,W);
  prep(cv,ctx,W,W);
  const g=ctx, v=cssVar(), cx=W/2, cy=W/2+4, R=W*0.3, cam=makeCam(cx,cy,R,bodyView(b).el);
// three.js takes care of the sphere; the same camera, R pixels per body radius
  glBegin(W,W,cx,cy,R,bodyView(b).el); prepBack(W,W);
  const gb = bctx; // hidden parts belong behind the sphere
  glPut(b,null,1);
  const [k,l]=here(), mine=k===b && !S.action.transit;
  const font=(w:number, sz:number)=>g.font=`${w} ${sz}px 'Saira Semi Condensed','Arial Narrow',sans-serif`;
  const back:Function[]=[], front:Function[]=[]; // drawing jobs behind and in front of the body
  const P=(p:Vec3)=>cam.proj(p);
  // A rocket standing on the visible side must not be cut by the sphere anywhere, so it goes in
  // front of the whole sphere. Taking the surface depth at its foot point is not enough: the
  // sphere curves across the width of the rocket and would hide its inner half.
  const zPad = R + RKT_LEN;
// the orbit ring as a polyline, split into hidden and visible pieces
// the orbit ring in the 3D layer: depth in pixels, so body and rocket hide it correctly
  const ring=(key:string, fn:(u:number)=>Vec3, style:{col:string;[k:string]:any})=>{ const pts=[]; for(let j=0;j<=96;j++){ const q=P(fn(j/96*TAU)); pts.push({x:q.x,y:q.y,z:q.z*R}); }
    glPath(key,pts,style); };
// high orbit only for planets without moons (otherwise it lives in the system view)
  const showHigh = B[b] && !moonsOf(b).length;
  if(showHigh) ring('hoch',u=>orbitPos(b,defaultOrb(b),u,R_HIGH),{col:v('--line'),w:1.2,dash:[6,6]});
  const orb=shipOrb(b);
  ring('niedrig',u=>orbitPos(b,orb,u,R_ORB),{col:v('--line'),w:1.5,dash:[6,5]});

// path and ship
  let shipAt:Vec3|null=null, shipDir:[number,number]|null=null, burn:string|null=null, glow=false, fade=1, soon:string|null=null, att:{mode:string;up:number}|null=null;
  if(mine && S.render.move && S.render.move.path && S.render.move.path.b===b){
    const pa=S.render.move.path, t=moveProg(), q=pa.at(t), q2=pa.at(Math.min(1,t+0.01)), q1=pa.at(Math.max(0,t-0.01));
    const trail=[]; for(let j=0;j<=80;j++){ const q=P(pa.at(j/80).p); trail.push({x:q.x,y:q.y,z:q.z*R}); }
    glPath('spur',trail,{col:v('--accent'),w:1.4,dash:[3,4],a:0.6,ghost:0.4});
    shipAt=q.p; const a=P(q1.p), c=P(q2.p); shipDir=[c.x-a.x, c.y-a.y]; burn=q.burn; glow=!!q.glow; if(pa.fade) fade=Math.max(0,1-t*1.2);
    soon=pa.at(Math.min(1,t+0.06)).burn; att=q.att?{mode:q.att as string,up:0}:null;
  } else if(mine && l==='orbit'){
    shipAt=orbitPos(b,orb,orb.u,R_ORB); const a=P(orbitPos(b,orb,orb.u-0.02,R_ORB)), c=P(orbitPos(b,orb,orb.u+0.02,R_ORB)); shipDir=[c.x-a.x,c.y-a.y];
  }
  let shipLast:Function|null=null;
  if(shipAt){
    const sp=P(shipAt);
// close to the surface the rocket stands on the site (as when landed), not in the middle of the marker
    let shipZ=sp.z*R;
    { const rr=Math.hypot(...shipAt), kk=Math.max(0,Math.min(1,1-(rr-1)/0.07)); if(kk>0){ const dx=sp.x-cx, dy=sp.y-cy, n=Math.hypot(dx,dy); const ux=n>8?dx/n:0, uy=n>8?dy/n:-1;
      sp.x+=ux*17*kk; sp.y+=uy*17*kk; shipZ=shipZ+kk*(zPad-shipZ); } } // eased forward on touchdown
// when hidden only the rear layer draws it (and three.js leaves the rocket out), otherwise the front one.
    const drawShip=(c:CanvasRenderingContext2D)=>{ const ang=Math.atan2(-shipDir![1],shipDir![0]);
      c.globalAlpha=fade;
      if(glow){ const gr=c.createRadialGradient(sp.x,sp.y,0,sp.x,sp.y,14); gr.addColorStop(0,'rgba(255,190,120,0.9)'); gr.addColorStop(1,'rgba(255,120,40,0)'); c.fillStyle=gr; c.beginPath(); c.arc(sp.x,sp.y,14,0,TAU); c.fill(); }
      drawRocket(c,'body',sp.x,sp.y,ang,burn,soon,att,v('--accent'),shipZ,fade);
      c.globalAlpha=1; };
// The flame stays 2D: on the rear layer when hidden, otherwise on the front one.
    if(sp.hidden) back.push(()=>drawShip(gb)); else shipLast=()=>drawShip(g);
  }

// --- what is behind, then the body, then what is in front
  back.forEach(f=>f());
  // Sphere, surface, terminator and limb darkening all come from the 3D layer.
  // Only the grid is left here, clipped to the sphere.
  g.save(); g.beginPath(); g.arc(cx,cy,R,0,TAU); g.clip();
// grid: parallels and meridians (front side only)
  const line=(fn:(s:number)=>Vec3,n:number,style:{col:string; w?:number; dash?:number[]})=>{ g.strokeStyle=style.col; g.lineWidth=style.w||1; g.setLineDash(style.dash||[]); g.beginPath(); let on=false;
    for(let j=0;j<=n;j++){ const p=cam.proj(fn(j/n)); if(p.z>=0){ on?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y); on=true; } else on=false; } g.stroke(); g.setLineDash([]); };
  [-60,-30,30,60].forEach(lat=>line(s=>bvec(b,lat,s*360),90,{col:'rgba(255,240,230,0.22)'}));
  line(s=>bvec(b,0,s*360),120,{col:'rgba(255,240,230,0.6)',w:1.2,dash:[5,4]});
  for(let lon=-180;lon<180;lon+=30) line(s=>bvec(b,-90+180*s,lon),40,{col:'rgba(255,240,230,0.12)'});
  g.restore();
  // Latitude labels along the visible right-hand edge
  font(500,11); g.fillStyle=v('--muted'); g.textAlign='left'; g.textBaseline='middle';
  [[60,'60° N'],[30,'30° N'],[0,'0°'],[-30,'30° S'],[-60,'60° S']].forEach(([lat,t])=>{ let bx:Record<string,any>|null=null;
    for(let d=0;d<=180;d+=3){ const p=cam.proj(bvec(b,lat as number,bodyLon0(b)+d)); if(p.z>=0 && (!bx||p.x>bx.x)) bx=p; }
    if(bx && bx.x>cx+R*0.35) g.fillText(t as string,bx.x+6,bx.y); });
  front.forEach(f=>f());

  // Orbit markers
  const marker=(p:Record<string,any>,node:string,label:string,al:CanvasTextAlign)=>{ const pk={type:'node',node}, sel=isPick(pk);
    g.fillStyle=v('--bg'); g.strokeStyle=sel?v('--accent'):v('--text'); g.lineWidth=sel?2.5:1.5; g.beginPath(); g.arc(p.x,p.y,6,0,TAU); g.fill(); g.stroke();
    if(cargoTo(kk=>kk.node===node).length){ g.strokeStyle=v('--good'); g.lineWidth=1.5; g.setLineDash([3,3]); g.beginPath(); g.arc(p.x,p.y,12,0,TAU); g.stroke(); g.setLineDash([]); }
    if(fuelHere(node,null)){ g.fillStyle=v('--good'); g.beginPath(); g.arc(p.x+6,p.y-7,3,0,TAU); g.fill(); }
    font(sel?600:500,12); g.fillStyle=sel?v('--text'):'#c9cee0'; g.textAlign=al; g.textBaseline='middle';
    g.shadowColor='rgba(0,0,0,0.9)'; g.shadowBlur=4; g.fillText(label,p.x+(al==='left'?11:-11),p.y); g.shadowBlur=0;
    HITS.push({canvas:cv,x:p.x,y:p.y,r:22,pick:pk}); };
// rightmost visible point of the orbit, for the marker
  const frontOf=(o:Record<string,any>,r:number)=>{ let best:Record<string,any>|null=null; for(let j=0;j<72;j++){ const p=P(orbitPos(b,o,j/72*TAU,r)); if(p.z<0) continue; if(!best||p.x>best.x) best=p; } return best; };
  marker(frontOf(orb,R_ORB)!,b+'.orbit','Low orbit','left');
  if(showHigh){ const hp=P(orbitPos(b,defaultOrb(b),40*D2R,R_HIGH)); if(hp) marker(hp,b+'.capt','High orbit','left'); }

// landing sites (faded on the far side, still tappable)
  (SITES[b]||[]).forEach(st=>{
    const p=P(bvec(b,st.lat,st.lon)), x=p.x, y=p.y, hid=p.z<0;
    const pk={type:'node',node:b+'.surf',site:st.id}, sel=isPick(pk), kon=POSTS.find(kk=>kk.node===b+'.surf' && (!kk.site||kk.site===st.id));
    g.globalAlpha=hid?0.45:1;
    if(cargoTo(kkk=>!!kon && kkk.id===kon.id).length){ g.strokeStyle=v('--good'); g.lineWidth=1.5; g.setLineDash([3,3]); g.beginPath(); g.arc(x,y,12,0,TAU); g.stroke(); g.setLineDash([]); }
    if(sel){ g.strokeStyle=v('--accent'); g.lineWidth=2.5; g.beginPath(); g.arc(x,y,17,0,TAU); g.stroke(); }
    g.fillStyle=v('--bg'); g.strokeStyle=kon?v('--text'):'rgba(231,233,242,0.6)'; g.lineWidth=2; if(hid) g.setLineDash([2,2]);
    g.beginPath(); g.arc(x,y,kon?6:4.5,0,TAU); g.fill(); g.stroke(); g.setLineDash([]);
    if(st.depot){ g.fillStyle=v('--good'); g.beginPath(); g.arc(x+8,y-8,3,0,TAU); g.fill(); }
    font(600,12);
    const name=st.name+(hid?' (far side)':''), tw=g.measureText(name).width; let left=x<cx;
    if(left && x-10-tw<2) left=false; else if(!left && x+10+tw>W-2) left=true;
    g.fillStyle=hid?'rgba(231,233,242,0.8)':'#ffffff'; g.textAlign=left?'right':'left'; g.textBaseline='middle';
    g.shadowColor='rgba(0,0,0,0.8)'; g.shadowBlur=3; g.fillText(name,x+(left?-10:10),y); g.shadowBlur=0; g.globalAlpha=1;
    HITS.push({canvas:cv,x,y,r:22,pick:pk});
// a landed ship: upright, pointing away from the body
    if(mine && !S.render.move && l==='surf' && S.domain.site===st.id){ const dx=x-cx, dy=y-cy, n=Math.hypot(dx,dy); const ux=n>8?dx/n:0, uy=n>8?dy/n:-1;
      g.globalAlpha=hid?0.5:1; const up=Math.atan2(-uy,ux);
      setRocketMode(hid ? 'flat' : 'gl'); // faded on the far side but still visible, like the marker itself
      drawRocket(g,'body',x+ux*17,y+uy*17,up,null,null,{mode:'up',up},v('--accent'),zPad);
      setRocketMode('gl'); g.globalAlpha=1; }
  });
  if(shipLast) shipLast();
  glEnd();
}

// a ship in orbit keeps circling slowly (display only)
let idleT=0;

export function idleLoop(ts:number){
  requestAnimationFrame(idleLoop);
  if(reduce || !S || S.action.busy || document.hidden || ts-idleT<40){ if(ts-idleT>=40) idleT=ts; return; }
  const dt=Math.min(0.1,(ts-idleT)/1000); idleT=ts;
  if(!S.domain.node || $('stage')!.clientWidth<1) return;
  const vw=mapView(), [b,nd]=S.domain.node.split('.');
// system view: keep circling in low orbit, at a moon, or in high orbit
  if(vw.level==='sys' && !sc.hidden && vw.planet===planetOfBody(b) && nd!=='surf'){
    const st=sysState(vw.planet); if(M[b]) st.moonU+=dt*1.4; else if(nd==='orbit') st.lowU+=dt*0.5; else st.capU+=dt*0.04;
    clearHits(sc); drawSys(vw.planet); return; }
  if(nd!=='orbit' || cv.hidden) return;
  if(vw.level!=='body' || vw.body!==b) return;
  if(!S.render.orb || S.render.orb.body!==b) S.render.orb=defaultOrb(b) as unknown as {body:string;u:number;[k:string]:any};
  S.render.orb!.u=(S.render.orb!.u+dt*0.35)%TAU; clearHits(cv); drawBody(b);
}

export function wireDraw(){
  window.addEventListener('resize',draw);
  new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
}
