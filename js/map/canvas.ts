// The three drawing layers (2D behind, three.js, 2D in front) and their helpers.

import { byId, ctx2d, isDesk } from '../basics.js';
import { POST_BY_ID, Post } from '../game/world.js';
import { S, cargoOrders } from '../game/state.js';
import { SCENE } from './geometry.js';
import { UI, Pick } from '../ui/state.js';

const el = (id:string) => byId(id,HTMLCanvasElement);

export const cv=el('cv'), ctx=ctx2d(cv);

export const sc=el('sys'), sctx=ctx2d(sc);

export const cvb=el('cvb'), bctx=ctx2d(cvb), glc=el('glc'); // the rear 2D layer and the three.js layer

export interface Hit { canvas:HTMLCanvasElement; x:number; y:number; r:number; pick:Pick }
export const HITS:Hit[]=[];
// Drop the hit targets of one layer; without an argument, all of them.
export function clearHits(layer?:HTMLCanvasElement){
  if(!layer){ HITS.length=0; return; }
  for(let i=HITS.length-1;i>=0;i--) if(HITS[i]?.canvas===layer) HITS.splice(i,1);
}

// Fit the canvas to the space: full width on mobile, on desktop as large as width and window height allow
export function fitCanvas(canvas:HTMLCanvasElement, aspect:number):[number,number]{
  const st=byId('stage',HTMLElement); let W=st.clientWidth;
  if(W<1){ const cw=parseFloat(canvas.style.width)||0; return [cw, cw/aspect]; } // hidden: keep the size
  if(isDesk()){ const h=st.clientHeight; if(h>60) W=Math.min(W, h*aspect); }
  W=Math.max(0,Math.floor(W)); const H=Math.floor(W/aspect);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  return [W,H];
}

export const moveProg = () => { const m=SCENE.move; if(!m) return 0; return m.d1>m.d0 ? Math.max(0,Math.min(1,(S.domain.day-m.d0)/(m.d1-m.d0))) : 1; };

export function isPick(p:Pick){
  const q=UI.pick; if(!q) return false;
  if(q.type==='planet') return p.type==='planet' && q.planet===p.planet;
  if(q.type==='body') return p.type==='body' && q.body===p.body;
  return p.type==='node' && q.node===p.node && (q.site||null)===(p.site||null);
}

export const cargoTo = (test:(p:Post)=>boolean) => cargoOrders().filter(o=>test(POST_BY_ID[o.to]));

export function prep(canvas:HTMLCanvasElement,g:CanvasRenderingContext2D,W:number,H:number){ const dpr=window.devicePixelRatio||1;
  if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){ canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); }
  g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H); }

// The position of the rear layers comes from .cwrap, so only the size is set here.
export function layFor(layer:HTMLElement,W:number,H:number){ layer.style.width=W+'px'; layer.style.height=H+'px'; }

export function prepBack(W:number,H:number){ layFor(cvb,W,H); prep(cvb,bctx,W,H); }

export const cssVar = () => { const css=getComputedStyle(document.documentElement); return (n:string)=>css.getPropertyValue(n).trim(); };
