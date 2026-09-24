// Orbital mechanics: circular orbits, escape velocity, transfers between planets, ballistic hops.

import { TAU, wrap } from '../basics.js';
import { AU, B, BODIES, BodyId, M, MU_SUN, PlanetId, TABLE_GRID, TransferTable, hasAtm, isMoon, launcherAt, siteOf, transferTable } from './world.js';

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

// Leaving or arriving at the low point of the high orbit: from an excess speed vinf (km/s) to the
// burn it takes (m/s), with the Oberth effect
export const vInfBurn = (k: PlanetId, vinf: number): number => (Math.sqrt(vinf*vinf+vesc(k)**2)-0.98*vesc(k))*1000;

// ── Transfers between planets ────────────────────────────────────────────────
// The orbits are circles in one plane, so a transfer is a Lambert problem between two radii. It is
// solved in the plane after Izzo (2015), which stays well-behaved at 180 degrees, the Hohmann
// case, where the classic form divides by zero.

// Gauss' hypergeometric function 2F1(3,1;5/2;z), for flight times close to parabolic
function hyperF(z:number): number{ let s=1, c=1; for(let j=0;j<200;j++){ c*=(3+j)*(1+j)/(2.5+j)*z/(j+1); s+=c; if(Math.abs(c)<1e-13) break; } return s; }

// Non-dimensional flight time of the single-revolution transfer with Izzo's x and lambda
function tofX(x:number, l:number): number{
  const d=Math.abs(x-1);
  if(d<0.2 && d>0.01){ const a=1/(1-x*x);        // Lagrange
    if(a>0){ const al=2*Math.acos(x); let be=2*Math.asin(Math.sqrt(l*l/a)); if(l<0) be=-be; return a*Math.sqrt(a)*((al-Math.sin(al))-(be-Math.sin(be)))/2; }
    const al=2*Math.acosh(x); let be=2*Math.asinh(Math.sqrt(-l*l/a)); if(l<0) be=-be; return -a*Math.sqrt(-a)*((be-Math.sinh(be))-(al-Math.sinh(al)))/2; }
  const e=x*x-1, z=Math.sqrt(1+l*l*e);
  if(d<=0.01){ const eta=z-l*x, s1=0.5*(1-l-x*eta); return (eta**3*4/3*hyperF(s1)+4*l*eta)/2; }   // Battin
  const y=Math.sqrt(Math.abs(e)), g=x*z-l*e, dd=e<0 ? Math.acos(g) : Math.log(y*(z-l*x)+g);   // Lancaster
  return (x-l*z-dd/y)/e;
}

// Excess speeds (km/s) at departure and arrival for a prograde transfer from a circular orbit of
// radius r1 to one of r2 (km), sweeping the angle dth (0 to 2 pi) in t seconds; null for no angle
export function lambert(r1:number, r2:number, dth:number, t:number): [number,number]|null{
  if(!(dth>1e-9 && dth<TAU-1e-9 && t>0)) return null;
  const c=Math.sqrt(r1*r1+r2*r2-2*r1*r2*Math.cos(dth)), s=(r1+r2+c)/2;
  let l=Math.sqrt(Math.max(0,1-c/s)); if(dth>Math.PI) l=-l;
  const T=Math.sqrt(2*MU_SUN/(s*s*s))*t;
  let lo=-1+1e-12, hi=1; while(tofX(hi,l)>T){ hi*=2; if(hi>1e6) return null; }   // flight time falls as x grows
  for(let k=0;k<60;k++){ const m=(lo+hi)/2; if(tofX(m,l)>T) lo=m; else hi=m; }
  const x=(lo+hi)/2, y=Math.sqrt(1-l*l*(1-x*x)), gam=Math.sqrt(MU_SUN*s/2), rho=(r1-r2)/c, sig=Math.sqrt(1-rho*rho);
  const vr1=gam*((l*y-x)-rho*(l*y+x))/r1, vr2=-gam*((l*y-x)+rho*(l*y+x))/r2, vt=gam*sig*(y+l*x);
  return [Math.hypot(vr1, vt/r1-Math.sqrt(MU_SUN/r1)), Math.hypot(vr2, vt/r2-Math.sqrt(MU_SUN/r2))];
}

const radius = (k: PlanetId): number => BODIES[k].orbitRadius*AU;

// The Hohmann flight between two planets, days
export const hohmannDays = (a: PlanetId, b: PlanetId): number => Math.PI*Math.sqrt(((radius(a)+radius(b))/2)**3/MU_SUN)/86400;

// Days until the two planets stand the same way again
export const synodic = (a: PlanetId, b: PlanetId): number => TAU/Math.abs(nn(b)-nn(a));

// The angle a transfer sweeps: from planet a on the day it leaves to planet b on the day it arrives
export const transferAngle = (a: PlanetId, b: PlanetId, dep: number, days: number): number => ((theta(b,dep+days)-theta(a,dep))%TAU+TAU)%TAU;

// What a transfer leaving a on day dep and flying days really costs: the burns at departure and
// arrival, m/s. This is what the ship burns.
export function transferCost(a: PlanetId, b: PlanetId, dep: number, days: number): {dep:number; arr:number; total:number}{
  const v=lambert(radius(a), radius(b), transferAngle(a,b,dep,days), days*86400);
  if(!v) return {dep:Infinity, arr:Infinity, total:Infinity};
  const d=vInfBurn(a,v[0]), r=vInfBurn(b,v[1]); return {dep:d, arr:r, total:d+r};
}

// The excess speeds for every cell of a's table to b, computed from the orbits (for the generator
// and the test that the stored tables still match)
export function computeTable(a: PlanetId, b: PlanetId): {flightRange:[number,number]; vInfDep:Float64Array; vInfArr:Float64Array}{
  const {angleSteps:na, flightSteps:nf, flightFrom, flightTo}=TABLE_GRID, h=hohmannDays(a,b);
  const f0=flightFrom*h, f1=flightTo*h, dep=new Float64Array(na*nf), arr=new Float64Array(na*nf);
  for(let i=0;i<na;i++) for(let j=0;j<nf;j++){
    const v=lambert(radius(a), radius(b), i/na*TAU, (f0+(f1-f0)*j/(nf-1))*86400), k=i*nf+j;
    dep[k]=v?v[0]:Infinity; arr[k]=v?v[1]:Infinity;
  }
  return {flightRange:[f0,f1], vInfDep:dep, vInfArr:arr};
}

// The delta-v of every cell (m/s), worked out once per table
const COSTS = new Map<string, Float32Array>();
function costs(a: PlanetId, b: PlanetId, t: TransferTable): Float32Array{
  const key=a+'>'+b, hit=COSTS.get(key); if(hit) return hit;
  const g=new Float32Array(t.vInfDep.length);
  for(let k=0;k<g.length;k++) g[k]=vInfBurn(a,t.vInfDep[k]??0)+vInfBurn(b,t.vInfArr[k]??0);
  COSTS.set(key,g); return g;
}
const at = (g: Float32Array, k: number): number => g[k] ?? Infinity;

// What the table says a transfer costs, m/s: for looking and searching
export function tableCost(a: PlanetId, b: PlanetId, dep: number, days: number): number{
  const t=transferTable(a,b); if(!t) return Infinity;
  const g=costs(a,b,t), p=t.place(transferAngle(a,b,dep,days),days), n=t.flightSteps;
  const c0=at(g,p.i*n+p.j)*(1-p.fx)+at(g,p.i1*n+p.j)*p.fx, c1=at(g,p.i*n+p.j+1)*(1-p.fx)+at(g,p.i1*n+p.j+1)*p.fx;
  return c0*(1-p.fy)+c1*p.fy;
}

// The table's cheapest cell: the ideal window. phase is where b then stands ahead of a at departure.
export function cheapestCell(a: PlanetId, b: PlanetId): {dv:number; days:number; phase:number}|null{
  const t=transferTable(a,b); if(!t) return null;
  const g=costs(a,b,t); let best=0;
  for(let k=1;k<g.length;k++) if(at(g,k)<at(g,best)) best=k;
  const i=Math.floor(best/t.flightSteps), days=t.flightOf(best%t.flightSteps);
  return {dv:at(g,best), days, phase:wrap(t.angleOf(i)-nn(b)*days)};
}

// The flight time that costs least when leaving on day dep: the table's best column, then refined
export function cheapestFlight(a: PlanetId, b: PlanetId, dep: number): number|null{
  const t=transferTable(a,b); if(!t) return null;
  let days=t.flightOf(0), c=Infinity;
  for(let j=0;j<t.flightSteps;j++){ const d=t.flightOf(j), x=tableCost(a,b,dep,d); if(x<c){ c=x; days=d; } }
  const [f0,f1]=t.flightRange; let st=(f1-f0)/(t.flightSteps-1), e=transferCost(a,b,dep,days).total;
  while(st>0.02){ const u=Math.min(f1,days+st), d=Math.max(f0,days-st), eu=transferCost(a,b,dep,u).total, ed=transferCost(a,b,dep,d).total;
    if(eu<e && eu<=ed){ days=u; e=eu; } else if(ed<e){ days=d; e=ed; } else st/=2; }
  return days;
}

// A transfer as chosen: when it leaves, how long it flies, what it costs (m/s)
export interface TransferChoice { dep:number; days:number; dv:number }

// The best transfer from day `from` on, weighing delta-v against days of waiting and flying at
// dayValue m/s per day. Searched on the table: every flight time of the grid, and departures a
// grid row apart over one synodic period, after which everything repeats.
const SEARCHED = new Map<string, TransferChoice>();
export function searchTransfer(a: PlanetId, b: PlanetId, from: number, dayValue: number): TransferChoice|null{
  const t=transferTable(a,b); if(!t) return null;
  const key=`${a}>${b}|${Math.round(from*1000)}|${dayValue}`, hit=SEARCHED.get(key); if(hit) return hit;
  // the angle grows by a fixed amount per departure step and per day of flight, so it is summed
  // up rather than worked out afresh, and every flight time sits on a column of the grid
  const g=costs(a,b,t), na=t.angleSteps, nf=t.flightSteps, step=synodic(a,b)/na;
  const base=transferAngle(a,b,from,0), perDep=(nn(b)-nn(a))*step, rows=na/TAU;
  let best:TransferChoice={dep:from, days:t.flightRange[1], dv:Infinity}, bc=Infinity;
  for(let k=0;k<na;k++){ const dep=from+k*step, wait=dayValue*k*step;
    for(let j=0;j<nf;j++){ const days=t.flightOf(j);
      let x=((base+k*perDep+nn(b)*days)%TAU+TAU)%TAU*rows; const i=Math.floor(x); x-=i;
      const dv=at(g,(i%na)*nf+j)*(1-x)+at(g,((i+1)%na)*nf+j)*x, c=dv+wait+dayValue*days;
      if(c<bc){ bc=c; best={dep,days,dv}; } } }
  if(SEARCHED.size>4000) SEARCHED.clear();
  SEARCHED.set(key,best); return best;
}

// The same, refined on the exact cost around the table's best cell
const REFINED = new Map<string, TransferChoice>();
export function bestTransfer(a: PlanetId, b: PlanetId, from: number, dayValue: number): TransferChoice|null{
  const t=transferTable(a,b), s=searchTransfer(a,b,from,dayValue); if(!t || !s) return null;
  const key=`${a}>${b}|${Math.round(from*1000)}|${dayValue}`, hit=REFINED.get(key); if(hit) return hit;
  const [f0,f1]=t.flightRange, cost=(dep:number, days:number)=>transferCost(a,b,dep,days).total+dayValue*(dep-from+days);
  let dep=s.dep, days=s.days, c=cost(dep,days), sd=synodic(a,b)/t.angleSteps, st=(f1-f0)/(t.flightSteps-1);
  for(let k=0;k<80 && (sd>0.02 || st>0.02);k++){
    let moved=false;
    for(const [dd,dt] of [[sd,0],[-sd,0],[0,st],[0,-st]] as const){
      const d2=Math.max(from,dep+dd), t2=Math.max(f0,Math.min(f1,days+dt)), c2=cost(d2,t2);
      if(c2<c-1e-9){ dep=d2; days=t2; c=c2; moved=true; break; }
    }
    if(!moved){ sd/=2; st/=2; }
  }
  const r={dep, days, dv:transferCost(a,b,dep,days).total};
  if(REFINED.size>4000) REFINED.clear();
  REFINED.set(key,r); return r;
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
