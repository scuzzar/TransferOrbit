// What the screen is showing: the open panel, the selection, the map level, the message.
// None of it is game state: the commands never read or write it, and it is never saved.
// They only tell the player things through report(); hear() is where that lands.

import type { ReportKind } from '../events.js';
import { BodyId, NodeId, PlanetId, SITES, isPlanet } from '../game/world.js';
import { RouteMode, Target } from '../game/state.js';

export type View = 'main'|'post'|'cargo'|'refuel'|'shipyard'|'route';
// What is selected on the map
export type Pick = { type:'planet'; planet:PlanetId } | { type:'body'; body:BodyId } | { type:'node'; node:NodeId; site?:string|null };
// Which level the map shows
export type ViewLevel = { level:'sol' } | { level:'sys'; planet:PlanetId } | { level:'body'; planet:PlanetId; body:BodyId };

export interface UIState {
  view:View; back:View|null;          // the open panel, and where its back button leads
  sel:Set<number>;                    // orders ticked on the order board
  tank:number|null;                   // the amount on the refuel slider
  pick:Pick|null;                     // the map selection
  route:{ target:Target; mode:RouteMode; strand?:boolean }|null;   // the route panel
  mapView:ViewLevel|null; mapKey:string|null;                      // a map level chosen by hand, and for which place
  msg:string|null; rmsg:boolean;      // the last message, and whether the route panel shows it too
  windowPlanet:PlanetId|null;         // where the transfer window on the solar system map points
}

const fresh = (msg:string|null):UIState => ({view:'main', back:null, sel:new Set<number>(), tank:null, pick:null, route:null,
  mapView:null, mapKey:null, msg, rmsg:false, windowPlanet:null});

export const UI:UIState = fresh(null);

// Where report() lands: a new game starts the screen afresh, an autopilot that arrived
// closes the route panel so the place (deliver, orders, refuel) is visible.
export function hear(text:string, kind:ReportKind){
  if(kind==='fresh'){ Object.assign(UI, fresh(text)); return; }
  UI.msg=text;
  if(kind==='arrived' && UI.view==='route'){ UI.view='main'; UI.back=null; }
}

export const pickTarget = (p:Pick):Target => p.type==='planet' ? {node:`${p.planet}.capt`} : p.type==='body' ? {node:isPlanet(p.body)&&!SITES[p.body] ? `${p.body}.capt` : `${p.body}.orbit`} : {node:p.node, site:p.site||null};
