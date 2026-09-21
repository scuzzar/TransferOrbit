// Reference data for the solar system: bodies, moons, landing sites, trading posts, goods.
// Plain tables and queries on them, no state.

export const AU = 1.495978707e8, MU_SUN = 1.32712440018e11, G0 = 9.80665;

export const START_DAY = 10957.5; // days since J2000 -> 1 Jan 2030

export interface BodySurf { up:number; down:number; launcher?:boolean; note?:string }
export interface Body { name:string; a:number; T:number; L0:number; mu:number; R:number; alt:number; atm:boolean; surf:BodySurf|null; color:string }
export interface Moon { name:string; parent:string; xfer:number; days:number; up:number; down:number; P:number; rv:number; orbitName?:string; surfName?:string; downNote?:string; upNote?:string }
export interface Site { id:string; name:string; lat:number; lon:number; port?:boolean; depot?:number; note?:string }
export interface ShipDef { name:string; drive:string; isp:number; dry:number; cap:number; slots:number; price:number }
export interface GoodDef { name:string; sh:string; m:number; w:number; lot:number[]; rate:number; color:string }
export interface Post { id:string; name:string; node:string; site:string|null; makes:string[]; needs:string[]; hub?:string }

// Circular orbits with real mean longitudes (J2000) and periods
export const B: Record<string, Body> = {
  mercury:{name:'Mercury', a:0.387, T:87.97,  L0:252.25, mu:22032,     R:2440,  alt:50,    atm:false, surf:{up:3100, down:3100}, color:'#a39e98'},
  venus:  {name:'Venus',  a:0.723, T:224.70, L0:181.98, mu:324859,    R:6052,  alt:250,   atm:true,  surf:{up:27000,down:100, note:'Getting back up costs 27 km/s'}, color:'#d9b36c'},
  earth:  {name:'Earth',   a:1.000, T:365.256,L0:100.46, mu:398600,    R:6371,  alt:200,   atm:true,  surf:{up:9400, down:100, launcher:true, note:'Heat shield and parachutes'}, color:'#4f8fd8'},
  mars:   {name:'Mars',   a:1.524, T:686.98, L0:355.45, mu:42828,     R:3390,  alt:150,   atm:true,  surf:{up:4100, down:700, note:'Aerobraking, then the landing engine'}, color:'#c8603c'},
  ceres:  {name:'Ceres',  a:2.767, T:1681.6, L0:153.0,  mu:62.6,      R:470,   alt:30,   atm:false, surf:{up:400,  down:400}, color:'#9a958d'},
  jupiter:{name:'Jupiter',a:5.203, T:4332.6, L0:34.40,  mu:126686534, R:69911, alt:10000, atm:true,  surf:null, color:'#d2a679'},
  saturn: {name:'Saturn', a:9.537, T:10759,  L0:49.94,  mu:37931187,  R:58232, alt:8000,  atm:true,  surf:null, color:'#e3cf8e'},
};

export const PLANETS = Object.keys(B);

// Moons: nodes "orbit" and "surf", joined to the high orbit of the parent planet.
// xfer = delta-v from the planet's high orbit down to low moon orbit (approximate), P = period in days, rv = orbital radius in km
export const M: Record<string, Moon> = {
  moon:     {name:'Moon',      parent:'earth',  xfer:800,  days:3,  up:1870, down:1870, P:27.32, rv:384400, orbitName:'lunar orbit', surfName:'the lunar surface'},
  phobos:   {name:'Phobos',    parent:'mars',   xfer:550,  days:1,  up:10,   down:10,   P:0.319, rv:9376,   downNote:'Barely any gravity, more docking than landing'},
  deimos:   {name:'Deimos',    parent:'mars',   xfer:350,  days:2,  up:6,    down:6,    P:1.263, rv:23460,  downNote:'Barely any gravity, more docking than landing'},
  io:       {name:'Io',        parent:'jupiter',xfer:4000, days:4,  up:1850, down:1850, P:1.769, rv:421700, downNote:'Extreme radiation and volcanoes'},
  europa:   {name:'Europa',    parent:'jupiter',xfer:2900, days:5,  up:1480, down:1480, P:3.551, rv:671100, downNote:'An ice shell over an ocean'},
  ganymede: {name:'Ganymede',   parent:'jupiter',xfer:1800, days:6,  up:2000, down:2000, P:7.155, rv:1070400},
  callisto: {name:'Callisto',  parent:'jupiter',xfer:1100, days:8,  up:1750, down:1750, P:16.69, rv:1882700, downNote:'Outside the heavy radiation belts'},
  enceladus:{name:'Enceladus', parent:'saturn', xfer:2400, days:5,  up:180,  down:180,  P:1.370, rv:238000, downNote:'Geysers from the south pole'},
  titan:    {name:'Titan',     parent:'saturn', xfer:700,  days:10, up:7600, down:100,  P:15.95, rv:1221900, downNote:'Thick atmosphere, parachutes are enough', upNote:'The thick atmosphere makes getting back up expensive'},
};

export const MOONS = Object.keys(M);

export const moonsOf = (p: string): string[] => MOONS.filter(m=>M[m].parent===p);

// Orbital fuel depots; depots on the ground belong to the landing sites
export const DEPOTS: Record<string, number> = {'earth.orbit':5, 'mars.orbit':10};

// Equatorial rotation speed in m/s. Launching further from the equator is given less of a head start.
export const ROT: Record<string, number> = {mercury:3, venus:2, earth:465, mars:241, ceres:92, moon:5, phobos:3, deimos:1,
  io:75, europa:32, ganymede:27, callisto:11, enceladus:13, titan:12};

// Landing sites: lat in degrees, port = spaceport, depot = days to fill the tank
export const SITES: Record<string, Site[]> = {
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

export const siteOf = (body: string, id: string|null): Site | undefined => (SITES[body]||[]).find(x=>x.id===id);

export const hasDepot = (body: string): boolean => (SITES[body]||[]).some(x=>!!x.depot);

export const rotPenalty = (body: string, lat: number): number => (ROT[body]||0)*(1-Math.cos(lat*Math.PI/180)); // m/s

export const hasAtm = (body: string): boolean => B[body] ? B[body].atm : body==='titan';

export const latStr = (lat: number): string => `${Math.abs(lat).toLocaleString('en-GB',{maximumFractionDigits:1})}° ${lat>=0?'N':'S'}`;

export const LVL = {surf:'Surface', orbit:'Low orbit', capt:'High orbit'};

export const SHIPS: Record<string, ShipDef> = {
  cog:    {name:'Cog',     drive:'chemical', isp:450, dry:12, cap:80,  slots:6,  price:150000},
  hulk:   {name:'Hulk',    drive:'hybrid',   isp:600, dry:20, cap:160, slots:12, price:400000},
  galleon:{name:'Galleon', drive:'hybrid',   isp:650, dry:45, cap:280, slots:20, price:900000},
  carrack:{name:'Carrack', drive:'nuclear',  isp:900, dry:30, cap:150, slots:8,  price:1200000},
};

export const GOODS: Record<string, GoodDef> = {
  he3:  {name:'Helium-3', sh:'He-3',        m:1,  w:8000, lot:[1,2], rate:45, color:'#b78cf0'},
  elec: {name:'Electronics', sh:'Electronics',   m:1,  w:5000, lot:[1,2], rate:30, color:'#5cc9e0'},
  hab:  {name:'Habitat modules', sh:'Habitat',  m:10, w:4000, lot:[1,1], rate:30, color:'#e0a15c'},
  rare: {name:'Rare metals', sh:'Rare met.',    m:4,  w:3000, lot:[1,2], rate:30, color:'#d97fb0'},
  mach: {name:'Machinery', sh:'Machinery',      m:5,  w:2000, lot:[1,2], rate:20, color:'#9aa7c0'},
  food: {name:'Food', sh:'Food',                m:3,  w:600,  lot:[1,2], rate:20, color:'#7cc56a'},
  metal:{name:'Metals', sh:'Metals',            m:8,  w:400,  lot:[1,3], rate:10, color:'#b0a18f'},
  water:{name:'Water', sh:'Water',              m:8,  w:200,  lot:[1,3], rate:10, color:'#4f8fd8'},
};

export const post = (id:string, name:string, node:string, site:string|null, makes:string[], needs:string[], hub?:string): Post => ({id,name,node,site,makes,needs,hub});

export const POSTS: Post[] = [
  post('earth','Earth','earth.surf',null,['food','mach','elec','hab'],['he3','rare']),
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

export const POST_BY_ID: Record<string, Post> = Object.fromEntries(POSTS.map(k=>[k.id,k]));

export const HUBS = {shipyard:POST_BY_ID.shipyard, pavonis:POST_BY_ID.pavonis, valhalla:POST_BY_ID.valhalla};

export const REGION: Record<string, string> = {earth:'shipyard',moon:'shipyard',mercury:'shipyard',venus:'shipyard',
  mars:'pavonis',phobos:'pavonis',deimos:'pavonis',ceres:'pavonis',
  jupiter:'valhalla',io:'valhalla',europa:'valhalla',ganymede:'valhalla',callisto:'valhalla',
  saturn:'valhalla',enceladus:'valhalla',titan:'valhalla'};

export const HUB_CAP = 40, MAX_OPEN = 6, MAX_ROUTE_DV = 12000; // no ship manages a longer route

// Fuel prices in credits per tonne, keyed by node or node@site
export const FUEL_PRICE: Record<string, number> = {'earth.orbit':300,'mars.orbit':220,'earth.surf':250,'mercury.surf@prokofiev':200,'moon.surf@shackleton':150,
  'mars.surf@utopia':150,'mars.surf@pavonis':180,'mars.surf@northpole':120,'ceres.surf@occator':120,'titan.surf@kraken':110,'ceres.surf@northpole':100,
  'ganymede.surf@uruk':100,'europa.surf@conamara':90,'callisto.surf@valhalla':90,'enceladus.surf@tigerstripes':80};

export const LAUNCH_FEE = 100, RESCUE_BASE = 5000, RESCUE_PER_T = 300, BANKRUPT = -50000;

export const RATE_MASS = 400, SHIP_MASS_SHARE = 8, V_EXHAUST = 450*9.80665, RATE_DAY = 15;

export const RATE_MASS_DAY = 4;          // time share: Cr per tonne (cargo + ship share) and travel day

export const BULK = {min:7, max:18, slow:1.5, premium:1.1, life:180}; // Bulk orders: size, restock slower than single goods, premium, lifetime

export const bodyOf = (k: Post): string => k.node.split('.')[0];

export const planetOfBody = (b: string): string => M[b] ? M[b].parent : b;

export const bodyName = (b: string): string => M[b] ? M[b].name : B[b].name;

export const postPlace = (k: Post): string => k.node==='earth.orbit' ? 'Earth orbit' : k.node.endsWith('.capt') ? `high orbit of ${B[bodyOf(k)].name}` : bodyName(bodyOf(k));

export const postLabel = (k: Post): string => k.id==='earth' ? 'Earth' : `${k.name}, ${postPlace(k)}`;

export const fmtCr = (n: number): string => `${Math.round(n).toLocaleString('en-GB')} Cr`;


export const SYSNAME: Record<string, string> = {earth:'Earth system', mars:'Mars system', jupiter:'Jupiter system', saturn:'Saturn system'};

const BODYCOL: Record<string, string> = {moon:'#a8a49c', phobos:'#8e8378', deimos:'#9a9086', io:'#d8c35a', europa:'#cfc6b2', ganymede:'#a89f92', callisto:'#7f776d', enceladus:'#e6ecf0', titan:'#d9a441'};

export const bodyColor = (b: string): string => B[b] ? B[b].color : (BODYCOL[b]||'#9a958d');

// How much delta-v from a place to the nearest fuel depot? 0 if there is one right there.
export const FUEL_SPOTS: {node:string; site:string|null}[] = Object.keys(FUEL_PRICE).map(k=>{ const [node,site]=k.split('@'); return {node, site:site||(node==='earth.surf'?'kourou':null)}; });

export function fuelHere(node: string, site: string|null): boolean{ return (FUEL_PRICE[node+'@'+site] ?? FUEL_PRICE[node])!==undefined; }
