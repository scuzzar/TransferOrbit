// The three drawing layers (2D behind, three.js, 2D in front) and their helpers.

import { $, isDesk } from '../basics.js';
import { POST_BY_ID } from '../game/world.js';
import { S, cargoOrders } from '../game/state.js';

export const cv=$('cv'), ctx=cv.getContext('2d');

export const sc=$('sys'), sctx=sc.getContext('2d');

export const cvb=$('cvb'), bctx=cvb.getContext('2d'), glc=$('glc'); // the rear 2D layer and the three.js layer

export const HITS=[];
// Drop the hit targets of one layer; without an argument, all of them.
export function clearHits(ebene){
  if(!ebene){ HITS.length=0; return; }
  for(let i=HITS.length-1;i>=0;i--) if(HITS[i].canvas===ebene) HITS.splice(i,1);
}

// Fit the canvas to the space: full width on mobile, on desktop as large as width and window height allow
export function fitCanvas(canvas, aspect){
  const st=$('stage'); let W=st.clientWidth;
  if(W<1){ const cw=parseFloat(canvas.style.width)||0; return [cw, cw/aspect]; } // hidden: keep the size
  if(isDesk()){ const h=st.clientHeight; if(h>60) W=Math.min(W, h*aspect); }
  W=Math.max(0,Math.floor(W)); const H=Math.floor(W/aspect);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  return [W,H];
}

export const moveProg = () => { const m=S.move; if(!m) return 0; return m.d1>m.d0 ? Math.max(0,Math.min(1,(S.day-m.d0)/(m.d1-m.d0))) : 1; };

// Point on a quadratic Bezier curve, plus its direction
function bezier(P0,C,P1,t){ const u=1-t;
  return {x:u*u*P0[0]+2*u*t*C[0]+t*t*P1[0], y:u*u*P0[1]+2*u*t*C[1]+t*t*P1[1],
    dx:2*u*(C[0]-P0[0])+2*t*(P1[0]-C[0]), dy:2*u*(C[1]-P0[1])+2*t*(P1[1]-C[1])}; }

function drawPath(g,P0,C,P1,col){ g.save(); g.strokeStyle=col; g.globalAlpha=.55; g.setLineDash([3,4]); g.lineWidth=1.5; g.beginPath(); g.moveTo(P0[0],P0[1]); g.quadraticCurveTo(C[0],C[1],P1[0],P1[1]); g.stroke(); g.restore(); }

export const isPick = p => { const q=S.ui.pick; if(!q||!p||q.type!==p.type) return false;
  return q.type==='planet'?q.planet===p.planet : q.type==='body'?q.body===p.body : q.node===p.node && (q.site||null)===(p.site||null); };

export const cargoTo = test => cargoOrders().filter(o=>test(POST_BY_ID[o.to]));

function shipGlyph(g,x,y,ang,col){ g.save(); g.translate(x,y); g.rotate(-ang); g.fillStyle=col; g.beginPath(); g.moveTo(7,0); g.lineTo(-5,4.5); g.lineTo(-3,0); g.lineTo(-5,-4.5); g.closePath(); g.fill(); g.restore(); }

export function prep(canvas,g,W,H){ const dpr=window.devicePixelRatio||1;
  if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){ canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); }
  g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H); }

// The position of the rear layers comes from .cwrap, so only the size is set here.
export function layFor(layer,W,H){ layer.style.width=W+'px'; layer.style.height=H+'px'; }

export function prepBack(W,H){ layFor(cvb,W,H); prep(cvb,bctx,W,H); }

export const cssVar = () => { const css=getComputedStyle(document.documentElement); return n=>css.getPropertyValue(n).trim(); };
