// Welche Manöver von hier aus moeglich sind. Reine Abfrage, ändert nichts.

import { B, BANKRUPT, LAUNCH_FEE, M, ROT, SITES, fmtCr, hasAtm, hasDepot, latStr, moonsOf, planetGen, rotPenalty, siteOf } from './welt.js';
import { HOP_FEE_SHARE, bodyDown, bodyUp, captDv, hopCost } from './physik.js';
import { S, cargoMass, eng, here } from './zustand.js';

export function localActions(){
  const [k,l]=here(); const A=[];
  const add=(label,dv,days,to,x={})=>A.push({label,dv,days,to,...x});
  if(!k) return A;
  const landings=(body,down,baseNote)=>{
    (SITES[body]||[]).forEach(st=>{
      const pen=hasAtm(body)?0:rotPenalty(body,st.lat);
      const bits=[latStr(st.lat)];
      if(st.port) bits.push('Weltraumbahnhof');
      if(st.depot) bits.push(`Tankstelle (${st.depot} Tage)`);
      add(`Landen: ${st.name}`,down+pen,0.2,body+'.surf',{site:st.id,lat:st.lat,note:bits.join(', ')+(st.note?`. ${st.note}`:'')});
    });
  };
  const launch=(body,up,label)=>{
    const st=siteOf(body,S.site), lat=st?st.lat:0, pen=rotPenalty(body,lat);
    const rotNote=(ROT[body]||0)>=20 ? `Start bei ${latStr(lat)}: ${Math.round((ROT[body]||0)-pen)} von ${ROT[body]} m/s Rotationsbonus` : '';
    return {lat,pen,rotNote};
  };
  if(l==='surf' && S.site) (SITES[k]||[]).forEach(st=>{
    if(st.id===S.site) return;
    const h=hopCost(k,S.site,st.id), full=bodyUp(k)+bodyDown(k);
    const fee=h.launcher?Math.round(LAUNCH_FEE*(eng().dry+cargoMass()+S.fuel)*HOP_FEE_SHARE):0;
    add(`${h.launcher?'Suborbitaler Flug':'Ballistischer Hüpfer'} nach ${st.name}`,h.dv,h.days,k+'.surf',{site:st.id,lat:st.lat,hop:true,...(fee?{fee}:{}),
      note:`${Math.round(h.th*180/Math.PI)}° Bogen${h.launcher?`, Gebühr ${fmtCr(fee)}`:`, ${Math.round((1-h.dv/full)*100)} % billiger als über den Orbit`}`});
  });
  if(M[k]){
    const m=M[k], p=m.parent;
    if(l==='surf'){ const L=launch(k); add(`Aufstieg in den ${m.orbitName||'Orbit um '+m.name}`,m.up+L.pen,0.2,k+'.orbit',{note:[m.upNote,L.rotNote].filter(Boolean).join('. '),lat:L.lat}); }
    else {
      landings(k,m.down);
      add(`Zurück in den hohen Orbit ${planetGen(p)}`,m.xfer,m.days,p+'.capt');
    }
  } else {
    const b=B[k];
    if(l==='surf'){
      const L=launch(k);
      if(b.surf.launcher){ const fee=Math.round(LAUNCH_FEE*(eng().dry+cargoMass()+S.fuel));
        add('Mit Trägerrakete in den Orbit',L.pen,1,k+'.orbit',{lat:L.lat,fee,note:`Startgebühr ${fmtCr(fee)}${fee>S.credits?', wird gestundet':''}. Fehlender Rotationsbonus kommt aus deinem Tank. ${L.rotNote}`}); }
      else add('Aufstieg in den Orbit',b.surf.up+L.pen,0.2,k+'.orbit',{lat:L.lat,note:L.rotNote});
    }
    if(l==='orbit'){
      if(b.surf) landings(k,b.surf.down);
      add('In den hohen Orbit',captDv(k),1,k+'.capt',{note:'Ausgangspunkt für Transfers und Monde'});
    }
    if(l==='capt'){
      add('Abstieg in den niedrigen Orbit',captDv(k),1,k+'.orbit');
      if(b.atm) add('Aerobremsen in den niedrigen Orbit',60,40,k+'.orbit',{note:'Viele Durchgänge durch die obere Atmosphäre'});
      moonsOf(k).forEach(m=>add(`Zum ${M[m].name==='Mond'?'Mond':'Mond '+M[m].name}`,M[m].xfer,M[m].days,m+'.orbit',{note:`Einschuss in den Orbit um ${M[m].name}`+(hasDepot(m)?', Tankstelle auf der Oberfläche':'')}));
    }
  }
  return A;
}

// Die Startgebühr wird notfalls gestundet: Das Konto darf dafür ins Minus, nur nicht bis zum Konkurs.
export const feeBlocked = a => !!a.fee && S.credits-a.fee < BANKRUPT;
