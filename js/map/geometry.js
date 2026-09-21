// Where a body, an orbit or a ship sits on screen. Pure mathematics.

import { TAU } from '../basics.js';
import { M, MOONS, SITES, hasAtm, moonsOf, planetOfBody, siteOf } from '../game/world.js';
import { keplerNu } from '../game/physics.js';
import { S } from '../game/state.js';

// During a time-lapse animation fast moons would otherwise spin round many times (a wild blur).
// So in an animation they advance at most one lap and end up exactly at their real position.
export function moonAngle(m,day){
  const base=MOONS.indexOf(m)*1.7, P=M[m].P, A=S&&S.anim;
  if(A && A.d1>A.d0 && day>=A.d0-1e-9 && day<=A.d1+1e-9){
    const a0=TAU*A.d0/P, a1=TAU*A.d1/P, res=((a1-a0)%TAU+TAU)%TAU;
    return a0 + res*(day-A.d0)/(A.d1-A.d0) + base;
  }
  return TAU*day/P + base;
}

const EARTH_LON0 = -8;

export const D2R = Math.PI/180;

const CAM_EL = 22*D2R;                 // camera 22° above (or below) the equatorial plane

export const R_ORB = 1.3, R_HIGH = 1.62;      // orbit radii in body radii (exaggerated so they are visible)

export const vadd=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], vmul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];

const vdot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], vnorm=a=>vmul(a,1/(Math.hypot(...a)||1));

// Centre of view per body: chosen so that as many landing sites as possible face the viewer
const VIEW = {};

export function bodyView(b){
  if(VIEW[b]) return VIEW[b];
  const st=SITES[b]||[]; let best={lon:0,el:CAM_EL}, bs=-1e9;
  for(const el of [CAM_EL,-CAM_EL]) for(let L=-180; L<180; L+=5){
    if(b==='earth' && (L!==EARTH_LON0 || el<0)) continue; // Earth: looking at the Atlantic from the north
    let s=0; st.forEach(x=>{ const f=x.lat*D2R, d=(x.lon-L)*D2R;
      const z=Math.sin(f)*Math.sin(el)+Math.cos(f)*Math.cos(d)*Math.cos(el); s+=(z>0.12?10:0)+z+(x.port?3*(z>0.12):0); });
    if(el<0) s-=0.5; // on a tie, prefer the northern view
    if(s>bs){ bs=s; best={lon:L,el}; }
  }
  return VIEW[b]=best;
}

export const bodyLon0 = b => bodyView(b).lon;

// Body-fixed unit vector (Y = north pole, Z = towards the centre of view)
export const bvec=(b,lat,lon)=>{ const f=lat*D2R, L=(lon-bodyLon0(b))*D2R; return [Math.cos(f)*Math.sin(L), Math.sin(f), Math.cos(f)*Math.cos(L)]; };

export function makeCam(cx,cy,R,el){
  const ce=Math.cos(el), se=Math.sin(el);
  const view=p=>[p[0], p[1]*ce-p[2]*se, p[1]*se+p[2]*ce];
// hidden: behind the body
  const proj=p=>{ const q=view(p); return {x:cx+R*q[0], y:cy-R*q[1], z:q[2], hidden:q[2]<0 && q[0]*q[0]+q[1]*q[1]<1}; };
  return {view, proj, cx, cy, R};
}

// Orbit: inclination i, ascending node Om (longitude), position from the argument u
export function orbitPos(b,o,u,r){ const N=bvec(b,0,o.Om), M=bvec(b,o.i,o.Om+90); return vmul(vadd(vmul(N,Math.cos(u)),vmul(M,Math.sin(u))),r); }

// An orbit passing eastwards over a landing site (launch due east)
function siteOrbit(st){ const i=Math.abs(st.lat); return st.lat>=0 ? {i, Om:st.lon-90, uSite:90*D2R} : {i, Om:st.lon+90, uSite:270*D2R}; }

export const defaultOrb = b => ({body:b, i:0, Om:bodyLon0(b)-90, u:90*D2R});

export const shipOrb = b => (S.orb && S.orb.body===b) ? S.orb : defaultOrb(b);

const easeIn = t=>t*t, easeOut = t=>1-(1-t)*(1-t);

// Path of a manoeuvre in the body frame: at(t) -> {p, burn:'pro'|'retro'|null, glow}
export function bodyPath(mv){
  const [fb,fl]=mv.from.node.split('.'), [tb,tl]=mv.to.node.split('.'), b=fb;
  const atm=hasAtm(b);
// launch: straight up, then east into the circular orbit
  if(fl==='surf' && tl==='orbit' && fb===tb){
    const st=siteOf(b,mv.from.site)||{lat:0,lon:bodyLon0(b)}, o=siteOrbit(st), du=75*D2R;
    return {b, finalOrb:{body:b,i:o.i,Om:o.Om,u:o.uSite+du},
      at:t=>({p:orbitPos(b,o,o.uSite+du*easeIn(t),1+(R_ORB-1)*easeOut(t)), burn:t<0.88?'pro':null})};
  }
// landing: coast in the old orbit to the braking point (the plane rotates towards the landing track), brake, descend, touch down vertically
  if(fl==='orbit' && tl==='surf' && fb===tb){
    const st=siteOf(b,mv.to.site)||{lat:0,lon:bodyLon0(b)}, o=siteOrbit(st), c=mv.orb||shipOrb(b), arc=110*D2R;
    const uDe=o.uSite-arc; let du=((uDe-c.u)%TAU+TAU)%TAU; if(du<0.6) du+=TAU;
    const dOm=((o.Om-c.Om+540)%360)-180;
    return {b, finalOrb:null, at:t=>{
      if(t<0.38){ const s=t/0.38; const oo={i:c.i+(o.i-c.i)*s, Om:c.Om+dOm*s}; return {p:orbitPos(b,oo,c.u+du*s,R_ORB), burn:s>0.92?'retro':null}; }
      const s=(t-0.38)/0.62;
      return {p:orbitPos(b,o,uDe+arc*easeOut(s),R_ORB-(R_ORB-1)*easeIn(s)), burn:(s<0.07||s>0.7)?'retro':null, glow:atm&&s>0.25&&s<0.68, att:'retro'};
    }};
  }
// hop: a ballistic arc along the great circle
  if(fl==='surf' && tl==='surf' && fb===tb){
    const A=siteOf(b,mv.from.site), Bs=siteOf(b,mv.to.site); if(!A||!Bs) return null;
    const a=bvec(b,A.lat,A.lon), c=bvec(b,Bs.lat,Bs.lon), th=Math.acos(Math.max(-1,Math.min(1,vdot(a,c))));
    const T=vnorm(vadd(c,vmul(a,-Math.cos(th)))), h=0.06+0.32*th/Math.PI;
    return {b, finalOrb:null, at:t=>{ const r=1+h*4*t*(1-t), w=th*t; return {p:vmul(vadd(vmul(a,Math.cos(w)),vmul(T,Math.sin(w))),r), burn:t<0.1?'pro':t>0.9?'retro':null}; }};
  }
// raise the orbit (Hohmann, half an ellipse at Kepler pace)
  if(fl==='orbit' && tl==='capt' && fb===tb){
    const c=mv.orb||shipOrb(b), rp=R_ORB, ra=R_HIGH, a=(rp+ra)/2, e=(ra-rp)/(ra+rp);
    return {b, finalOrb:null, at:t=>{ const nu=keplerNu(Math.PI*t,e); const r=a*(1-e*e)/(1+e*Math.cos(nu)); return {p:orbitPos(b,c,c.u+nu,r), burn:t<0.06||t>0.94?'pro':null}; }};
  }
// lower the orbit (Hohmann in reverse, ending at the front)
  if(fl==='capt' && tl==='orbit' && fb===tb){
    const o=defaultOrb(b), rp=R_ORB, ra=R_HIGH, a=(rp+ra)/2, e=(ra-rp)/(ra+rp), uEnd=o.u;
    return {b, finalOrb:{...o}, at:t=>{ const nu=keplerNu(Math.PI+Math.PI*t,e); const r=a*(1-e*e)/(1+e*Math.cos(nu)); return {p:orbitPos(b,o,uEnd-Math.PI+(nu-Math.PI),r), burn:t<0.06||t>0.94?'retro':null, glow:atm && mv.aero && t>0.8}; }};
  }
// away from moon orbit (an escape path outwards)
  if(fl==='orbit' && M[fb] && tl==='capt'){
    const c=mv.orb||shipOrb(b);
    return {b, finalOrb:null, fade:true, at:t=>({p:orbitPos(b,c,c.u+1.3*t,R_ORB+2.2*t*t), burn:t<0.15?'pro':null})};
  }
  return null;
}

export const SYS_EL = 35*D2R;

export const ringPt=(r,a)=>[r*Math.cos(a),0,-r*Math.sin(a)];

export const sysState = p => { if(!S.sys || S.sys.p!==p) S.sys={p, capU:-0.75, lowU:0, moonU:0}; return S.sys; };

// Plan of a manoeuvre in the system view (angles only, independent of scale)
export function sysPlan(mv){
  const [fb,fl]=mv.from.node.split('.'), [tb,tl]=mv.to.node.split('.'), p=planetOfBody(fb);
  if(planetOfBody(tb)!==p || !moonsOf(p).length) return null;
  const st=sysState(p);
  if(fl==='capt' && M[tb] && tl==='orbit'){ const aArr=moonAngle(tb,mv.d1); return {kind:'toMoon', m:tb, p0:st.capU, aArr, final:{moonU:aArr+Math.PI/2}}; }
  if(M[fb] && fl==='orbit' && tl==='capt'){ const aDep=moonAngle(fb,mv.d0); return {kind:'fromMoon', m:fb, m0:st.moonU, aDep, final:{capU:aDep+Math.PI}}; }
  if(fb===p && fl==='orbit' && tl==='capt') return {kind:'raise', u0:st.lowU, final:{capU:st.lowU+Math.PI}};
  if(fb===p && fl==='capt' && tl==='orbit'){ const aero=!!mv.aero, th=aero?4*TAU+Math.PI:Math.PI; return {kind:'lower', u0:st.capU, aero, th, final:{lowU:st.capU+th}}; }
  return null;
}
