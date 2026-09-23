// Orbital mechanics: circular orbits, escape velocity, Hohmann transfers, ballistic hops.

import { TAU, wrap } from '../basics.js';
import { AU, B, BODIES, BodyId, M, MU_SUN, PlanetId, hasAtm, isMoon, launcherAt, siteOf } from './world.js';

// Circular orbital speed at the surface in m/s (moons: approximate)
const VSURF: Partial<Record<BodyId, number>> = {mercury:3005, venus:7326, earth:7910, mars:3555, ceres:365, moon:1680, phobos:8, deimos:4,
  io:1810, europa:1430, ganymede:1950, callisto:1730, enceladus:170, titan:1870};

// Surface to low orbit and back; a body without a surface cannot be reached at all
export const bodyUp = (b: BodyId): number => isMoon(b) ? M[b].up : B[b].surf?.up ?? Infinity;

export const bodyDown = (b: BodyId): number => isMoon(b) ? M[b].down : B[b].surf?.down ?? Infinity;

// Central angle between two landing sites (great circle)
function siteAngle(b: BodyId, s1: string|null, s2: string|null): number{
  const a=siteOf(b,s1), c=siteOf(b,s2); if(!a||!c) return Math.PI;
  const r=Math.PI/180, f1=a.lat*r, f2=c.lat*r, dl=((a.lon||0)-(c.lon||0))*r;
  return Math.acos(Math.max(-1,Math.min(1,Math.sin(f1)*Math.sin(f2)+Math.cos(f1)*Math.cos(f2)*Math.cos(dl))));
}

// Minimum-energy ballistic path over the central angle th: v^2 = vs^2 * 2 sin(th/2) / (1 + sin(th/2)).
// Without an atmosphere, lifting off and slowing down cost v each. With one, launch losses scale like an
// ascent, but the air helps on the way down. On Earth a small launcher flies the hop.
export function hopCost(b: BodyId, s1: string|null, s2: string|null): {dv:number; days:number; th:number; launcher:boolean}{
  const th=siteAngle(b,s1,s2), vs=VSURF[b]||1000, x=Math.sin(th/2), launcher=launcherAt(b);
  const v=vs*Math.sqrt(2*x/(1+x)), f=v/vs;
  const full=bodyUp(b)+bodyDown(b);
  let dv;
  if(!hasAtm(b)) dv=2*v*1.03;
  else if(launcher) dv=bodyDown(b);
  else dv=v+Math.max(0,bodyUp(b)-vs)*f+bodyDown(b)*f;
  dv=Math.min(dv, 0.9*full);
  const days=Math.max(0.05, th/Math.PI*0.25);
  return {dv, days, th, launcher};
}

export const HOP_FEE_SHARE = 0.4; // share of the launch fee for a suborbital flight on Earth

export const theta = (k: PlanetId, day: number): number => BODIES[k].meanLongitude*Math.PI/180 + TAU*day/BODIES[k].period;

const nn = (k: PlanetId): number => TAU/BODIES[k].period;

const vc = (k: PlanetId): number => { const b=BODIES[k]; return Math.sqrt(b.gravity/(b.radius+b.lowOrbitAltitude)); };   // km/s

const vesc = (k: PlanetId): number => Math.SQRT2*vc(k);

export const captDv = (k: PlanetId): number => (0.98*vesc(k)-vc(k))*1000;            // high <-> low orbit, m/s

const hyp = (k: PlanetId, vinf: number): number => (Math.sqrt(vinf*vinf+vesc(k)**2)-0.98*vesc(k))*1000; // burn at periapsis (Oberth)

export function transfer(a: PlanetId, b: PlanetId, day: number): {dep:number; arr:number; total:number; tof:number; d:number; wait:number; phiStar:number}{
  const r1=BODIES[a].orbitRadius*AU, r2=BODIES[b].orbitRadius*AU, at=(r1+r2)/2;
  const v1=Math.sqrt(MU_SUN/r1), v2=Math.sqrt(MU_SUN/r2);
  const vp=Math.sqrt(MU_SUN*(2/r1-1/at)), va=Math.sqrt(MU_SUN*(2/r2-1/at));
  const vi1=Math.abs(vp-v1), vi2=Math.abs(v2-va);
  const tH=Math.PI*Math.sqrt(at**3/MU_SUN)/86400;
  const phiStar=wrap(Math.PI-nn(b)*tH);                 // ideal phase angle
  const phi=wrap(theta(b,day)-theta(a,day));             // current phase angle
  const d=Math.abs(wrap(phi-phiStar))/Math.PI;           // 0 = perfect, 1 = as far off as it gets
  const f=1+2.2*Math.pow(d,1.5);                         // penalty on the excess velocity
  const dep=hyp(a,vi1*f), arr=hyp(b,vi2*f);
  const tof=tH*(1-0.3*d);
  const rel=nn(b)-nn(a), syn=TAU/Math.abs(rel);
  let w=wrap(phiStar-phi)/rel; w=((w%syn)+syn)%syn;
  return {dep,arr,total:dep+arr,tof,d,wait:w,phiStar};
}

// Transfer path as a conic around the Sun through departure (radius r1) and target (r2) over the angle dth.
// Outbound: perihelion at departure; inbound: aphelion at departure (for dth = 180° exactly the Hohmann case).
// Timing follows Kepler: equal areas in equal times, so fast near the Sun and slow far out.
export function transferConic(r1:number, r2:number, dth:number){
  const out=r2>=r1;
  let e = out ? (r2-r1)/(r1-r2*Math.cos(dth)) : (r1-r2)/(r1-r2*Math.cos(dth));
  // a valid ellipse needs 0 <= e < 1 and dth clearly > 0; otherwise fall back to a soft blend
  const ok = isFinite(e) && e>=0 && e<0.97 && dth>0.2;
  if(!ok){ const f=(s:number)=>({r:r1+(r2-r1)*(0.5-0.5*Math.cos(Math.PI*s)), th:dth*s}); return {at:f, geo:(s:number):[number,number]=>{const q=f(s); return [q.r,q.th];}}; }
  const p = out ? r1*(1+e) : r1*(1-e);
  const nu0 = out ? 0 : Math.PI, nu1 = nu0+dth;
  const rOfNu = (nu:number) => p/(1+e*Math.cos(nu));
  const Mof = (nu:number) => { const E=2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2), Math.sqrt(1+e)*Math.cos(nu/2)); return E-e*Math.sin(E); };
  // keep the mean anomaly continuous (past 2*pi)
  const unwrap=(m:number, ref:number)=>{ while(m<ref-1e-9) m+=TAU; return m; };
  const M0=Mof(nu0), M1=unwrap(Mof(nu1),M0);
  const at=(s:number)=>{ const Mt=M0+(M1-M0)*s; const nu=keplerNu(Mt,e); let d=((nu-nu0)%TAU+TAU)%TAU; if(s>0.999) d=dth; return {r:rOfNu(nu0+d), th:d}; };
  return {at, geo:(s:number):[number,number]=>{ const nu=nu0+dth*s; return [rOfNu(nu), dth*s]; }};
}

// Kepler: eccentric anomaly from the mean one, then the true anomaly
export function keplerNu(mid:number, e:number): number{ let E=mid; for(let k=0;k<8;k++) E-= (E-e*Math.sin(E)-mid)/(1-e*Math.cos(E)); return 2*Math.atan2(Math.sqrt(1+e)*Math.sin(E/2), Math.sqrt(1-e)*Math.cos(E/2)); }
