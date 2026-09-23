import { ANIM, FAST, TAU } from '../basics.js';
import { RKT, RKT_FACES, RKT_LEN, RKT_TILT, rollOf } from './rocketdata.js';
import { glRocket } from './gl.js';
import type { Attitude, Burn } from './geometry.js';

const HEAD: Record<string, {a:number; t:number} | undefined> = {};

export type RocketMode = 'gl'|'flat';
export let rocketMode: RocketMode = 'gl';
export function setRocketMode(art: RocketMode) { rocketMode=art; }
export const LAST_ROCKET: {x:number; y:number; layer: HTMLElement|null} = {x:0, y:0, layer:null};

const angNorm = (a:number) => ((a+Math.PI)%TAU+TAU)%TAU-Math.PI;

export function drawRocket(
  g: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  velAng: number,
  burn: Burn,
  soon: Burn,
  att: Attitude | null,
  z?: number | null,
  alpha?: number | null
) {
  const mode = burn || soon || att?.mode || 'pro';
  const target = att && mode==='up' ? att.up : mode==='retro' ? velAng+Math.PI : velAng;
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
  const sc2=RKT.s*RKT_LEN/1.25, roll=rollOf(key);
  const cr=Math.cos(roll), sr=Math.sin(roll),
        ct=Math.cos(RKT_TILT), st=Math.sin(RKT_TILT),
        ca=Math.cos(a-Math.PI/2), sa=Math.sin(a-Math.PI/2);
// roll around the long axis, tilt towards the viewer, turn to the screen angle
  const proj=(v:[number,number,number]):[number,number,number]=>{
    const px=v[0]*sc2, py=v[1]*sc2, pz=v[2]*sc2;
    const qx=px*cr+pz*sr; let qz=-px*sr+pz*cr;
    const qy=py*ct-qz*st; qz=py*st+qz*ct;
    return [qx*ca-qy*sa, qx*sa+qy*ca, qz];
  };
  const tris=RKT_FACES.map(f=>{ const A=proj(f.v[0]), B=proj(f.v[1]), C=proj(f.v[2]); return {A,B,C,rgb:f.rgb,dep:A[2]+B[2]+C[2]}; });
  tris.sort((p,q)=>p.dep-q.dep);
  const L:[number,number,number]=[-0.5,0.45,0.74];
  g.save(); g.lineJoin='round'; g.lineWidth=0.35;
  for(const {A,B,C,rgb:c} of tris){
    const ux=B[0]-A[0], uy=B[1]-A[1], uz=B[2]-A[2],
          vx=C[0]-A[0], vy=C[1]-A[1], vz=C[2]-A[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const nl=Math.hypot(nx,ny,nz)||1;
    if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
    const d=Math.max(0,(nx*L[0]+ny*L[1]+nz*L[2])/nl),
          lum=0.32+0.78*d;
    const col=`rgb(${Math.min(255,c[0]*lum)|0},${Math.min(255,c[1]*lum)|0},${Math.min(255,c[2]*lum)|0})`;
    g.fillStyle=col; g.strokeStyle=col;
    g.beginPath();
    g.moveTo(x+A[0],y-A[1]); g.lineTo(x+B[0],y-B[1]); g.lineTo(x+C[0],y-C[1]);
    g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}
