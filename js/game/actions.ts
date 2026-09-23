// Which manoeuvres are possible from here. A pure query, changes nothing.

import { B, BANKRUPT, BodyId, LAUNCH_FEE, LandingSite, M, NodeId, ROT, bodyName, fmtCr, hasDepot, isMoon, latStr, rotPenalty, siteOf } from './world.js';
import { HOP_FEE_SHARE, bodyDown, bodyUp, hopCost } from './physics.js';
import { S } from './state.js';
import { connectionsFrom } from './graph.js';

export interface LocalAction {
  label:string; dv:number; days:number; to:NodeId;
  site?:string|null; lat?:number; note?:string; fee?:number; hop?:boolean; aero?:boolean;
}
type ActionExtra = Omit<LocalAction,'label'|'dv'|'days'|'to'>;

// The manoeuvres from here: every connection out of the ship's node except the transfers to
// other planets, with what the player reads about it and the fee for the ship as it is now
export function localActions(): LocalAction[]{
  const place=S.player.ship.place, ship=S.player.ship;
  if(!place) return [];
  const mass=ship.def.dry+ship.cargoMass+ship.fuel;
  const launch=(body:BodyId)=>{
    const st=siteOf(body,place.site), lat=st?st.lat:0, pen=rotPenalty(body,lat), rot=ROT[body]||0;
    const rotNote=rot>=20 ? `Launching at ${latStr(lat)}: ${Math.round(rot-pen)} of ${rot} m/s rotation bonus` : '';
    return {lat,rotNote};
  };
  return connectionsFrom(place).filter(c=>!c.transferWindow).map(c=>{
    const to=c.to, k=place.body, add=(label:string,x:ActionExtra={}):LocalAction=>({label,dv:c.dv,days:c.days,to:to.node,...x});
    if(c.hop && to instanceof LandingSite){
      const h=hopCost(k,place.site,to.site), full=bodyUp(k)+bodyDown(k);
      const fee=c.launchFee?Math.round(LAUNCH_FEE*mass*HOP_FEE_SHARE):0;
      return add(`${c.launchFee?'Suborbital flight':'Ballistic hop'} to ${to.name}`,{site:to.site,lat:to.lat,hop:true,...(fee?{fee}:{}),
        note:`${Math.round(h.th*180/Math.PI)}° arc${c.launchFee?`, fee ${fmtCr(fee)}`:`, ${Math.round((1-h.dv/full)*100)}% cheaper than going via orbit`}`});
    }
    if(to instanceof LandingSite){
      const st=siteOf(to.body,to.site), bits=[latStr(to.lat)];
      if(to.port) bits.push('Spaceport');
      if(st?.depot) bits.push(`Fuel depot (${st.depot} days)`);
      return add(`Land at ${to.name}`,{site:to.site,lat:to.lat,note:bits.join(', ')+(to.note?`. ${to.note}`:'')});
    }
    if(place.level==='surf'){
      const L=launch(k);
      if(isMoon(k)){ const m=M[k]; return add(`Ascend to ${m.orbitName||'orbit around '+m.name}`,{note:[m.upNote,L.rotNote].filter(Boolean).join('. '),lat:L.lat}); }
      if(c.launchFee){ const fee=Math.round(LAUNCH_FEE*mass);
        return add('Ride a launcher to orbit',{lat:L.lat,fee,note:`Launch fee ${fmtCr(fee)}${fee>S.player.credits?', deferred':''}. The missing rotation bonus comes out of your tank. ${L.rotNote}`}); }
      return add('Ascend to orbit',{lat:L.lat,note:L.rotNote});
    }
    if(isMoon(k)) return add(`Back to high orbit of ${B[to.planet].name}`);
    if(place.level==='orbit') return add('Up to high orbit',{note:'Starting point for transfers and for the moons'});
    if(to.body===k) return c.dv<100 ? add('Aerobrake into low orbit',{aero:true, note:'Many passes through the upper atmosphere'}) : add('Down to low orbit');
    const m=to.body;
    return add(`To ${bodyName(m)==='Moon'?'the Moon':bodyName(m)}`,{note:`Insertion into orbit around ${bodyName(m)}`+(hasDepot(m)?', fuel depot on the surface':'')});
  });
}

// The launch fee can be deferred: the account may go negative for it, but not into bankruptcy.
export const feeBlocked = (a:LocalAction) => !!a.fee && S.player.credits-a.fee < BANKRUPT;
