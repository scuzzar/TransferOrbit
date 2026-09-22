import { ANIM, FAST, TAU } from '../basics.js';
import { RKT, RKT_LEN, RKT_PAL, RKT_TILT, rollOf } from './rocketdata.js';
import { glRocket } from './gl.js';

const HEAD: Record<string, {a:number; t:number} | undefined> = {};

export let rocketMode: string = 'gl';
export function setRocketMode(art: string) { rocketMode=art; }
export const LAST_ROCKET: {x:number; y:number; layer: HTMLElement|null} = {x:0, y:0, layer:null};

const angNorm = (a:number) => ((a+Math.PI)%TAU+TAU)%TAU-Math.PI;

export function drawRocket(
  g: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  velAng: number,
  burn: string | null,
  soon: string | null,
  att: {mode:string; up:number} | null,
  z?: number | null,
  alpha?: number | null
) {
  const want = (s:string)=> s==='retro' ? velAng+Math.PI : s==='up' ? att!.up : velAng;
  const mode = burn || soon || (att && att.mode) || 'pro';
  const target = mode==='up' ? att!.up : want(mode);
  const now=performance.now(), h=HEAD[key];
  let a=target, turning=0;
  if(h && now-h.t<400){
    const rate=3.2*(ANIM.fast?FAST:1)*(now-h.t)/1000, d=angNorm(target-h.a);
    a = Math.abs(d)<=rate ? target : h.a+Math.sign(d)*rate;
    turning=Math.abs(d)>0.25?Math.sign(d):0;
  }
  HEAD[key]={a,t:now};
  LAST_ROCKET.x=x; LAST_ROCKET.y=y; LAST_ROCKET.layer=g.canvas;
  g.save(); g.translate(x,y); g.rotate(-a);
  if(burn){
    const L=11+Math.random()*7, w=3.4+Math.random()*0.8;
    const gr=g.createLinearGradient(-9.5,0,-9.5-L,0);
    gr.addColorStop(0,'rgba(255,250,220,0.95)');
    gr.addColorStop(0.35,'rgba(255,190,80,0.9)');
    gr.addColorStop(1,'rgba(255,90,30,0)');
    g.fillStyle=gr; g.beginPath();
    g.moveTo(-9,-w*0.7);
    g.quadraticCurveTo(-9.5-L*0.45,-w,-9.5-L,0);
    g.quadraticCurveTo(-9.5-L*0.45,w,-9,w*0.7);
    g.closePath(); g.fill();
  }
  g.restore();
  if(rocketMode==='gl') glRocket(x,y,z||0,a,key,alpha);
  else if(rocketMode==='flat') rocketMesh(g,x,y,a,key);
  if(turning){
    g.save(); g.translate(x,y); g.rotate(-a);
    g.fillStyle='rgba(235,240,255,0.8)';
    const sy=turning>0?6.5:-6.5;
    for(let i=0;i<2;i++){
      g.beginPath();
      g.arc(5-i*2.5, sy*(1+i*0.4)+(Math.random()-0.5), 1.2+Math.random()*0.8,0,TAU);
      g.fill();
    }
    g.restore();
  }
}

export function rocketMesh(g: CanvasRenderingContext2D, x:number, y:number, a:number, key:string){
  const n=RKT.v.length/3, sc2=RKT.s*RKT_LEN/1.25, roll=rollOf(key);
  const cr=Math.cos(roll), sr=Math.sin(roll),
        ct=Math.cos(RKT_TILT), st=Math.sin(RKT_TILT),
        ca=Math.cos(a-Math.PI/2), sa=Math.sin(a-Math.PI/2);
  const X=new Float32Array(n), Y=new Float32Array(n), Z=new Float32Array(n);
  for(let i=0;i<n;i++){
    let px=RKT.v[3*i]*sc2, py=RKT.v[3*i+1]*sc2, pz=RKT.v[3*i+2]*sc2;
    let qx=px*cr+pz*sr, qz=-px*sr+pz*cr;
    let qy=py*ct-qz*st; qz=py*st+qz*ct;
    X[i]=qx*ca-qy*sa; Y[i]=qx*sa+qy*ca; Z[i]=qz;
  }
  const F=RKT.f, m=F.length/4, ord=new Array<number>(m), dep=new Float32Array(m);
  for(let k=0;k<m;k++){ ord[k]=k; dep[k]=Z[F[4*k]]+Z[F[4*k+1]]+Z[F[4*k+2]]; }
  ord.sort((p,q)=>dep[p]-dep[q]);
  const L:[number,number,number]=[-0.5,0.45,0.74];
  g.save(); g.lineJoin='round'; g.lineWidth=0.35;
  for(const k of ord){
    const A=F[4*k],B=F[4*k+1],C=F[4*k+2];
    const ux=X[B]-X[A], uy=Y[B]-Y[A], uz=Z[B]-Z[A],
          vx=X[C]-X[A], vy=Y[C]-Y[A], vz=Z[C]-Z[A];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const nl=Math.hypot(nx,ny,nz)||1;
    if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
    const d=Math.max(0,(nx*L[0]+ny*L[1]+nz*L[2])/nl),
          lum=0.32+0.78*d, c=RKT_PAL[F[4*k+3]];
    const col=`rgb(${Math.min(255,c[0]*lum)|0},${Math.min(255,c[1]*lum)|0},${Math.min(255,c[2]*lum)|0})`;
    g.fillStyle=col; g.strokeStyle=col;
    g.beginPath();
    g.moveTo(x+X[A],y-Y[A]); g.lineTo(x+X[B],y-Y[B]); g.lineTo(x+X[C],y-Y[C]);
    g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}
