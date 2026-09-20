// The three.js layer: spheres, rings, orbit ribbons, the rocket. None of it knows
// anything about the game being played.

import { tick } from '../events.js';
import { TAU } from '../basics.js';
import { bodyColor } from '../game/world.js';
import { CAPS, D2R, DESERT, EARTH_LAND, LAND, LIGHT, WATER, bodyLon0 } from './geometry.js';
import { cssVar, cvb, glc, layFor, prep } from './canvas.js';
import { RKT, RKT_HEX, RKT_LEN, RKT_TILT, rollOf } from './rocketdata.js';

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
export const GL = {on:false, state:'loading', why:'', T:null, r:null, mat:{}, mesh:{}, path:{}, ring:null, rocket:null};

export function glOff(why){
  if(GL.state==='off') return;
  GL.state='off'; GL.on=false; GL.T=null; GL.why=why||'';
  console.warn('3D view off:', why);
  glc.hidden=true; cvb.hidden=true;
  try{ tick(); }catch(e){}
}

// A note on the otherwise empty map area while three.js loads, or if it fails.
export function glNote(canvas,g,W,H){
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
function glRocketGeo(T){
  const n=RKT.f.length/4, pos=new Float32Array(n*9), col=new Float32Array(n*9), c=new T.Color();
  for(let k=0;k<n;k++){
    c.set(RKT_HEX[RKT.f[4*k+3]]);
    for(let j=0;j<3;j++){
      const vi=RKT.f[4*k+j], o=k*9+j*3;
      pos[o]=RKT.v[3*vi]*RKT.s; pos[o+1]=RKT.v[3*vi+1]*RKT.s; pos[o+2]=RKT.v[3*vi+2]*RKT.s;
      col[o]=c.r; col[o+1]=c.g; col[o+2]=c.b;
    }
  }
  const gm=new T.BufferGeometry();
  gm.setAttribute('position', new T.BufferAttribute(pos,3));
  gm.setAttribute('color', new T.BufferAttribute(col,3));
  gm.computeVertexNormals(); // unindexed: one normal per triangle, so faceted as before
  return gm;
}

const TEX_W = 1024, TEX_H = 512;

function texCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

// Longitude/latitude to pixels on the map. bodyLon0 is only applied when the sphere is rotated;
// the map itself is always centred on 0°.
const texX = lon => (lon+180)/360*TEX_W, texY = lat => (90-lat)/180*TEX_H;

function texPoly(g,pts,fill){
  g.fillStyle=fill;
  for(const dx of [-TEX_W,0,TEX_W]){ // drawn three times so nothing is cut off at the date line
    g.beginPath();
    pts.forEach(([lon,lat],i)=>{ const x=texX(lon)+dx, y=texY(lat); i?g.lineTo(x,y):g.moveTo(x,y); });
    g.closePath(); g.fill();
  }
}

// Polar cap: a solid area from the given latitude to the pole, soft edge only on the equator side.
// It must not fade towards the pole: the map is so compressed there that the fade turns into a glare.
function texCap(g,lat,alpha){
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
function texBands(g){
  [-0.45,-0.2,0.15,0.4].forEach((f,i)=>{
    const lat=a=>Math.asin(Math.max(-1,Math.min(1,a)))*180/Math.PI;
    const y0=texY(lat(f+0.09)), y1=texY(lat(f-0.09));
    const gr=g.createLinearGradient(0,y0,0,y1), c=i%2?'120,80,50':'255,240,220', a=i%2?0.38:0.28;
    gr.addColorStop(0,`rgba(${c},0)`); gr.addColorStop(0.5,`rgba(${c},${a})`); gr.addColorStop(1,`rgba(${c},0)`);
    g.fillStyle=gr; g.fillRect(0,y0,TEX_W,y1-y0);
  });
}

// The map of a body. With no features there is no map, and the base colour is enough.
function glSurface(T,b){
  const caps=CAPS[b]||[], gas=b==='jupiter'||b==='saturn', earth=b==='earth';
  if(!caps.length && !gas && !earth) return null;
  const col=bodyColor(b), cn=texCanvas(TEX_W,TEX_H), g=cn.getContext('2d');
  g.fillStyle=col; g.fillRect(0,0,TEX_W,TEX_H);
  if(earth){
    LAND.forEach((pts,i)=>texPoly(g,pts,EARTH_LAND(i)));
    DESERT.forEach(([pts,fill])=>texPoly(g,pts,fill));
    WATER.forEach(pts=>texPoly(g,pts,col)); // Binnenmeere wieder aufmachen
  }
  if(gas) texBands(g);
  caps.forEach(([lat,a])=>texCap(g,lat,a));
  const t=new T.CanvasTexture(cn); t.colorSpace=T.SRGBColorSpace; t.anisotropy=GL.aniso; return t;
}

// Saturn's ring: bands across the radius, transparent at the inner and outer edge. The Cassini
// division sits at just under two thirds, as it does in nature.
function glRingTexture(T){
  const N=512, cn=texCanvas(N,N), g=cn.getContext('2d'), c=N/2;
  const inner=0.614; // 1.35 of 2.2 Saturn radii: the ring does not start at the planet
  const band=(r0,r1,fill)=>{ g.beginPath(); g.arc(c,c,r1*c,0,TAU); g.arc(c,c,r0*c,0,TAU,true);
    g.fillStyle=fill; g.fill('evenodd'); };
  band(inner,1,'rgba(222,205,160,0.72)');
  band(inner,inner+0.06,'rgba(198,182,142,0.4)');   // inner, paler edge
  band(0.80,0.845,'rgba(0,0,0,0)');                  // Cassini division
  g.globalCompositeOperation='destination-out'; band(0.80,0.845,'rgba(0,0,0,0.85)');
  g.globalCompositeOperation='source-over';
  band(0.86,0.95,'rgba(236,224,190,0.5)');
  band(0.97,1,'rgba(200,186,150,0.25)');
  const t=new T.CanvasTexture(cn); t.colorSpace=T.SRGBColorSpace; t.anisotropy=GL.aniso; return t;
}

export function glInit(T){
  let r;
  try{ r=new T.WebGLRenderer({canvas:glc, alpha:true, antialias:true, powerPreference:'low-power'}); }
  catch(e){ glOff('no WebGL context'); return; }
  GL.T=T; GL.r=r;
  r.setClearAlpha(0);
  r.setPixelRatio(Math.min(2, window.devicePixelRatio||1)); // on mobile: at most 2
  r.autoClear=false;
  GL.aniso=Math.min(4, r.capabilities.getMaxAnisotropy());
  glc.addEventListener('webglcontextlost', e=>{ e.preventDefault(); glOff('WebGL-Kontext verloren'); });

  GL.scene=new T.Scene();
  GL.cam=new T.OrthographicCamera(-1,1,1,-1,1,4000);
  GL.cam.position.set(0,0,2000);
  // The light sits in the scene's space, i.e. in camera coordinates: exactly the LIGHT vector
  // from the 2D shading. The bodies hang in a rotated group, the light does not.
  const dl=new T.DirectionalLight(0xfff3e0, 1.25), amb=new T.AmbientLight(0x93a4d2, 0.2);
  dl.position.set(LIGHT[0]*500, LIGHT[1]*500, LIGHT[2]*500);
  GL.dl=dl; GL.amb=amb;
  GL.scene.add(dl, dl.target, amb);
  GL.root=new T.Group(); GL.scene.add(GL.root);   // rotated like the camera in makeCam/drawSys
  GL.flat=new T.Group(); GL.scene.add(GL.flat);   // unrotated: the rocket in screen coordinates

  // One sphere for every body. phiStart is chosen so longitude 0° points towards +Z;
  // each body's centre of view then comes from a rotation around Y.
  GL.sphere=new T.SphereGeometry(1, 64, 32, -Math.PI/2);
  GL.plane=new T.PlaneGeometry(2,2);
  GL.rocket=new T.Mesh(glRocketGeo(T), new T.MeshLambertMaterial({vertexColors:true, side:T.DoubleSide, transparent:true}));
  GL.rocket.scale.setScalar(RKT_LEN/1.25);
  GL.rocket.renderOrder=3; // after the orbit ribbons, so the faded far side does not sit on top
  GL.rocket.visible=false; GL.flat.add(GL.rocket);
  GL.qa=new T.Quaternion(); GL.qb=new T.Quaternion();
  GL.AX=new T.Vector3(1,0,0); GL.AY=new T.Vector3(0,1,0); GL.AZ=new T.Vector3(0,0,1);
  GL.on=true; GL.state='on';
  tick();
}

function glMat(key){
  if(GL.mat[key]) return GL.mat[key];
  const T=GL.T, map=glSurface(T,key);
  return GL.mat[key]=new T.MeshLambertMaterial(map?{map}:{color:new T.Color(bodyColor(key))});
}

function glBody(key){
  if(GL.mesh[key]) return GL.mesh[key];
  const m=new GL.T.Mesh(GL.sphere, glMat(key));
  m.rotation.y=-bodyLon0(key)*D2R; // turn the body's centre of view towards +Z
  GL.root.add(m); return GL.mesh[key]=m;
}

export function glSaturnRing(){
  if(GL.ring) return GL.ring;
  const T=GL.T;
  const mat=new T.MeshBasicMaterial({map:glRingTexture(T), transparent:true, side:T.DoubleSide, depthWrite:false});
  const m=new T.Mesh(GL.plane, mat);
  m.rotation.x=-Math.PI/2; // a plane lies in XY, the ring belongs in the equatorial plane XZ
  GL.root.add(m); return GL.ring=m;
}

// Begin a view: size the canvas to match the front 2D canvas, set up the camera in pixels
// and rotate the group the way makeCam and drawSys do.
// scale is the number of pixels per unit inside the group (drawBody: R, drawSys: 1).
export function glBegin(W,H,cx,cy,scale,el){
  if(!GL.on) return false;
  glc.hidden=false; cvb.hidden=false;
  layFor(glc,W,H);
  GL.r.setSize(W,H,false);
  const c=GL.cam; c.left=-W/2; c.right=W/2; c.top=H/2; c.bottom=-H/2; c.updateProjectionMatrix();
  GL.root.position.set(cx-W/2, H/2-cy, 0);
  GL.root.rotation.set(el,0,0);
  GL.root.scale.setScalar(scale);
  GL.flat.position.set(-W/2, H/2, 0);
  for(const k in GL.mesh) GL.mesh[k].visible=false;
  for(const k in GL.path){ GL.path[k].ghost.visible=false; GL.path[k].solid.visible=false; }
  if(GL.ring) GL.ring.visible=false;
  GL.rocket.visible=false;
  return true;
}

// Place a body somewhere in the group (p in group coordinates, r in group units)
export function glPut(key,p,r){
  const m=glBody(key); m.visible=true; m.scale.setScalar(r);
  m.position.set(p?p[0]:0, p?p[1]:0, p?p[2]:0);
  return m;
}

// Orbits and flight paths as narrow ribbons of triangles. WebGL cannot widen lines (always 1 px),
// while a ribbon has exactly the width and dash pattern of the old 2D path.
// The maths runs in screen coordinates plus depth, so the same projection as in 2D.
function glPathGeo(pts,w,dash){
  const out=[], hw=w/2;
  let on=true, rem=dash?dash[0]:Infinity;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1];
    const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy);
    if(!(L>1e-6)) continue;
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
  }
  return out;
}

// Two passes: faded without a depth test (the far side shows dimmed through the body, as before),
// then the full one with a depth test. That way the rocket hides the orbit and the other way round.
export function glPath(key,pts,style){
  const T=GL.T, tri=glPathGeo(pts, style.w||1, style.dash||null), n=tri.length/3;
  let o=GL.path[key];
  if(!o){
    const gm=new T.BufferGeometry();
    const mk=(test,order)=>{ const m=new T.Mesh(gm,new T.MeshBasicMaterial({transparent:true,depthTest:test,depthWrite:test,side:T.DoubleSide}));
      m.renderOrder=order; m.frustumCulled=false; GL.flat.add(m); return m; };
    o=GL.path[key]={gm, ghost:mk(false,1), solid:mk(true,2), cap:0};
  }
  if(o.cap<n){ o.cap=Math.max(n,512); o.gm.setAttribute('position', new T.BufferAttribute(new Float32Array(o.cap*3),3)); }
  const at=o.gm.getAttribute('position');
  at.array.set(tri); at.needsUpdate=true; o.gm.setDrawRange(0,n);
  const a=style.a==null?1:style.a;
  o.ghost.material.color.set(style.col); o.ghost.material.opacity=a*(style.ghost==null?0.35:style.ghost);
  o.solid.material.color.set(style.col); o.solid.material.opacity=a;
  o.ghost.visible=o.solid.visible=n>0;
}

// Rocket in screen coordinates: x,y as on the 2D canvas, z the real depth in pixels so the body
// hides it piece by piece. a is the screen angle of the nose.
export function glRocket(x,y,z,a,key,alpha){
  const m=GL.rocket, r=rollOf(key);
  m.visible=true; m.position.set(x,-y,z);
  m.material.opacity=alpha==null?1:alpha;
  GL.qa.setFromAxisAngle(GL.AY, r);
  GL.qb.setFromAxisAngle(GL.AX, RKT_TILT); GL.qa.premultiply(GL.qb);
  GL.qb.setFromAxisAngle(GL.AZ, a-Math.PI/2); GL.qa.premultiply(GL.qb);
  m.quaternion.copy(GL.qa);
}

export function glEnd(){ if(!GL.on) return; GL.r.clear(); GL.r.render(GL.scene, GL.cam); }

export function glHide(){ glc.hidden=true; cvb.hidden=true; }
