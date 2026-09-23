// Reference data for the solar system: bodies, moons, landing sites, trading posts, goods.
// Plain tables and queries on them, no state.

export const AU = 1.495978707e8, MU_SUN = 1.32712440018e11, G0 = 9.80665;

export const START_DAY = 10957.5; // days since J2000 -> 1 Jan 2030

// The keys of a fixed table. Object.keys only promises strings; the tables below never change.
const keysOf = <T extends object>(t: T) => Object.keys(t) as (keyof T & string)[];

export interface BodySurf { up:number; down:number; launcher?:boolean; note?:string }
// Rows of the planet and moon tables; the game reads them through the Body objects below
export interface PlanetRow { name:string; a:number; T:number; L0:number; mu:number; R:number; alt:number; atm:boolean; surf:BodySurf|null; color:string }
export interface MoonRow { name:string; parent:PlanetId; xfer:number; days:number; up:number; down:number; P:number; rv:number; mu:number; R:number; alt:number; orbitName?:string; surfName?:string; downNote?:string; upNote?:string }
export interface Site { id:string; name:string; lat:number; lon:number; port?:boolean; depot?:number; note?:string }
// A class of ship: drive, specific impulse (s), dry mass and tank (t), cargo slots, price (Cr)
export interface ShipClass { name:string; drive:string; isp:number; dry:number; cap:number; slots:number; price:number }
// A good: mass per container (t), value per container (Cr), order size (containers), the mean
// size of a bulk order (containers), one container made every rate days
export interface Good { name:string; shortName:string; mass:number; value:number; lot:[number,number]; bulkLot:number; rate:number; color:string }
export interface Post { id:PostId; name:string; node:NodeId; site:string|null; makes:GoodId[]; needs:GoodId[]; hub?:HubId }

// Circular orbits with real mean longitudes (J2000) and periods
const PLANET_TABLE = {
  mercury:{name:'Mercury', a:0.387, T:87.97,  L0:252.25, mu:22032,     R:2440,  alt:50,    atm:false, surf:{up:3100, down:3100}, color:'#a39e98'},
  venus:  {name:'Venus',  a:0.723, T:224.70, L0:181.98, mu:324859,    R:6052,  alt:250,   atm:true,  surf:{up:27000,down:100, note:'Getting back up costs 27 km/s'}, color:'#d9b36c'},
  earth:  {name:'Earth',   a:1.000, T:365.256,L0:100.46, mu:398600,    R:6371,  alt:200,   atm:true,  surf:{up:9400, down:100, launcher:true, note:'Heat shield and parachutes'}, color:'#4f8fd8'},
  mars:   {name:'Mars',   a:1.524, T:686.98, L0:355.45, mu:42828,     R:3390,  alt:150,   atm:true,  surf:{up:4100, down:700, note:'Aerobraking, then the landing engine'}, color:'#c8603c'},
  ceres:  {name:'Ceres',  a:2.767, T:1681.6, L0:153.0,  mu:62.6,      R:470,   alt:30,   atm:false, surf:{up:400,  down:400}, color:'#9a958d'},
  jupiter:{name:'Jupiter',a:5.203, T:4332.6, L0:34.40,  mu:126686534, R:69911, alt:10000, atm:true,  surf:null, color:'#d2a679'},
  saturn: {name:'Saturn', a:9.537, T:10759,  L0:49.94,  mu:37931187,  R:58232, alt:8000,  atm:true,  surf:null, color:'#e3cf8e'},
} satisfies Record<string, PlanetRow>;
export type PlanetId = keyof typeof PLANET_TABLE;
export const B: Record<PlanetId, PlanetRow> = PLANET_TABLE;

export const PLANETS = keysOf(PLANET_TABLE);

// Moons: nodes "orbit" and "surf", joined to the high orbit of the parent planet.
// xfer = delta-v from the planet's high orbit down to low moon orbit (approximate), P = period in days, rv = orbital radius in km,
// mu = gravitational parameter (km³/s²), R = radius (km), alt = height of the low orbit (km, a typical one)
const MOON_TABLE = {
  moon:     {name:'Moon',      parent:'earth',  xfer:800,  days:3,  up:1870, down:1870, P:27.32, rv:384400, mu:4902.8, R:1737.4, alt:100, orbitName:'lunar orbit', surfName:'the lunar surface'},
  phobos:   {name:'Phobos',    parent:'mars',   xfer:550,  days:1,  up:10,   down:10,   P:0.319, rv:9376, mu:0.0007087, R:11.1, alt:5,   downNote:'Barely any gravity, more docking than landing'},
  deimos:   {name:'Deimos',    parent:'mars',   xfer:350,  days:2,  up:6,    down:6,    P:1.263, rv:23460, mu:9.62e-05, R:6.2, alt:5,  downNote:'Barely any gravity, more docking than landing'},
  io:       {name:'Io',        parent:'jupiter',xfer:4000, days:4,  up:1850, down:1850, P:1.769, rv:421700, mu:5959.9, R:1821.6, alt:100, downNote:'Extreme radiation and volcanoes'},
  europa:   {name:'Europa',    parent:'jupiter',xfer:2900, days:5,  up:1480, down:1480, P:3.551, rv:671100, mu:3202.7, R:1560.8, alt:100, downNote:'An ice shell over an ocean'},
  ganymede: {name:'Ganymede',   parent:'jupiter',xfer:1800, days:6,  up:2000, down:2000, P:7.155, rv:1070400, mu:9887.8, R:2634.1, alt:100},
  callisto: {name:'Callisto',  parent:'jupiter',xfer:1100, days:8,  up:1750, down:1750, P:16.69, rv:1882700, mu:7179.3, R:2410.3, alt:100, downNote:'Outside the heavy radiation belts'},
  enceladus:{name:'Enceladus', parent:'saturn', xfer:2400, days:5,  up:180,  down:180,  P:1.370, rv:238000, mu:7.211, R:252.1, alt:20, downNote:'Geysers from the south pole'},
  titan:    {name:'Titan',     parent:'saturn', xfer:700,  days:10, up:7600, down:100,  P:15.95, rv:1221900, mu:8978.1, R:2574.7, alt:1200, downNote:'Thick atmosphere, parachutes are enough', upNote:'The thick atmosphere makes getting back up expensive'},
} satisfies Record<string, MoonRow>;
export type MoonId = keyof typeof MOON_TABLE;
export const M: Record<MoonId, MoonRow> = MOON_TABLE;

export const MOONS = keysOf(MOON_TABLE);

// Places are "<body>.<level>": earth.surf, earth.orbit (low), earth.capt (high orbit)
export type BodyId = PlanetId|MoonId;
// A node's level, and the short form of it that place ids ("mars.surf") and saves use
export type Level = 'surface'|'lowOrbit'|'highOrbit';
export type LevelCode = 'surf'|'orbit'|'capt';
export const LEVEL: Record<LevelCode, Level> = {surf:'surface', orbit:'lowOrbit', capt:'highOrbit'};
export type NodeId = `${BodyId}.${LevelCode}`;

// Checks for ids from outside (a save, the console); they take anything
const keyOf = (t: object, x: unknown) => typeof x==='string' && Object.hasOwn(t, x);
export const isPlanet = (b: unknown): b is PlanetId => keyOf(B, b);
export const isMoon = (b: unknown): b is MoonId => keyOf(M, b);
export const isBody = (b: unknown): b is BodyId => isPlanet(b) || isMoon(b);
export const isLevel = (l: unknown): l is LevelCode => l==='surf' || l==='orbit' || l==='capt';
export const isNode = (n: unknown): n is NodeId => { if(typeof n!=='string') return false; const [b,l,x]=n.split('.'); return x===undefined && isBody(b) && isLevel(l); };
export const splitNode = (n: NodeId) => n.split('.') as [BodyId, LevelCode];

export const moonsOf = (p: BodyId): MoonId[] => MOONS.filter(m=>BODIES[m].orbits?.id===p);

// Orbital fuel depots; depots on the ground belong to the landing sites
export const DEPOTS: Partial<Record<NodeId, number>> = {'earth.orbit':5, 'mars.orbit':10};

// Equatorial rotation speed in m/s. Launching further from the equator is given less of a head start.
export const ROT: Partial<Record<BodyId, number>> = {mercury:3, venus:2, earth:465, mars:241, ceres:92, moon:5, phobos:3, deimos:1,
  io:75, europa:32, ganymede:27, callisto:11, enceladus:13, titan:12};

// Landing sites: lat in degrees, port = spaceport, depot = days to fill the tank
export const SITES: Partial<Record<BodyId, Site[]>> = {
  earth:[
    {id:'kourou', name:'Kourou', lat:5.2, lon:-52.8, port:true, depot:3, note:'Almost on the equator, full rotation bonus'},
    {id:'canaveral', name:'Cape Canaveral', lat:28.5, lon:-80.6, port:true, depot:3},
    {id:'baikonur', name:'Baikonur', lat:45.9, lon:63.3, port:true, depot:3},
    {id:'plesetsk', name:'Plesetsk', lat:62.9, lon:40.6, port:true, depot:3, note:'Far north, little rotation bonus'},
  ],
  mercury:[
    {id:'caloris', name:'Caloris Basin', lat:30.5, lon:170},
    {id:'prokofiev', name:'Prokofiev Crater', lat:85.7, lon:-62.7, depot:40, note:'Water ice in permanently shadowed craters'},
  ],
  venus:[ {id:'ishtar', name:'Ishtar Terra', lat:70, lon:27.5, note:'Cooler highlands, still 450 °C'} ],
  mars:[
    {id:'pavonis', name:'Pavonis Mons', lat:0.8, lon:-112.8, port:true, depot:20, note:'On the equator and 14 km up, a hub with a fuel store'},
    {id:'jezero', name:'Jezero Crater', lat:18.4, lon:77.5},
    {id:'utopia', name:'Utopia Planitia', lat:46.7, lon:117.8, depot:45, note:'Ice below the surface'},
    {id:'northpole', name:'North Polar Cap', lat:85, lon:0, depot:25, note:'Water ice right at the surface'},
  ],
  ceres:[
    {id:'occator', name:'Occator Crater', lat:19.8, lon:-120.7, depot:40, note:'Brines from below the surface'},
    {id:'ahuna', name:'Ahuna Mons', lat:-10.5, lon:-44},
    {id:'northpole', name:'North Polar Region', lat:80, lon:0, depot:25, note:'Ice in shadowed craters'},
  ],
  moon:[
    {id:'tranquillitatis', name:'Mare Tranquillitatis', lat:0.7, lon:23.5, note:'Apollo 11 landing site'},
    {id:'shackleton', name:'Shackleton Crater', lat:-89.9, lon:0, port:true, depot:15, note:'Water ice at the south pole'},
  ],
  phobos:[ {id:'stickney', name:'Stickney Crater', lat:1, lon:-49} ],
  deimos:[ {id:'swift', name:'Swift Crater', lat:12, lon:0} ],
  io:[ {id:'loki', name:'Loki Patera', lat:13, lon:-51, note:'Lava lake, extreme radiation'} ],
  europa:[
    {id:'conamara', name:'Conamara Chaos', lat:9.7, lon:-87, depot:30, note:'Young ice, the ocean is probably close'},
    {id:'thera', name:'Thera Macula', lat:-47, lon:178},
  ],
  ganymede:[ {id:'uruk', name:'Uruk Sulcus', lat:0, lon:160, port:true, depot:30} ],
  callisto:[ {id:'valhalla', name:'Valhalla', lat:18, lon:-56, port:true, depot:25, note:'Outside the heavy radiation belts'} ],
  enceladus:[
    {id:'tigerstripes', name:'Tiger Stripes', lat:-82, lon:0, depot:20, note:'Geysers deliver ice to your door'},
    {id:'equator', name:'Sarandib Planitia', lat:5, lon:-60},
  ],
  titan:[
    {id:'huygens', name:'Huygens Landing Site', lat:-10.3, lon:167.7},
    {id:'kraken', name:'Kraken Mare', lat:68, lon:50, depot:30, note:'Methane lakes and water ice'},
  ],
};

export const siteOf = (body: BodyId, id: string|null): Site | undefined => (SITES[body]||[]).find(x=>x.id===id);

export const hasDepot = (body: BodyId): boolean => (SITES[body]||[]).some(x=>!!x.depot);

export const rotPenalty = (body: BodyId, lat: number): number => BODIES[body].rotation*(1-Math.cos(lat*Math.PI/180)); // m/s

// Earth: a commercial launcher flies you up (for a fee)
export const launcherAt = (body: BodyId): boolean => isPlanet(body) && !!B[body].surf?.launcher;

export const hasAtm = (body: BodyId): boolean => BODIES[body].atmosphere;

export const latStr = (lat: number): string => `${Math.abs(lat).toLocaleString('en-GB',{maximumFractionDigits:1})}° ${lat>=0?'N':'S'}`;

export const LVL: Record<LevelCode, string> = {surf:'Surface', orbit:'Low orbit', capt:'High orbit'};

const SHIP_TABLE = {
  cog:    {name:'Cog',     drive:'chemical', isp:450, dry:12, cap:80,  slots:6,  price:150000},
  hulk:   {name:'Hulk',    drive:'hybrid',   isp:600, dry:20, cap:160, slots:12, price:400000},
  galleon:{name:'Galleon', drive:'hybrid',   isp:650, dry:45, cap:280, slots:20, price:900000},
  carrack:{name:'Carrack', drive:'nuclear',  isp:900, dry:30, cap:150, slots:8,  price:1200000},
} satisfies Record<string, ShipClass>;
export type ShipId = keyof typeof SHIP_TABLE;
export const SHIPS: Record<ShipId, ShipClass> = SHIP_TABLE;
export const SHIP_IDS = keysOf(SHIP_TABLE);
export const isShip = (x: unknown): x is ShipId => keyOf(SHIPS, x);

const GOOD_TABLE = {
  he3:  {name:'Helium-3', shortName:'He-3',        mass:1,  value:8000, lot:[1,2], bulkLot:9, rate:45, color:'#b78cf0'},
  elec: {name:'Electronics', shortName:'Electronics',   mass:1,  value:5000, lot:[1,2], bulkLot:10, rate:30, color:'#5cc9e0'},
  hab:  {name:'Habitat modules', shortName:'Habitat',  mass:10, value:4000, lot:[1,1], bulkLot:8, rate:30, color:'#e0a15c'},
  rare: {name:'Rare metals', shortName:'Rare met.',    mass:4,  value:3000, lot:[1,2], bulkLot:10, rate:30, color:'#d97fb0'},
  mach: {name:'Machinery', shortName:'Machinery',      mass:5,  value:2000, lot:[1,2], bulkLot:12, rate:20, color:'#9aa7c0'},
  food: {name:'Food', shortName:'Food',                mass:3,  value:600,  lot:[1,2], bulkLot:13, rate:20, color:'#7cc56a'},
  metal:{name:'Metals', shortName:'Metals',            mass:8,  value:400,  lot:[1,3], bulkLot:15, rate:10, color:'#b0a18f'},
  water:{name:'Water', shortName:'Water',              mass:8,  value:200,  lot:[1,3], bulkLot:16, rate:10, color:'#4f8fd8'},
} satisfies Record<string, Good>;
export type GoodId = keyof typeof GOOD_TABLE;
export const GOODS: Record<GoodId, Good> = GOOD_TABLE;
export const isGood = (x: unknown): x is GoodId => keyOf(GOODS, x);

const post = <I extends string>(id:I, name:string, node:NodeId, site:string|null, makes:GoodId[], needs:GoodId[], hub?:HubId) => ({id,name,node,site,makes,needs,...(hub?{hub}:{})});

const POST_LIST = [
  // The Earth: every spaceport a starport of its own
  post('kourou','Kourou','earth.surf','kourou',['mach'],['he3']),
  post('canaveral','Cape Canaveral','earth.surf','canaveral',['elec'],['he3']),
  post('baikonur','Baikonur','earth.surf','baikonur',['food'],['rare']),
  post('plesetsk','Plesetsk','earth.surf','plesetsk',['hab'],['rare']),
  post('shipyard','Orbital Shipyard','earth.orbit',null,['elec'],['water','food','metal','rare'],'shipyard'),
  post('shackleton','Shackleton','moon.surf','shackleton',['water'],['food','mach','hab']),
  post('tranq','Tranquillitatis','moon.surf','tranquillitatis',['metal','he3'],['water','mach']),
  post('caloris','Caloris','mercury.surf','caloris',['metal','rare'],['water','food','mach']),
  post('prokofiev','Prokofiev','mercury.surf','prokofiev',['water'],['elec','hab']),
  post('pavonis','Pavonis Mons','mars.surf','pavonis',['mach','hab'],['he3','elec','metal','rare'],'pavonis'),
  post('jezero','Jezero','mars.surf','jezero',['food'],['water','mach']),
  post('marsnorth','North Polar Cap','mars.surf','northpole',['water'],['food','hab']),
  post('stickney','Stickney','phobos.surf','stickney',['metal'],['water','food']),
  post('occator','Occator','ceres.surf','occator',['metal'],['food','elec','hab']),
  post('ahuna','Ahuna Mons','ceres.surf','ahuna',['rare'],['water','mach']),
  post('ceresnorth','Ceres North Pole','ceres.surf','northpole',['water'],['mach']),
  post('loki','Loki Patera','io.surf','loki',['rare'],['water','food','mach']),
  post('conamara','Conamara','europa.surf','conamara',['water'],['elec','hab']),
  post('uruk','Uruk Sulcus','ganymede.surf','uruk',['food'],['water','mach']),
  post('valhalla','Valhalla','callisto.surf','valhalla',['hab'],['he3','food','metal','elec'],'valhalla'),
  post('jupgas','Jupiter Gas Collector','jupiter.capt',null,['he3'],['food','mach']),
  post('satgas','Saturn Gas Collector','saturn.capt',null,['he3'],['food','elec']),
  post('tiger','Tiger Stripes','enceladus.surf','tigerstripes',['water'],['mach']),
  post('kraken','Kraken Mare','titan.surf','kraken',[],['mach','hab','elec']),
];
export type PostId = typeof POST_LIST[number]['id'];
export const POSTS: Post[] = POST_LIST;
// A value for every post. fromEntries only knows string keys, but every id of POSTS is in there.
export const byPost = <T>(f:(k:Post)=>T) => Object.fromEntries(POSTS.map(k=>[k.id,f(k)])) as Record<PostId, T>;
export const POST_BY_ID = byPost(k=>k);
export const isPost = (x: unknown): x is PostId => keyOf(POST_BY_ID, x);

export type HubId = 'shipyard'|'pavonis'|'valhalla';
export const HUBS: Record<HubId, Post> = {shipyard:POST_BY_ID.shipyard, pavonis:POST_BY_ID.pavonis, valhalla:POST_BY_ID.valhalla};

// A hub's zone of influence: the bodies it serves. It decides where goods for other zones are
// transhipped, where the orders from a hub's store go, how long a rescue takes and which fuel
// prices the refuel panel lists.
export const ZONES: Record<HubId, readonly BodyId[]> = {
  shipyard:['earth','moon','mercury','venus'],
  pavonis:['mars','phobos','deimos','ceres'],
  valhalla:['jupiter','io','europa','ganymede','callisto','saturn','enceladus','titan'],
};
// The hub in whose zone a body lies
export function hubFor(b: BodyId): HubId {
  const h=keysOf(ZONES).find(k=>ZONES[k].includes(b)); if(!h) throw new Error(`No hub for ${b}`); return h;
}

export const HUB_CAP = 40, MAX_OPEN = 6, MAX_ROUTE_DV = 12000; // no ship manages a longer route

// Fuel prices in credits per tonne, keyed by node or node@site
export const FUEL_PRICE: Record<string, number> = {'earth.orbit':300,'mars.orbit':220,
  'earth.surf@kourou':250,'earth.surf@canaveral':250,'earth.surf@baikonur':250,'earth.surf@plesetsk':250,'mercury.surf@prokofiev':200,'moon.surf@shackleton':150,
  'mars.surf@utopia':150,'mars.surf@pavonis':180,'mars.surf@northpole':120,'ceres.surf@occator':120,'titan.surf@kraken':110,'ceres.surf@northpole':100,
  'ganymede.surf@uruk':100,'europa.surf@conamara':90,'callisto.surf@valhalla':90,'enceladus.surf@tigerstripes':80};

export const LAUNCH_FEE = 100, RESCUE_BASE = 5000, RESCUE_PER_T = 300, BANKRUPT = -50000;

export const RATE_MASS = 400, SHIP_MASS_SHARE = 8, V_EXHAUST = 450*9.80665, RATE_DAY = 15;

export const RATE_MASS_DAY = 4;          // time share: Cr per tonne (cargo + ship share) and travel day

export const BULK = {min:7, max:18, slow:1.5, premium:1.1, life:180}; // Bulk orders: least and largest size, restock slower than single goods, premium, lifetime

export const bodyOf = (k: Post): BodyId => splitNode(k.node)[0];

export const planetOfBody = (b: BodyId): PlanetId => isMoon(b) ? M[b].parent : b;

export const bodyName = (b: BodyId): string => BODIES[b].name;

export const postPlace = (k: Post): string => k.node==='earth.orbit' ? 'Earth orbit' : k.node.endsWith('.capt') ? `high orbit of ${bodyName(bodyOf(k))}` : bodyName(bodyOf(k));

export const postLabel = (k: Post): string => `${k.name}, ${postPlace(k)}`;

export const fmtCr = (n: number): string => `${Math.round(n).toLocaleString('en-GB')} Cr`;


export const SYSNAME: Partial<Record<PlanetId, string>> = {earth:'Earth system', mars:'Mars system', jupiter:'Jupiter system', saturn:'Saturn system'};

const BODYCOL: Record<MoonId, string> = {moon:'#a8a49c', phobos:'#8e8378', deimos:'#9a9086', io:'#d8c35a', europa:'#cfc6b2', ganymede:'#a89f92', callisto:'#7f776d', enceladus:'#e6ecf0', titan:'#d9a441'};

export const bodyColor = (b: BodyId): string => isPlanet(b) ? B[b].color : BODYCOL[b];

// ── The bodies as fixed objects ──────────────────────────────────────────────
// What the game needs to know about a planet or a moon. A planet circles the Sun, a moon its
// planet (orbits). A moon's mean longitude is the phase the map starts it at.

export class Body {
  readonly id:BodyId;
  readonly name:string;
  readonly orbits:Body|null;                // the planet a moon circles; null for a planet
  readonly orbitRadius:number;              // planets: AU from the Sun; moons: km from the planet
  readonly period:number;                   // days per orbit
  readonly meanLongitude:number;            // degrees on 1 January 2000
  readonly gravity:number;                  // gravitational parameter, km³/s²
  readonly radius:number;                   // km
  readonly lowOrbitAltitude:number;         // km
  readonly rotation:number;                 // speed of the surface at the equator, m/s
  readonly atmosphere:boolean;
  constructor(b:{id:BodyId; name:string; orbits:Body|null; orbitRadius:number; period:number; meanLongitude:number;
    gravity:number; radius:number; lowOrbitAltitude:number; rotation:number; atmosphere:boolean}){
    this.id=b.id; this.name=b.name; this.orbits=b.orbits; this.orbitRadius=b.orbitRadius; this.period=b.period; this.meanLongitude=b.meanLongitude;
    this.gravity=b.gravity; this.radius=b.radius; this.lowOrbitAltitude=b.lowOrbitAltitude; this.rotation=b.rotation; this.atmosphere=b.atmosphere;
  }
}

const PLANET_BODIES = Object.fromEntries(PLANETS.map(k=>{ const p=B[k];
  return [k, new Body({id:k, name:p.name, orbits:null, orbitRadius:p.a, period:p.T, meanLongitude:p.L0, gravity:p.mu, radius:p.R,
    lowOrbitAltitude:p.alt, rotation:ROT[k]||0, atmosphere:p.atm})]; })) as Record<PlanetId, Body>;
export const BODIES: Record<BodyId, Body> = {...PLANET_BODIES, ...Object.fromEntries(MOONS.map((k,i)=>{ const m=M[k];
  return [k, new Body({id:k, name:m.name, orbits:PLANET_BODIES[m.parent], orbitRadius:m.rv, period:m.P, meanLongitude:i*1.7*180/Math.PI,
    gravity:m.mu, radius:m.R, lowOrbitAltitude:m.alt, rotation:ROT[k]||0, atmosphere:k==='titan'})]; })) as Record<MoonId, Body>};


// ── The places as fixed objects ──────────────────────────────────────────────
// A node is a body and a level; on a surface every node is a landing site. There is one
// object per place, so two of them are the same place exactly when they are ===.

export class Node {
  readonly body:BodyId;
  readonly level:Level;
  readonly node:NodeId;              // "<body>.<level code>", the id the tables and saves use
  readonly site:string|null;         // the landing site's id; null off the surface
  constructor(body:BodyId, code:LevelCode, site:string|null=null){ this.body=body; this.level=LEVEL[code]; this.node=`${body}.${code}`; this.site=site; }
  // "<body>.<level>", and "@<site>" on a surface
  get key():string { return this.site ? `${this.node}@${this.site}` : this.node; }
  // the place as a start for route()
  get id():string { return '@'+this.key; }
  // the planet it belongs to; a moon counts as its planet
  get planet():PlanetId { const b=this.body; return isMoon(b) ? M[b].parent : b; }
  // the trading post here, if there is one
  get post():Post|null { return POSTS.find(k=>k.node===this.node && k.site===this.site) || null; }
  get depot():Depot|null { return DEPOT_AT.get(this.key) ?? null; }
  // how the place is called on screen
  get label():string {
    const b=this.body, [,l]=splitNode(this.node);
    if(isMoon(b)) return l==='surf' ? (M[b].surfName||`the surface of ${BODIES[b].name}`) : (M[b].orbitName||`orbit around ${BODIES[b].name}`);
    return `${LVL[l]} of ${BODIES[b].name}`;
  }
}

export class LandingSite extends Node {
  readonly name:string;
  readonly lat:number;               // degrees; the further from the equator, the less rotation bonus
  readonly lon:number;
  readonly port:boolean;             // a spaceport
  readonly note:string|null;
  constructor(body:BodyId, st:Site){ super(body,'surf',st.id); this.name=st.name; this.lat=st.lat; this.lon=st.lon; this.port=!!st.port; this.note=st.note??null; }
  override get label():string { return `${this.name} (${bodyName(this.body)})`; }
}

// Where the ship can take on propellant, and at what price and speed
export class Depot {
  readonly at:Node;
  readonly fuelPrice:number;         // credits per tonne
  readonly fillDays:number;          // days to fill the tank
  constructor(at:Node, fuelPrice:number, fillDays:number){ this.at=at; this.fuelPrice=fuelPrice; this.fillDays=fillDays; }
}

const NODE_BY_KEY = new Map<string,Node>();
for(const b of [...PLANETS, ...MOONS]){
  (SITES[b]||[]).forEach(st=>{ const n=new LandingSite(b,st); NODE_BY_KEY.set(n.key,n); });
  const levels:LevelCode[] = isPlanet(b) ? ['orbit','capt'] : ['orbit'];
  levels.forEach(l=>{ const n=new Node(b,l); NODE_BY_KEY.set(n.key,n); });
}
export const NODES:readonly Node[] = [...NODE_BY_KEY.values()];

// The node for a place id and landing site, or undefined if there is no such place. Off the
// surface the site is ignored.
export function nodeAt(node:NodeId, site:string|null=null):Node|undefined {
  return NODE_BY_KEY.get(node.endsWith('.surf') && site ? `${node}@${site}` : node);
}
// The same, for places the game itself names: one that does not exist is a bug
export function nodeOf(node:NodeId, site:string|null=null):Node {
  const n=nodeAt(node,site); if(!n) throw new Error(`No such place: ${node}${site?'@'+site:''}`); return n;
}

// A connection: a manoeuvre from one node to another, what it costs and how long it takes.
// launchFee: a launcher flies it, for a fee (on Earth). transferWindow: a transfer between the
// high orbits of two planets, whose dv and days are the values in the ideal window; leaving on
// another day costs more and flies faster (physics.transfer).
export class Connection {
  readonly from:Node; readonly to:Node;
  readonly dv:number; readonly days:number;
  readonly launchFee:boolean; readonly transferWindow:boolean;
  constructor(from:Node, to:Node, dv:number, days:number, launchFee=false, transferWindow=false){
    this.from=from; this.to=to; this.dv=dv; this.days=days; this.launchFee=launchFee; this.transferWindow=transferWindow;
  }
  // between two landing sites of one body
  get hop(){ return this.from.level==='surface' && this.to.level==='surface'; }
  // the two planets of a transfer
  get leg():[PlanetId,PlanetId]|null { return this.transferWindow ? [this.from.planet, this.to.planet] : null; }
}

// Every depot: the fuel price table names the places, the fill time comes from the landing
// site or, in orbit, from DEPOTS
export const DEPOT_LIST:readonly Depot[] = Object.entries(FUEL_PRICE).map(([key,price])=>{
  const [node='',site=null]=key.split('@'); if(!isNode(node)) throw new Error(`FUEL_PRICE: unknown place ${key}`);
  const at=nodeOf(node,site), days=at instanceof LandingSite ? siteOf(at.body,at.site)?.depot : DEPOTS[node];
  if(days===undefined) throw new Error(`FUEL_PRICE: no fill time for ${key}`);
  return new Depot(at,price,days);
});
const DEPOT_AT = new Map(DEPOT_LIST.map(d=>[d.at.key,d]));

export function fuelHere(node: NodeId, site: string|null): boolean{ return !!nodeAt(node,site)?.depot; }
