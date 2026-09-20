// Die Rakete auf der Karte: Lage, Flamme, Umschalter zwischen 3D-Modell und Handzeichnung.

import { ANIM, FAST, TAU } from '../basis.js';
import { B } from '../spiel/welt.js';
import { burn } from '../spiel/zustand.js';
import { sc } from './leinwand.js';
import { RKT, RKT_LEN, RKT_PAL, RKT_TILT, rollOf } from './raketendaten.js';
import { glRocket } from './gl.js';

const HEAD = {};

// 'gl' = three.js-Modell mit echter Tiefe, 'flach' = der 2D-Handrenderer
// (Sonnenansicht und die blasse Rückseite eines Landeplatzes).
export let rocketMode = 'gl';
export function setzeRaketenart(art){ rocketMode=art; }
// Wo die Rakete zuletzt gezeichnet wurde - für Tests und zum Nachmessen.
export const RAKETE_ZULETZT={x:0, y:0, ebene:null};

const angNorm = a => ((a+Math.PI)%TAU+TAU)%TAU-Math.PI;

// velAng: Flugrichtung (Bildschirmwinkel), burn: brennt gerade ('pro'|'retro'), soon: brennt gleich, att: gewünschte Lage ohne Brennen
// z: echte Tiefe in Pixeln (0 = Mittelebene des Körpers), alpha: Deckkraft der Rakete
export function drawRocket(g,key,x,y,velAng,burn,soon,att,col,z,alpha){
  const want = s => s==='retro' ? velAng+Math.PI : s==='up' ? att.up : velAng;
  const mode = burn || soon || (att && att.mode) || 'pro';
  const target = mode==='up' ? att.up : want(mode);
  const now=performance.now(), h=HEAD[key];
  let a=target, turning=0;
  if(h && now-h.t<400){
    const rate=3.2*(ANIM.fast?FAST:1)*(now-h.t)/1000, d=angNorm(target-h.a);
    a = Math.abs(d)<=rate ? target : h.a+Math.sign(d)*rate; turning=Math.abs(d)>0.25?Math.sign(d):0;
  }
  HEAD[key]={a,t:now};
  RAKETE_ZULETZT.x=x; RAKETE_ZULETZT.y=y; RAKETE_ZULETZT.ebene=g.canvas;
  g.save(); g.translate(x,y); g.rotate(-a);
  // Flamme aus der Düse: flackernd, spitz zulaufend
  if(burn){
    const L=11+Math.random()*7, w=3.4+Math.random()*0.8;
    const gr=g.createLinearGradient(-9.5,0,-9.5-L,0); gr.addColorStop(0,'rgba(255,250,220,0.95)'); gr.addColorStop(0.35,'rgba(255,190,80,0.9)'); gr.addColorStop(1,'rgba(255,90,30,0)');
    g.fillStyle=gr; g.beginPath(); g.moveTo(-9,-w*0.7); g.quadraticCurveTo(-9.5-L*0.45,-w,-9.5-L,0); g.quadraticCurveTo(-9.5-L*0.45,w,-9,w*0.7); g.closePath(); g.fill();
  }
  g.restore();
  if(rocketMode==='gl') glRocket(x,y,z||0,a,key,alpha); else if(rocketMode==='flach') rocketMesh(g,x,y,a,key);
  // Steuerdüsen-Stöße an der Spitze beim Drehen
  if(turning){ g.save(); g.translate(x,y); g.rotate(-a); g.fillStyle='rgba(235,240,255,0.8)'; const sy=turning>0?6.5:-6.5; for(let i=0;i<2;i++){ g.beginPath(); g.arc(5-i*2.5, sy*(1+i*0.4)+(Math.random()-0.5), 1.2+Math.random()*0.8,0,TAU); g.fill(); } g.restore(); }
}

export function rocketMesh(g,x,y,a,key){
  const n=RKT.v.length/3, sc=RKT.s*RKT_LEN/1.25, roll=rollOf(key);
  const cr=Math.cos(roll), sr=Math.sin(roll), ct=Math.cos(RKT_TILT), st=Math.sin(RKT_TILT), ca=Math.cos(a-Math.PI/2), sa=Math.sin(a-Math.PI/2);
  const X=new Float32Array(n), Y=new Float32Array(n), Z=new Float32Array(n);
  for(let i=0;i<n;i++){
    let px=RKT.v[3*i]*sc, py=RKT.v[3*i+1]*sc, pz=RKT.v[3*i+2]*sc;
    // Rollen um Y
    let qx=px*cr+pz*sr, qz=-px*sr+pz*cr;
    // Kippen um X: Nase (+Y) zum Betrachter (+Z)
    let qy=py*ct-qz*st; qz=py*st+qz*ct;
    // in Flugrichtung drehen (Bildschirm: x rechts, y oben)
    X[i]=qx*ca-qy*sa; Y[i]=qx*sa+qy*ca; Z[i]=qz;
  }
  const F=RKT.f, m=F.length/4, ord=new Array(m), dep=new Float32Array(m);
  for(let k=0;k<m;k++){ ord[k]=k; dep[k]=Z[F[4*k]]+Z[F[4*k+1]]+Z[F[4*k+2]]; }
  ord.sort((p,q)=>dep[p]-dep[q]);
  const L=[-0.5,0.45,0.74];
  g.save(); g.lineJoin='round'; g.lineWidth=0.35;
  for(const k of ord){
    const A=F[4*k],B=F[4*k+1],C=F[4*k+2];
    const ux=X[B]-X[A], uy=Y[B]-Y[A], uz=Z[B]-Z[A], vx=X[C]-X[A], vy=Y[C]-Y[A], vz=Z[C]-Z[A];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx; const nl=Math.hypot(nx,ny,nz)||1; if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
    const d=Math.max(0,(nx*L[0]+ny*L[1]+nz*L[2])/nl), lum=0.32+0.78*d, c=RKT_PAL[F[4*k+3]];
    const col=`rgb(${Math.min(255,c[0]*lum)|0},${Math.min(255,c[1]*lum)|0},${Math.min(255,c[2]*lum)|0})`;
    g.fillStyle=col; g.strokeStyle=col; g.beginPath(); g.moveTo(x+X[A],y-Y[A]); g.lineTo(x+X[B],y-Y[B]); g.lineTo(x+X[C],y-Y[C]); g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}
