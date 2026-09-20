// Wo ein Körper, ein Orbit oder ein Schiff auf dem Bildschirm liegt. Reine Mathematik.

import { TAU } from '../basis.js';
import { M, MOONS, SITES, hasAtm, moonsOf, planetOfBody, siteOf } from '../spiel/welt.js';
import { keplerNu } from '../spiel/physik.js';
import { S } from '../spiel/zustand.js';

// Während einer Zeitraffer-Animation drehen sich schnelle Monde sonst viele Male (wildes Kreiseln).
// Deshalb laufen sie in der Animation höchstens eine Runde vorwärts und landen genau auf ihrer echten Position.
export function moonAngle(m,day){
  const base=MOONS.indexOf(m)*1.7, P=M[m].P, A=S&&S.anim;
  if(A && A.d1>A.d0 && day>=A.d0-1e-9 && day<=A.d1+1e-9){
    const a0=TAU*A.d0/P, a1=TAU*A.d1/P, res=((a1-a0)%TAU+TAU)%TAU;
    return a0 + res*(day-A.d0)/(A.d1-A.d0) + base;
  }
  return TAU*day/P + base;
}

const EARTH_LON0 = -8;

export const LAND = [
  // Nordamerika
  [[-165,65],[-160,70],[-140,70],[-120,70],[-95,72],[-80,70],[-75,63],[-65,60],[-55,52],[-60,47],[-66,45],[-70,42],[-76,38],[-76,35],[-81,31],[-80.2,28.5],[-80,25],[-81.5,25.5],[-82.6,28],[-85,30],[-90,29],[-97,27],[-97,21],[-94,18],[-90,21],[-87,21],[-88,16],[-83,11],[-78,8],[-80,7],[-86,12],[-92,14],[-105,20],[-110,24],[-112,29],[-115,30],[-117,33],[-121,35],[-124,40],[-124,47],[-128,51],[-135,57],[-145,60],[-155,58],[-165,55],[-160,60]],
  // Grönland (Eis)
  [[-55,60],[-45,60],[-40,65],[-22,70],[-20,78],[-30,83],[-60,82],[-70,77],[-58,70],[-52,65]],
  // Südamerika
  [[-77,8],[-72,12],[-62,11],[-58,7.5],[-54.5,6.5],[-52.3,5.6],[-51,4],[-50,0],[-45,-2],[-35,-5],[-37,-12],[-39,-17],[-41,-22],[-48,-26],[-53,-34],[-58,-38],[-62,-39],[-65,-42],[-66,-47],[-69,-52],[-72,-54],[-74,-50],[-74,-42],[-72,-33],[-71,-25],[-70,-18],[-76,-14],[-80,-6],[-81,-3],[-80,1],[-78,4]],
  // Afrika
  [[-17,21],[-16,15],[-15,11],[-12,7],[-8,4],[-2,5],[5,6],[9,4],[10,1],[9,-2],[12,-6],[13,-12],[12,-17],[15,-27],[18,-34],[21,-34],[27,-33],[32,-28],[35,-22],[35,-18],[40,-15],[40,-10],[39,-5],[43,0],[48,5],[51,11],[44,11],[43,13],[39,18],[35,24],[33,30],[30,31],[20,32],[15,32],[10,34],[10,37],[3,37],[-5,36],[-9,33],[-10,29],[-13,27]],
  // Madagaskar
  [[44,-25],[47,-25],[50,-16],[49,-12],[44,-17]],
  // Eurasien
  [[-9,37],[-9,43],[-2,44],[-5,48],[0,49],[4,52],[8,54],[8,57],[5,59],[5,62],[12,65],[15,69],[22,70],[30,70],[40,67],[44,68],[60,69],[70,73],[80,73],[100,77],[115,74],[130,71],[140,72],[160,70],[180,68],[180,65],[170,62],[160,58],[156,51],[142,47],[140,40],[130,35],[122,31],[120,24],[110,20],[108,16],[105,9],[100,13],[99,8],[103,1],[98,8],[97,17],[92,22],[88,22],[80,15],[77,8],[73,17],[67,25],[57,25],[56,27],[50,30],[48,29],[52,24],[59,22],[55,17],[45,13],[43,15],[39,21],[35,28],[34,31],[35,36],[28,37],[26,40],[23,38],[20,40],[19,42],[13,45],[12,44],[16,40],[15,38],[12,42],[10,44],[3,43],[0,39],[-2,37]],
  // Großbritannien
  [[-5,50],[1,51],[2,53],[0,54],[-2,56],[-2,58],[-5,58],[-6,56],[-3,54],[-5,52]],
  // Irland
  [[-10,52],[-6,52],[-6,55],[-8,55],[-10,54]],
  // Island
  [[-24,64],[-14,64],[-14,66],[-22,66.5]],
  // Australien
  [[114,-22],[114,-34],[118,-35],[123,-34],[129,-32],[135,-35],[138,-35],[140,-38],[147,-39],[150,-37],[153,-32],[153,-25],[146,-19],[142,-11],[136,-12],[130,-12],[125,-15],[122,-18]],
];

const ICE = [0,1]; // Indizes mit Eis (Grönland = 1); Nordamerika bleibt Land

export const WATER = [
  // Hudsonbucht, Ostsee, Schwarzes und Kaspisches Meer
  [[-95,59],[-92,57],[-85,55],[-80,52],[-78,55],[-78,60],[-85,64],[-93,62]],
  [[10,54.5],[20,54.5],[21,57],[23,59],[29,60],[22,60.5],[21,63],[25,65.5],[21,65],[17,62],[19,60],[16,57],[12,56]],
  [[28,42],[33,41],[41,41],[40,44],[35,45],[31,46],[29,45]],
  [[47,37],[54,37],[53,42],[51,45],[53,47],[49,47],[47,43]],
];

// Wüstengürtel (Sahara/Arabien, Iran, Australien) und die beiden Erdfarben, von 2D und 3D genutzt
export const DESERT = [
  [[[-12,20],[0,28],[20,30],[32,24],[34,16],[15,14],[-5,15]],'rgba(196,170,112,0.75)'],
  [[[40,16],[55,22],[56,27],[48,29],[40,26]],'rgba(196,170,112,0.7)'],
  [[[125,-22],[140,-24],[140,-30],[125,-30]],'rgba(196,170,112,0.6)'],
];

export const EARTH_LAND = i => i===1 ? 'rgba(236,240,244,0.92)' : 'rgba(104,146,86,0.95)'; // 1 = Grönland (Eis)

export const D2R = Math.PI/180;

const CAM_EL = 22*D2R;                 // Kamera 22° über (oder unter) der Äquatorebene

export const R_ORB = 1.3, R_HIGH = 1.62;      // Bahnradien in Körperradien (überhöht, damit man sie sieht)

export const LIGHT = (()=>{ const v=[-0.5,0.3,0.78], n=Math.hypot(...v); return v.map(x=>x/n); })(); // Licht von links oben vorn

export const vadd=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], vmul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];

const vdot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], vnorm=a=>vmul(a,1/(Math.hypot(...a)||1));

// Blickmitte je Körper: so, dass möglichst viele Landeplätze auf der Vorderseite liegen
const VIEW = {};

export function bodyView(b){
  if(VIEW[b]) return VIEW[b];
  const st=SITES[b]||[]; let best={lon:0,el:CAM_EL}, bs=-1e9;
  for(const el of [CAM_EL,-CAM_EL]) for(let L=-180; L<180; L+=5){
    if(b==='earth' && (L!==EARTH_LON0 || el<0)) continue; // Erde: Blick auf den Atlantik von Norden
    let s=0; st.forEach(x=>{ const f=x.lat*D2R, d=(x.lon-L)*D2R;
      const z=Math.sin(f)*Math.sin(el)+Math.cos(f)*Math.cos(d)*Math.cos(el); s+=(z>0.12?10:0)+z+(x.port?3*(z>0.12):0); });
    if(el<0) s-=0.5; // bei Gleichstand lieber von Norden
    if(s>bs){ bs=s; best={lon:L,el}; }
  }
  return VIEW[b]=best;
}

export const bodyLon0 = b => bodyView(b).lon;

// Körperfester Einheitsvektor (Y = Nordpol, Z = zur Blickmitte)
export const bvec=(b,lat,lon)=>{ const f=lat*D2R, L=(lon-bodyLon0(b))*D2R; return [Math.cos(f)*Math.sin(L), Math.sin(f), Math.cos(f)*Math.cos(L)]; };

export function makeCam(cx,cy,R,el){
  const ce=Math.cos(el), se=Math.sin(el);
  const view=p=>[p[0], p[1]*ce-p[2]*se, p[1]*se+p[2]*ce];
  // hidden: hinter dem Körper verdeckt
  const proj=p=>{ const q=view(p); return {x:cx+R*q[0], y:cy-R*q[1], z:q[2], hidden:q[2]<0 && q[0]*q[0]+q[1]*q[1]<1}; };
  return {view, proj, cx, cy, R};
}

// Bahn: Neigung i, aufsteigender Knoten Om (Länge), Position über Argument u
export function orbitPos(b,o,u,r){ const N=bvec(b,0,o.Om), M=bvec(b,o.i,o.Om+90); return vmul(vadd(vmul(N,Math.cos(u)),vmul(M,Math.sin(u))),r); }

// Bahn, die ostwärts über einen Landeplatz führt (Start genau nach Osten)
function siteOrbit(st){ const i=Math.abs(st.lat); return st.lat>=0 ? {i, Om:st.lon-90, uSite:90*D2R} : {i, Om:st.lon+90, uSite:270*D2R}; }

export const defaultOrb = b => ({body:b, i:0, Om:bodyLon0(b)-90, u:90*D2R});

export const shipOrb = b => (S.orb && S.orb.body===b) ? S.orb : defaultOrb(b);

const easeIn = t=>t*t, easeOut = t=>1-(1-t)*(1-t);

// Flugbahn eines Manövers im Körperrahmen: at(t) -> {p, burn:'pro'|'retro'|null, glow}
export function bodyPath(mv){
  const [fb,fl]=mv.from.node.split('.'), [tb,tl]=mv.to.node.split('.'), b=fb;
  const atm=hasAtm(b);
  // Start: senkrecht hoch, dann nach Osten in die Kreisbahn
  if(fl==='surf' && tl==='orbit' && fb===tb){
    const st=siteOf(b,mv.from.site)||{lat:0,lon:bodyLon0(b)}, o=siteOrbit(st), du=75*D2R;
    return {b, finalOrb:{body:b,i:o.i,Om:o.Om,u:o.uSite+du},
      at:t=>({p:orbitPos(b,o,o.uSite+du*easeIn(t),1+(R_ORB-1)*easeOut(t)), burn:t<0.88?'pro':null})};
  }
  // Landung: im alten Orbit bis zum Bremspunkt gleiten (Bahnebene dreht sich zur Landebahn), bremsen, absteigen, senkrecht aufsetzen
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
  // Hüpfer: ballistischer Bogen entlang des Großkreises
  if(fl==='surf' && tl==='surf' && fb===tb){
    const A=siteOf(b,mv.from.site), Bs=siteOf(b,mv.to.site); if(!A||!Bs) return null;
    const a=bvec(b,A.lat,A.lon), c=bvec(b,Bs.lat,Bs.lon), th=Math.acos(Math.max(-1,Math.min(1,vdot(a,c))));
    const T=vnorm(vadd(c,vmul(a,-Math.cos(th)))), h=0.06+0.32*th/Math.PI;
    return {b, finalOrb:null, at:t=>{ const r=1+h*4*t*(1-t), w=th*t; return {p:vmul(vadd(vmul(a,Math.cos(w)),vmul(T,Math.sin(w))),r), burn:t<0.1?'pro':t>0.9?'retro':null}; }};
  }
  // Orbit anheben (Hohmann, halbe Ellipse mit Kepler-Tempo)
  if(fl==='orbit' && tl==='capt' && fb===tb){
    const c=mv.orb||shipOrb(b), rp=R_ORB, ra=R_HIGH, a=(rp+ra)/2, e=(ra-rp)/(ra+rp);
    return {b, finalOrb:null, at:t=>{ const nu=keplerNu(Math.PI*t,e); const r=a*(1-e*e)/(1+e*Math.cos(nu)); return {p:orbitPos(b,c,c.u+nu,r), burn:t<0.06||t>0.94?'pro':null}; }};
  }
  // Orbit absenken (umgekehrter Hohmann, endet vorne)
  if(fl==='capt' && tl==='orbit' && fb===tb){
    const o=defaultOrb(b), rp=R_ORB, ra=R_HIGH, a=(rp+ra)/2, e=(ra-rp)/(ra+rp), uEnd=o.u;
    return {b, finalOrb:{...o}, at:t=>{ const nu=keplerNu(Math.PI+Math.PI*t,e); const r=a*(1-e*e)/(1+e*Math.cos(nu)); return {p:orbitPos(b,o,uEnd-Math.PI+(nu-Math.PI),r), burn:t<0.06||t>0.94?'retro':null, glow:atm && mv.aero && t>0.8}; }};
  }
  // Vom Mondorbit weg (Fluchtbahn nach außen)
  if(fl==='orbit' && M[fb] && tl==='capt'){
    const c=mv.orb||shipOrb(b);
    return {b, finalOrb:null, fade:true, at:t=>({p:orbitPos(b,c,c.u+1.3*t,R_ORB+2.2*t*t), burn:t<0.15?'pro':null})};
  }
  return null;
}

export const SYS_EL = 35*D2R;

export const ringPt=(r,a)=>[r*Math.cos(a),0,-r*Math.sin(a)];

export const sysState = p => { if(!S.sys || S.sys.p!==p) S.sys={p, capU:-0.75, lowU:3.7, moonU:0}; return S.sys; };

// Plan eines Manövers in der Systemansicht (nur Winkel, unabhängig vom Maßstab)
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

// Polkappen je Körper: [Breite, Deckkraft]
export const CAPS = {earth:[[-68,0.9],[80,0.85]], mars:[[80,0.85]], mercury:[], ceres:[], europa:[], enceladus:[[-70,0.5]]};
