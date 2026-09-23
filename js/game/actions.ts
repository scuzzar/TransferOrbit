// Which manoeuvres are possible from here. A pure query, changes nothing.

import { B, BANKRUPT, BodyId, LAUNCH_FEE, M, NodeId, ROT, SITES, fmtCr, hasAtm, hasDepot, isMoon, latStr, moonsOf, rotPenalty, siteOf } from './world.js';
import { HOP_FEE_SHARE, bodyDown, bodyUp, captDv, hopCost } from './physics.js';
import { S, cargoMass, eng, here } from './state.js';

export interface LocalAction {
  label:string; dv:number; days:number; to:NodeId;
  site?:string|null; lat?:number; note?:string; fee?:number; hop?:boolean; aero?:boolean;
}
type ActionExtra = Omit<LocalAction,'label'|'dv'|'days'|'to'>;

export function localActions(): LocalAction[]{
  const [k,l]=here(); const A:LocalAction[]=[];
  const add=(label:string,dv:number,days:number,to:NodeId,x:ActionExtra={})=>A.push({label,dv,days,to,...x});
  if(!k) return A;
  const landings=(body:BodyId,down:number)=>{
    (SITES[body]||[]).forEach(st=>{
      const pen=hasAtm(body)?0:rotPenalty(body,st.lat);
      const bits=[latStr(st.lat)];
      if(st.port) bits.push('Spaceport');
      if(st.depot) bits.push(`Fuel depot (${st.depot} days)`);
      add(`Land at ${st.name}`,down+pen,0.2,`${body}.surf`,{site:st.id,lat:st.lat,note:bits.join(', ')+(st.note?`. ${st.note}`:'')});
    });
  };
  const launch=(body:BodyId)=>{
    const st=siteOf(body,S.domain.site), lat=st?st.lat:0, pen=rotPenalty(body,lat), rot=ROT[body]||0;
    const rotNote=rot>=20 ? `Launching at ${latStr(lat)}: ${Math.round(rot-pen)} of ${rot} m/s rotation bonus` : '';
    return {lat,pen,rotNote};
  };
  if(l==='surf' && S.domain.site) (SITES[k]||[]).forEach(st=>{
    if(st.id===S.domain.site) return;
    const h=hopCost(k,S.domain.site,st.id), full=bodyUp(k)+bodyDown(k);
    const fee=h.launcher?Math.round(LAUNCH_FEE*(eng().dry+cargoMass()+S.domain.fuel)*HOP_FEE_SHARE):0;
    add(`${h.launcher?'Suborbital flight':'Ballistic hop'} to ${st.name}`,h.dv,h.days,`${k}.surf`,{site:st.id,lat:st.lat,hop:true,...(fee?{fee}:{}),
      note:`${Math.round(h.th*180/Math.PI)}° arc${h.launcher?`, fee ${fmtCr(fee)}`:`, ${Math.round((1-h.dv/full)*100)}% cheaper than going via orbit`}`});
  });
  if(isMoon(k)){
    const m=M[k], p=m.parent;
    if(l==='surf'){ const L=launch(k); add(`Ascend to ${m.orbitName||'orbit around '+m.name}`,m.up+L.pen,0.2,`${k}.orbit`,{note:[m.upNote,L.rotNote].filter(Boolean).join('. '),lat:L.lat}); }
    else {
      landings(k,m.down);
      add(`Back to high orbit of ${B[p].name}`,m.xfer,m.days,`${p}.capt`);
    }
  } else {
    const b=B[k], sf=b.surf;
    if(l==='surf' && sf){
      const L=launch(k);
      if(sf.launcher){ const fee=Math.round(LAUNCH_FEE*(eng().dry+cargoMass()+S.domain.fuel));
        add('Ride a launcher to orbit',L.pen,1,`${k}.orbit`,{lat:L.lat,fee,note:`Launch fee ${fmtCr(fee)}${fee>S.domain.credits?', deferred':''}. The missing rotation bonus comes out of your tank. ${L.rotNote}`}); }
      else add('Ascend to orbit',sf.up+L.pen,0.2,`${k}.orbit`,{lat:L.lat,note:L.rotNote});
    }
    if(l==='orbit'){
      if(b.surf) landings(k,b.surf.down);
      add('Up to high orbit',captDv(k),1,`${k}.capt`,{note:'Starting point for transfers and for the moons'});
    }
    if(l==='capt'){
      add('Down to low orbit',captDv(k),1,`${k}.orbit`);
      if(b.atm) add('Aerobrake into low orbit',60,40,`${k}.orbit`,{aero:true, note:'Many passes through the upper atmosphere'});
      moonsOf(k).forEach(m=>add(`To ${M[m].name==='Moon'?'the Moon':M[m].name}`,M[m].xfer,M[m].days,`${m}.orbit`,{note:`Insertion into orbit around ${M[m].name}`+(hasDepot(m)?', fuel depot on the surface':'')}));
    }
  }
  return A;
}

// The launch fee can be deferred: the account may go negative for it, but not into bankruptcy.
export const feeBlocked = (a:LocalAction) => !!a.fee && S.domain.credits-a.fee < BANKRUPT;
