// Bahnmechanik: Kreisbahn, Fluchtgeschwindigkeit, Hohmann-Transfer, ballistische Huepfer.

import { TAU, wrap } from '../basis.js';
import { AU, B, M, MU_SUN, hasAtm, siteOf } from './welt.js';

// Kreisbahngeschwindigkeit an der Oberfläche in m/s (Monde: Näherungswerte)
const VSURF = {mercury:3005, venus:7326, earth:7910, mars:3555, ceres:365, moon:1680, phobos:8, deimos:4,
  io:1810, europa:1430, ganymede:1950, callisto:1730, enceladus:170, titan:1870};

export const bodyUp = b => M[b] ? M[b].up : B[b].surf.up;

export const bodyDown = b => M[b] ? M[b].down : B[b].surf.down;

// Zentriwinkel zwischen zwei Landeplätzen (Großkreis)
function siteAngle(b,s1,s2){
  const a=siteOf(b,s1), c=siteOf(b,s2); if(!a||!c) return Math.PI;
  const r=Math.PI/180, f1=a.lat*r, f2=c.lat*r, dl=((a.lon||0)-(c.lon||0))*r;
  return Math.acos(Math.max(-1,Math.min(1,Math.sin(f1)*Math.sin(f2)+Math.cos(f1)*Math.cos(f2)*Math.cos(dl))));
}

// Energieärmste ballistische Bahn über den Zentriwinkel th: v² = vs² · 2 sin(th/2) / (1 + sin(th/2)).
// Ohne Atmosphäre: Abheben und Abbremsen kosten je v. Mit Atmosphäre: Verluste beim Start wie beim Aufstieg anteilig,
// dafür bremst die Luft bei der Landung mit. Auf der Erde übernimmt eine kleine Trägerrakete den Hüpfer.
export function hopCost(b,s1,s2){
  const th=siteAngle(b,s1,s2), vs=VSURF[b]||1000, x=Math.sin(th/2);
  const v=vs*Math.sqrt(2*x/(1+x)), f=v/vs;
  const full=bodyUp(b)+bodyDown(b);
  let dv;
  if(!hasAtm(b)) dv=2*v*1.03;
  else if(B[b]&&B[b].surf&&B[b].surf.launcher) dv=bodyDown(b);
  else dv=v+Math.max(0,bodyUp(b)-vs)*f+bodyDown(b)*f;
  dv=Math.min(dv, 0.9*full);
  const days=Math.max(0.05, th/Math.PI*0.25);
  return {dv, days, th, launcher:!!(B[b]&&B[b].surf&&B[b].surf.launcher)};
}

export const HOP_FEE_SHARE = 0.4; // Anteil der Startgebühr für einen suborbitalen Flug auf der Erde

export const theta = (k,day) => B[k].L0*Math.PI/180 + TAU*day/B[k].T;

const nn = k => TAU/B[k].T;

const vc = k => Math.sqrt(B[k].mu/(B[k].R+B[k].alt));   // km/s

const vesc = k => Math.SQRT2*vc(k);

export const captDv = k => (0.98*vesc(k)-vc(k))*1000;            // hoher ↔ niedriger Orbit, m/s

const hyp = (k,vinf) => (Math.sqrt(vinf*vinf+vesc(k)**2)-0.98*vesc(k))*1000; // Brennen am Periapsis (Oberth)

export function transfer(a,b,day){
  const r1=B[a].a*AU, r2=B[b].a*AU, at=(r1+r2)/2;
  const v1=Math.sqrt(MU_SUN/r1), v2=Math.sqrt(MU_SUN/r2);
  const vp=Math.sqrt(MU_SUN*(2/r1-1/at)), va=Math.sqrt(MU_SUN*(2/r2-1/at));
  const vi1=Math.abs(vp-v1), vi2=Math.abs(v2-va);
  const tH=Math.PI*Math.sqrt(at**3/MU_SUN)/86400;
  const phiStar=wrap(Math.PI-nn(b)*tH);                 // idealer Phasenwinkel
  const phi=wrap(theta(b,day)-theta(a,day));             // aktueller Phasenwinkel
  const d=Math.abs(wrap(phi-phiStar))/Math.PI;           // 0 = perfekt, 1 = maximal daneben
  const f=1+2.2*Math.pow(d,1.5);                         // Strafe auf Überschussgeschwindigkeit
  const dep=hyp(a,vi1*f), arr=hyp(b,vi2*f);
  const tof=tH*(1-0.3*d);
  const rel=nn(b)-nn(a), syn=TAU/Math.abs(rel);
  let w=wrap(phiStar-phi)/rel; w=((w%syn)+syn)%syn;
  return {dep,arr,total:dep+arr,tof,d,wait:w,phiStar};
}

// Transferbahn als Kegelschnitt um die Sonne durch Start (Radius r1) und Ziel (r2) über den Winkel dth.
// Nach außen: Perihel beim Start; nach innen: Aphel beim Start (für dth = 180° genau der Hohmann-Übergang).
// Zeitlich nach Kepler: gleiche Flächen in gleichen Zeiten, also schnell nah an der Sonne, langsam weit draußen.
export function transferConic(r1,r2,dth){
  const out=r2>=r1;
  let e = out ? (r2-r1)/(r1-r2*Math.cos(dth)) : (r1-r2)/(r1-r2*Math.cos(dth));
  // gültige Ellipse nur für 0 ≤ e < 1 und dth deutlich > 0; sonst Rückfall auf weiche Überblendung
  const ok = isFinite(e) && e>=0 && e<0.97 && dth>0.2;
  if(!ok){ const f=s=>({r:r1+(r2-r1)*(0.5-0.5*Math.cos(Math.PI*s)), th:dth*s}); return {at:f, geo:s=>{const q=f(s); return [q.r,q.th];}}; }
  const p = out ? r1*(1+e) : r1*(1-e);
  const nu0 = out ? 0 : Math.PI, nu1 = nu0+dth;
  const rOfNu = nu => p/(1+e*Math.cos(nu));
  const Mof = nu => { const E=2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2), Math.sqrt(1+e)*Math.cos(nu/2)); return E-e*Math.sin(E); };
  // mittlere Anomalie stetig machen (über 2π hinaus)
  const unwrap=(m,ref)=>{ while(m<ref-1e-9) m+=TAU; return m; };
  const M0=Mof(nu0), M1=unwrap(Mof(nu1),M0);
  const at=s=>{ const Mt=M0+(M1-M0)*s; const nu=keplerNu(Mt,e); let d=((nu-nu0)%TAU+TAU)%TAU; if(s>0.999) d=dth; return {r:rOfNu(nu0+d), th:d}; };
  return {at, geo:s=>{ const nu=nu0+dth*s; return [rOfNu(nu), dth*s]; }};
}

// Kepler: exzentrische Anomalie aus mittlerer, dann wahre Anomalie
export function keplerNu(M,e){ let E=M; for(let k=0;k<8;k++) E-= (E-e*Math.sin(E)-M)/(1-e*Math.cos(E)); return 2*Math.atan2(Math.sqrt(1+e)*Math.sin(E/2), Math.sqrt(1-e)*Math.cos(E/2)); }
