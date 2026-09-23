// The three.js layer: spheres, rings, orbit ribbons, the rocket. None of it knows
// anything about the game being played.

import type * as THREE from 'three';
import { tick } from '../events.js';
import { TAU } from '../basics.js';
import { BodyId, bodyColor } from '../game/world.js';
import { D2R, bodyLon0 } from './geometry.js';
import { CAPS, DESERT, EARTH_LAND, LAND, LIGHT, WATER } from './surface.js';
import { cssVar, cvb, glc, layFor, prep } from './canvas.js';
import { RKT, RKT_FACES, RKT_LEN, RKT_TILT, rollOf } from './rocketdata.js';

// three.js draws the bodies only: textured spheres, Saturn's ring and the rocket model.
// Labels, orbits, markers, flames and the hit targets stay on the 2D canvases.
// The stack is #cvb (2D behind) - #glc (three.js) - #cv or #sys (2D in front).
// The camera is orthographic and works in screen pixels, with the same values as makeCam
// and drawSys, so 2D and 3D line up exactly.
// Without three.js the map stays empty. Keeping a second, poorer rendering alongside would
// be misleading: you would see something without knowing it is not the real view.
// No foreign textures: the surfaces are built in the browser from data the game already has -
// hand-drawn continents, polar caps, gas giant bands, Saturn's ring. That way the 3D layer
// loads not a single image and runs inside a locked iframe without any origin trouble.
type Three = typeof THREE;
export const GL: { on:boolean; state:'loading'|'on'|'off'; why:string } = {on:false, state:'loading', why:''};

// Two passes of one ribbon share the geometry, see glPath
type RibbonMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
interface Ribbon { gm:THREE.BufferGeometry; at:THREE.BufferAttribute|null; ghost:RibbonMesh; solid:RibbonMesh; cap:number }
// Everything three.js built. Only there while GL.on; glOff() drops it.
interface Scene3D {
  T:Three; r:THREE.WebGLRenderer; scene:THREE.Scene; cam:THREE.OrthographicCamera;
  root:THREE.Group; flat:THREE.Group; sphere:THREE.SphereGeometry; plane:THREE.PlaneGeometry;
  rocket:THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  qa:THREE.Quaternion; qb:THREE.Quaternion; AX:THREE.Vector3; AY:THREE.Vector3; AZ:THREE.Vector3; aniso:number;
  mat:Partial<Record<BodyId, THREE.MeshLambertMaterial>>; mesh:Partial<Record<BodyId, THREE.Mesh>>; path:Record<string, Ribbon>; ring:THREE.Mesh|null;
}
let G: Scene3D|null = null;
const glcEl:HTMLCanvasElement = glc as HTMLCanvasElement;

export function glOff(why:string){
  if(GL.state==='off') return;
  GL.state='off'; GL.on=false; G=null; GL.why=why||'';
  console.warn('3D view off:', why);
  glcEl.hidden=true; cvb.hidden=true;
  try{ tick(); }catch(e){}
}

// A note on the otherwise empty map area while three.js loads, or if it fails.
export function glNote(canvas:HTMLCanvasElement,g:CanvasRenderingContext2D,W:number,H:number){
  prep(canvas,g,W,H); glHide();
  const v=cssVar(), loading=GL.state==='loading';
  g.textAlign='center'; g.textBaseline='middle'; g.fillStyle=v('--muted');
  g.font=`600 15px 'Saira Semi Condensed','Arial Narrow',sans-serif`;
  g.fillText(loading?'Loading the 3D view …':'This map needs WebGL.', W/2, H/2-8);
  if(!loading){
    g.font=`400 12.5px 'Saira Semi Condensed','Arial Narrow',sans-serif`;
    g.fillText(GL.why||'This browser provides no 3D graphics.', W/2, H/2+14);
    g.fillText('Orders, route planner and autopilot still work.', W/2, H/2+32);
  }
}

// Rocket: the same data as the hand-rolled 2D renderer, only as a triangle mesh with vertex colours.
function glRocketGeo(T:Three){
  const n=RKT_FACES.length, pos=new Float32Array(n*9), col=new Float32Array(n*9), c=new T.Color();
  RKT_FACES.forEach((f,k)=>{
    c.set(f.hex);
    f.v.forEach((v,j)=>{
      const o=k*9+j*3;
      pos[o]=v[0]*RKT.s; pos[o+1]=v[1]*RKT.s; pos[o+2]=v[2]*RKT.s;
      col[o]=c.r; col[o+1]=c.g; col[o+2]=c.b;
    });
  });
  const gm=new T.BufferGeometry();
  gm.setAttribute('position', new T.BufferAttribute(pos,3));
  gm.setAttribute('color', new T.BufferAttribute(col,3));
  gm.computeVertexNormals(); // unindexed: one normal per triangle, so faceted as before
  return gm;
}

const TEX_W = 1024, TEX_H = 512;

function texCanvas(w:number,h:number){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

// Longitude/latitude to pixels on the map. bodyLon0 is only applied when the sphere is rotated;
// the map itself is always centred on 0°.
const texX = (lon:number) => (lon+180)/360*TEX_W, texY = (lat:number) => (90-lat)/180*TEX_H;

function texPoly(g:CanvasRenderingContext2D,pts:[number,number][],fill:string){
  g.fillStyle=fill;
  for(const dx of [-TEX_W,0,TEX_W]){ // drawn three times so nothing is cut off at the date line
    g.beginPath();
    pts.forEach((pt,i)=>{ const x=texX(pt[0])+dx, y=texY(pt[1]); i?g.lineTo(x,y):g.moveTo(x,y); });
    g.closePath(); g.fill();
  }
}

// Polar cap: a solid area from the given latitude to the pole, soft edge only on the equator side.
// It must not fade towards the pole: the map is so compressed there that the fade turns into a glare.
function texCap(g:CanvasRenderingContext2D,lat:number,alpha:number){
  // The soft edge scales with the cap itself: a fixed share of the map height would be wider than
  // half of a 10° cap like the one on Mars, blurring it into a haze.
  const col='236,240,246', y=texY(lat), pole=lat>0?0:TEX_H;
  const soft=(lat>0?1:-1)*Math.max(2, Math.abs(y-pole)*0.2);
  g.fillStyle=`rgba(${col},${alpha})`;
  g.fillRect(0, Math.min(y,pole), TEX_W, Math.abs(y-pole));
  const gr=g.createLinearGradient(0,y,0,y+soft);
  gr.addColorStop(0,`rgba(${col},${alpha})`); gr.addColorStop(1,`rgba(${col},0)`);
  g.fillStyle=gr; g.fillRect(0, Math.min(y,y+soft), TEX_W, Math.abs(soft));
}

// Gas giant bands: the same four layers as in the 2D shading, given there as a share of the
// radius, i.e. as the sine of the latitude.
function texBands(g:CanvasRenderingContext2D){
  [-0.45,-0.2,0.15,0.4].forEach((f,i)=>{
    const lat=(a:number)=>Math.asin(Math.max(-1,Math.min(1,a)))*180/Math.PI;
    const y0=texY(lat(f+0.09)), y1=texY(lat(f-0.09));
    const gr=g.createLinearGradient(0,y0,0,y1), c=i%2?'120,80,50':'255,240,220', a=i%2?0.38:0.28;
    gr.addColorStop(0,`rgba(${c},0)`); gr.addColorStop(0.5,`rgba(${c},${a})`); gr.addColorStop(1,`rgba(${c},0)`);
    g.fillStyle=gr; g.fillRect(0,y0,TEX_W,y1-y0);
  });
}

// The map of a body. With no features there is no map, and the base colour is enough.
function glSurface({T,aniso}:Scene3D,b:BodyId){
  const caps=CAPS[b]||[], gas=b==='jupiter'||b==='saturn', earth=b==='earth';
  if(!caps.length && !gas && !earth) return null;
  const col=bodyColor(b), cn=texCanvas(TEX_W,TEX_H), g=cn.getContext('2d')!;
  g.fillStyle=col; g.fillRect(0,0,TEX_W,TEX_H);
  if(earth){
    LAND.forEach((pts,i)=>texPoly(g,pts,EARTH_LAND(i)));
    DESERT.forEach(([pts,fill])=>texPoly(g,pts,fill));
    WATER.forEach(pts=>texPoly(g,pts,col)); // open the inland seas up again
  }
  if(gas) texBands(g);
  caps.forEach(([lat,a])=>texCap(g,lat,a));
  const t=new T.CanvasTexture(cn); t.colorSpace=T.SRGBColorSpace; t.anisotropy=aniso; return t;
}

// Saturn's ring: bands across the radius, transparent at the inner and outer edge. The Cassini
// division sits at just under two thirds, as it does in nature.
function glRingTexture({T,aniso}:Scene3D){
  const N=512, cn=texCanvas(N,N), g=cn.getContext('2d')!, c=N/2;
  const inner=0.614; // 1.35 of 2.2 Saturn radii: the ring does not start at the planet
  const band=(r0:number,r1:number,fill:string)=>{ g.beginPath(); g.arc(c,c,r1*c,0,TAU); g.arc(c,c,r0*c,0,TAU,true);
    g.fillStyle=fill; g.fill('evenodd'); };
  band(inner,1,'rgba(222,205,160,0.72)');
  band(inner,inner+0.06,'rgba(198,182,142,0.4)');   // inner, paler edge
  band(0.80,0.845,'rgba(0,0,0,0)');                  // Cassini division
  g.globalCompositeOperation='destination-out'; band(0.80,0.845,'rgba(0,0,0,0.85)');
  g.globalCompositeOperation='source-over';
  band(0.86,0.95,'rgba(236,224,190,0.5)');
  band(0.97,1,'rgba(200,186,150,0.25)');
  const t=new T.CanvasTexture(cn); t.colorSpace=T.SRGBColorSpace; t.anisotropy=aniso; return t;
}

export function glInit(T:Three){
  let r:THREE.WebGLRenderer;
  try{ r=new T.WebGLRenderer({canvas:glcEl, alpha:true, antialias:true, powerPreference:'low-power'}); }
  catch(e){ glOff('no WebGL context'); return; }
  r.setClearAlpha(0);
  r.setPixelRatio(Math.min(2, window.devicePixelRatio||1)); // on mobile: at most 2
  r.autoClear=false;
  glcEl.addEventListener('webglcontextlost', (e:Event)=>{ e.preventDefault(); glOff('WebGL context lost'); });

  const scene=new T.Scene(), cam=new T.OrthographicCamera(-1,1,1,-1,1,4000);
  cam.position.set(0,0,2000);
  // The light sits in the scene's space, i.e. in camera coordinates: exactly the LIGHT vector
  // from the 2D shading. The bodies hang in a rotated group, the light does not.
  const dl=new T.DirectionalLight(0xfff3e0, 1.25), amb=new T.AmbientLight(0x93a4d2, 0.2);
  dl.position.set(LIGHT[0]*500, LIGHT[1]*500, LIGHT[2]*500);
  scene.add(dl, dl.target, amb);
  const root=new T.Group(); scene.add(root);   // rotated like the camera in makeCam/drawSys
  const flat=new T.Group(); scene.add(flat);   // unrotated: the rocket in screen coordinates

  const rocket=new T.Mesh(glRocketGeo(T), new T.MeshLambertMaterial({vertexColors:true, side:T.DoubleSide, transparent:true}));
  rocket.scale.setScalar(RKT_LEN/1.25);
  rocket.renderOrder=3; // after the orbit ribbons, so the faded far side does not sit on top
  rocket.visible=false; flat.add(rocket);
  G={T, r, scene, cam, root, flat, rocket,
  // One sphere for every body. phiStart is chosen so longitude 0° points towards +Z;
  // each body's centre of view then comes from a rotation around Y.
    sphere:new T.SphereGeometry(1, 64, 32, -Math.PI/2), plane:new T.PlaneGeometry(2,2),
    qa:new T.Quaternion(), qb:new T.Quaternion(), AX:new T.Vector3(1,0,0), AY:new T.Vector3(0,1,0), AZ:new T.Vector3(0,0,1),
    aniso:Math.min(4, r.capabilities.getMaxAnisotropy()), mat:{}, mesh:{}, path:{}, ring:null};
  GL.on=true; GL.state='on';
  tick();
}

function glMat(G:Scene3D,key:BodyId){
  if(G.mat[key]) return G.mat[key];
  const T=G.T, map=glSurface(G,key);
  return G.mat[key]=new T.MeshLambertMaterial(map?{map}:{color:new T.Color(bodyColor(key))});
}

function glBody(G:Scene3D,key:BodyId){
  if(G.mesh[key]) return G.mesh[key];
  const m=new G.T.Mesh(G.sphere, glMat(G,key));
  m.rotation.y=-bodyLon0(key)*D2R; // turn the body's centre of view towards +Z
  G.root.add(m); return G.mesh[key]=m;
}

// Saturn's ring, d across in group units
export function glSaturnRing(d:number){
  if(!G) return;
  if(!G.ring){
    const T=G.T, mat=new T.MeshBasicMaterial({map:glRingTexture(G), transparent:true, side:T.DoubleSide, depthWrite:false});
    G.ring=new T.Mesh(G.plane, mat);
    G.ring.rotation.x=-Math.PI/2; // a plane lies in XY, the ring belongs in the equatorial plane XZ
    G.root.add(G.ring);
  }
  G.ring.visible=true; G.ring.scale.set(d,d,1);
}

// Begin a view: size the canvas to match the front 2D canvas, set up the camera in pixels
// and rotate the group the way makeCam and drawSys do.
// scale is the number of pixels per unit inside the group (drawBody: R, drawSys: 1).
export function glBegin(W:number,H:number,cx:number,cy:number,scale:number,el:number){
  if(!G) return false;
  glcEl.hidden=false; cvb.hidden=false;
  layFor(glcEl,W,H);
  G.r.setSize(W,H,false);
  const c=G.cam; c.left=-W/2; c.right=W/2; c.top=H/2; c.bottom=-H/2; c.updateProjectionMatrix();
  G.root.position.set(cx-W/2, H/2-cy, 0);
  G.root.rotation.set(el,0,0);
  G.root.scale.setScalar(scale);
  G.flat.position.set(-W/2, H/2, 0);
  for(const m of Object.values(G.mesh)) m.visible=false;
  for(const o of Object.values(G.path)){ o.ghost.visible=false; o.solid.visible=false; }
  if(G.ring) G.ring.visible=false;
  G.rocket.visible=false;
  return true;
}

// Place a body somewhere in the group (p in group coordinates, r in group units)
export function glPut(key:BodyId,p:[number,number,number]|null,r:number){
  if(!G) return;
  const m=glBody(G,key); m.visible=true; m.scale.setScalar(r);
  m.position.set(p?p[0]:0, p?p[1]:0, p?p[2]:0);
}

// Orbits and flight paths as narrow ribbons of triangles. WebGL cannot widen lines (always 1 px),
// while a ribbon has exactly the width and dash pattern of the old 2D path.
// The maths runs in screen coordinates plus depth, so the same projection as in 2D.
type PathPt = {x:number;y:number;z:number};
function glPathGeo(pts:PathPt[],w:number,dash:[number,number]|null){
  const out:number[]=[], hw=w/2;
  let on=true, rem=dash?dash[0]:Infinity;
  const segment=(a:PathPt, b:PathPt)=>{
    const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy);
    if(!(L>1e-6)) return;
    const ux=dx/L, uy=dy/L, nx=-uy*hw, ny=ux*hw;
    let t=0;
    while(t<L-1e-9){
      const step=Math.min(L-t, rem);
      if(on){
        const s0=t/L, s1=(t+step)/L;
        const ax=a.x+dx*s0, ay=a.y+dy*s0, az=a.z+(b.z-a.z)*s0;
        const bx=a.x+dx*s1, by=a.y+dy*s1, bz=a.z+(b.z-a.z)*s1;
        out.push(ax-nx,-(ay-ny),az,  ax+nx,-(ay+ny),az,  bx+nx,-(by+ny),bz,
                 ax-nx,-(ay-ny),az,  bx+nx,-(by+ny),bz,  bx-nx,-(by-ny),bz);
      }
      t+=step; rem-=step;
      if(dash && rem<=1e-9){ on=!on; rem=on?dash[0]:dash[1]; }
    }
  };
  let a=pts[0];
  for(const b of pts.slice(1)){ if(a) segment(a,b); a=b; }
  return out;
}

// Two passes: faded without a depth test (the far side shows dimmed through the body, as before),
// then the full one with a depth test. That way the rocket hides the orbit and the other way round.
export type PathStyle = { w?:number; dash?:[number,number]; a?:number; col:string; ghost?:number };
export function glPath(key:string,pts:PathPt[],style:PathStyle){
  if(!G) return;
  const {T,flat}=G, tri=glPathGeo(pts, style.w||1, style.dash||null), n=tri.length/3;
  let o=G.path[key];
  if(!o){
    const gm=new T.BufferGeometry();
    const mk=(test:boolean,order:number)=>{ const m=new T.Mesh(gm,new T.MeshBasicMaterial({transparent:true,depthTest:test,depthWrite:test,side:T.DoubleSide}));
      m.renderOrder=order; m.frustumCulled=false; flat.add(m); return m; };
    o=G.path[key]={gm, at:null, ghost:mk(false,1), solid:mk(true,2), cap:0};
  }
  if(!o.at || o.cap<n){ o.cap=Math.max(n,512); o.at=new T.BufferAttribute(new Float32Array(o.cap*3),3); o.gm.setAttribute('position', o.at); }
  o.at.array.set(tri); o.at.needsUpdate=true; o.gm.setDrawRange(0,n);
  const a=style.a==null?1:style.a;
  o.ghost.material.color.set(style.col); o.ghost.material.opacity=a*(style.ghost==null?0.35:style.ghost);
  o.solid.material.color.set(style.col); o.solid.material.opacity=a;
  o.ghost.visible=o.solid.visible=n>0;
}

// Rocket in screen coordinates: x,y as on the 2D canvas, z the real depth in pixels so the body
// hides it piece by piece. a is the screen angle of the nose.
export function glRocket(x:number,y:number,z:number,a:number,key:string,alpha?:number|null){
  if(!G) return;
  const m=G.rocket, r=rollOf(key), {qa,qb}=G;
  m.visible=true; m.position.set(x,-y,z);
  m.material.opacity=alpha??1;
  qa.setFromAxisAngle(G.AY, r);
  qb.setFromAxisAngle(G.AX, RKT_TILT); qa.premultiply(qb);
  qb.setFromAxisAngle(G.AZ, a-Math.PI/2); qa.premultiply(qb);
  m.quaternion.copy(qa);
}

export function glEnd(){ if(!G) return; G.r.clear(); G.r.render(G.scene, G.cam); }

export function glHide(){ glcEl.hidden=true; cvb.hidden=true; }
