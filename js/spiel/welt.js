// Stammdaten des Sonnensystems: Körper, Monde, Landeplaetze, Kontore, Waren.
// Reine Tabellen und Abfragen darauf, kein Zustand.

export const AU = 1.495978707e8, MU_SUN = 1.32712440018e11, G0 = 9.80665;

export const START_DAY = 10957.5; // Tage seit J2000 → 1. Jan 2030

// Kreisbahnen mit echten mittleren Längen (J2000) und Umlaufzeiten
export const B = {
  mercury:{name:'Merkur', a:0.387, T:87.97,  L0:252.25, mu:22032,     R:2440,  alt:50,    atm:false, surf:{up:3100, down:3100}, color:'#a39e98'},
  venus:  {name:'Venus',  a:0.723, T:224.70, L0:181.98, mu:324859,    R:6052,  alt:250,   atm:true,  surf:{up:27000,down:100, note:'Rückstart kostet 27 km/s'}, color:'#d9b36c'},
  earth:  {name:'Erde',   a:1.000, T:365.256,L0:100.46, mu:398600,    R:6371,  alt:200,   atm:true,  surf:{up:9400, down:100, launcher:true, note:'Hitzeschild und Fallschirme'}, color:'#4f8fd8'},
  mars:   {name:'Mars',   a:1.524, T:686.98, L0:355.45, mu:42828,     R:3390,  alt:150,   atm:true,  surf:{up:4100, down:700, note:'Aerobremsen, dann Landetriebwerk'}, color:'#c8603c'},
  ceres:  {name:'Ceres',  a:2.767, T:1681.6, L0:153.0,  mu:62.6,      R:470,   alt:30,   atm:false, surf:{up:400,  down:400}, color:'#9a958d'},
  jupiter:{name:'Jupiter',a:5.203, T:4332.6, L0:34.40,  mu:126686534, R:69911, alt:10000, atm:true,  surf:null, color:'#d2a679'},
  saturn: {name:'Saturn', a:9.537, T:10759,  L0:49.94,  mu:37931187,  R:58232, alt:8000,  atm:true,  surf:null, color:'#e3cf8e'},
};

export const PLANETS = Object.keys(B);

// Monde: Knoten "orbit" und "surf", verbunden mit dem hohen Orbit des Mutterplaneten.
// xfer = Δv vom hohen Planetenorbit bis in den niedrigen Mondorbit (Näherungswerte), P = Umlaufzeit in Tagen, rv = Bahnradius in km
export const M = {
  moon:     {name:'Mond',      parent:'earth',  xfer:800,  days:3,  up:1870, down:1870, P:27.32, rv:384400, orbitName:'Mondorbit', surfName:'Mondoberfläche', dat:'dem Mond'},
  phobos:   {name:'Phobos',    parent:'mars',   xfer:550,  days:1,  up:10,   down:10,   P:0.319, rv:9376,   downNote:'Kaum Schwerkraft, eher andocken als landen'},
  deimos:   {name:'Deimos',    parent:'mars',   xfer:350,  days:2,  up:6,    down:6,    P:1.263, rv:23460,  downNote:'Kaum Schwerkraft, eher andocken als landen'},
  io:       {name:'Io',        parent:'jupiter',xfer:4000, days:4,  up:1850, down:1850, P:1.769, rv:421700, downNote:'Extreme Strahlung und Vulkane'},
  europa:   {name:'Europa',    parent:'jupiter',xfer:2900, days:5,  up:1480, down:1480, P:3.551, rv:671100, downNote:'Eispanzer über einem Ozean'},
  ganymede: {name:'Ganymed',   parent:'jupiter',xfer:1800, days:6,  up:2000, down:2000, P:7.155, rv:1070400},
  callisto: {name:'Kallisto',  parent:'jupiter',xfer:1100, days:8,  up:1750, down:1750, P:16.69, rv:1882700, downNote:'Außerhalb der starken Strahlungsgürtel'},
  enceladus:{name:'Enceladus', parent:'saturn', xfer:2400, days:5,  up:180,  down:180,  P:1.370, rv:238000, downNote:'Geysire aus dem Südpol'},
  titan:    {name:'Titan',     parent:'saturn', xfer:700,  days:10, up:7600, down:100,  P:15.95, rv:1221900, downNote:'Dichte Atmosphäre, Fallschirme genügen', upNote:'Die dichte Atmosphäre macht den Rückstart teuer'},
};

export const MOONS = Object.keys(M);

export const moonsOf = p => MOONS.filter(m=>M[m].parent===p);

// Orbitale Tankstellen; Tankstellen am Boden hängen an den Landeplätzen
export const DEPOTS = {'earth.orbit':5, 'mars.orbit':10};

// Äquatoriale Rotationsgeschwindigkeit in m/s. Wer weiter vom Äquator startet, bekommt weniger Schwung geschenkt.
export const ROT = {mercury:3, venus:2, earth:465, mars:241, ceres:92, moon:5, phobos:3, deimos:1,
  io:75, europa:32, ganymede:27, callisto:11, enceladus:13, titan:12};

// Landeplätze: lat in Grad, port = Weltraumbahnhof, depot = Tage zum Volltanken
export const SITES = {
  earth:[
    {id:'kourou', name:'Kourou', lat:5.2, lon:-52.8, port:true, depot:3, note:'Fast am Äquator, voller Rotationsbonus'},
    {id:'canaveral', name:'Cape Canaveral', lat:28.5, lon:-80.6, port:true, depot:3},
    {id:'baikonur', name:'Baikonur', lat:45.9, lon:63.3, port:true, depot:3},
    {id:'plesetsk', name:'Plesetsk', lat:62.9, lon:40.6, port:true, depot:3, note:'Weit im Norden, wenig Rotationsbonus'},
  ],
  mercury:[
    {id:'caloris', name:'Caloris-Becken', lat:30.5, lon:170},
    {id:'prokofiev', name:'Prokofiev-Krater', lat:85.7, lon:-62.7, depot:40, note:'Wassereis in ewig schattigen Kratern'},
  ],
  venus:[ {id:'ishtar', name:'Ishtar Terra', lat:70, lon:27.5, note:'Kühleres Hochland, trotzdem 450 °C'} ],
  mars:[
    {id:'pavonis', name:'Pavonis Mons', lat:0.8, lon:-112.8, port:true, depot:20, note:'Äquator und 14 km hoch, Drehkreuz mit Tanklager'},
    {id:'jezero', name:'Jezero-Krater', lat:18.4, lon:77.5},
    {id:'utopia', name:'Utopia Planitia', lat:46.7, lon:117.8, depot:45, note:'Eis unter der Oberfläche'},
    {id:'nordpol', name:'Nordpolkappe', lat:85, lon:0, depot:25, note:'Wassereis direkt an der Oberfläche'},
  ],
  ceres:[
    {id:'occator', name:'Occator-Krater', lat:19.8, lon:-120.7, depot:40, note:'Salzlaken aus dem Untergrund'},
    {id:'ahuna', name:'Ahuna Mons', lat:-10.5, lon:-44},
    {id:'nordpol', name:'Nordpolregion', lat:80, lon:0, depot:25, note:'Eis in schattigen Kratern'},
  ],
  moon:[
    {id:'tranquillitatis', name:'Mare Tranquillitatis', lat:0.7, lon:23.5, note:'Landestelle von Apollo 11'},
    {id:'shackleton', name:'Shackleton-Krater', lat:-89.9, lon:0, port:true, depot:15, note:'Wassereis am Südpol'},
  ],
  phobos:[ {id:'stickney', name:'Stickney-Krater', lat:1, lon:-49} ],
  deimos:[ {id:'swift', name:'Swift-Krater', lat:12, lon:0} ],
  io:[ {id:'loki', name:'Loki Patera', lat:13, lon:-51, note:'Lavasee, extreme Strahlung'} ],
  europa:[
    {id:'conamara', name:'Conamara Chaos', lat:9.7, lon:-87, depot:30, note:'Junges Eis, Ozean vermutlich nah'},
    {id:'thera', name:'Thera Macula', lat:-47, lon:178},
  ],
  ganymede:[ {id:'uruk', name:'Uruk Sulcus', lat:0, lon:160, port:true, depot:30} ],
  callisto:[ {id:'valhalla', name:'Valhalla', lat:18, lon:-56, port:true, depot:25, note:'Außerhalb der starken Strahlungsgürtel'} ],
  enceladus:[
    {id:'tigerstreifen', name:'Tigerstreifen', lat:-82, lon:0, depot:20, note:'Geysire liefern Eis frei Haus'},
    {id:'aeqator', name:'Sarandib Planitia', lat:5, lon:-60},
  ],
  titan:[
    {id:'huygens', name:'Huygens-Landestelle', lat:-10.3, lon:167.7},
    {id:'kraken', name:'Kraken Mare', lat:68, lon:50, depot:30, note:'Methanseen und Wassereis'},
  ],
};

export const siteOf = (body,id) => (SITES[body]||[]).find(x=>x.id===id);

export const hasDepot = body => (SITES[body]||[]).some(x=>x.depot);

export const rotPenalty = (body,lat) => (ROT[body]||0)*(1-Math.cos(lat*Math.PI/180)); // m/s

export const hasAtm = body => B[body] ? B[body].atm : body==='titan';

export const latStr = lat => `${Math.abs(lat).toLocaleString('de-DE',{maximumFractionDigits:1})}° ${lat>=0?'N':'S'}`;

export const LVL = {surf:'Oberfläche', orbit:'Niedriger Orbit', capt:'Hoher Orbit'};

export const SHIPS = {
  kogge:  {name:'Kogge',   drive:'chemisch', isp:450, dry:12, cap:80,  slots:6,  price:150000},
  holk:   {name:'Holk',    drive:'hybrid',   isp:600, dry:20, cap:160, slots:12, price:400000},
  karacke:{name:'Karacke', drive:'nuklear',  isp:900, dry:30, cap:150, slots:8,  price:1200000},
  hulk:   {name:'Hulk',    drive:'hybrid',   isp:650, dry:45, cap:280, slots:20, price:900000},
};

export const GOODS = {
  he3:  {name:'Helium-3', sh:'He-3',        m:1,  w:8000, lot:[1,2], rate:45, color:'#b78cf0'},
  elec: {name:'Elektronik', sh:'Elektronik',      m:1,  w:5000, lot:[1,2], rate:30, color:'#5cc9e0'},
  hab:  {name:'Habitatmodule', sh:'Habitat',   m:10, w:4000, lot:[1,1], rate:30, color:'#e0a15c'},
  rare: {name:'Seltene Metalle', sh:'Selt. Met.', m:4,  w:3000, lot:[1,2], rate:30, color:'#d97fb0'},
  mach: {name:'Maschinen', sh:'Maschinen',       m:5,  w:2000, lot:[1,2], rate:20, color:'#9aa7c0'},
  food: {name:'Nahrung', sh:'Nahrung',         m:3,  w:600,  lot:[1,2], rate:20, color:'#7cc56a'},
  metal:{name:'Metalle', sh:'Metalle',         m:8,  w:400,  lot:[1,3], rate:10, color:'#b0a18f'},
  water:{name:'Wasser', sh:'Wasser',          m:8,  w:200,  lot:[1,3], rate:10, color:'#4f8fd8'},
};

export const K = (id,name,node,site,makes,needs,hub) => ({id,name,node,site,makes,needs,hub});

export const KONTORE = [
  K('erde','Erde','earth.surf',null,['food','mach','elec','hab'],['he3','rare']),
  K('werft','Orbitalwerft','earth.orbit',null,['elec'],['water','food','metal','rare'],'werft'),
  K('shackleton','Shackleton','moon.surf','shackleton',['water'],['food','mach','hab']),
  K('tranq','Tranquillitatis','moon.surf','tranquillitatis',['metal','he3'],['water','mach']),
  K('caloris','Caloris','mercury.surf','caloris',['metal','rare'],['water','food','mach']),
  K('prokofiev','Prokofiev','mercury.surf','prokofiev',['water'],['elec','hab']),
  K('pavonis','Pavonis Mons','mars.surf','pavonis',['mach','hab'],['he3','elec','metal','rare'],'pavonis'),
  K('jezero','Jezero','mars.surf','jezero',['food'],['water','mach']),
  K('marsnord','Nordpolkappe','mars.surf','nordpol',['water'],['food','hab']),
  K('stickney','Stickney','phobos.surf','stickney',['metal'],['water','food']),
  K('occator','Occator','ceres.surf','occator',['metal'],['food','elec','hab']),
  K('ahuna','Ahuna Mons','ceres.surf','ahuna',['rare'],['water','mach']),
  K('ceresnord','Ceres-Nordpol','ceres.surf','nordpol',['water'],['mach']),
  K('loki','Loki Patera','io.surf','loki',['rare'],['water','food','mach']),
  K('conamara','Conamara','europa.surf','conamara',['water'],['elec','hab']),
  K('uruk','Uruk Sulcus','ganymede.surf','uruk',['food'],['water','mach']),
  K('valhalla','Valhalla','callisto.surf','valhalla',['hab'],['he3','food','metal','elec'],'valhalla'),
  K('jupgas','Jupiter-Gassammler','jupiter.capt',null,['he3'],['food','mach']),
  K('satgas','Saturn-Gassammler','saturn.capt',null,['he3'],['food','elec']),
  K('tiger','Tigerstreifen','enceladus.surf','tigerstreifen',['water'],['mach']),
  K('kraken','Kraken Mare','titan.surf','kraken',[],['mach','hab','elec']),
];

export const KBY = Object.fromEntries(KONTORE.map(k=>[k.id,k]));

export const HUBS = {werft:KBY.werft, pavonis:KBY.pavonis, valhalla:KBY.valhalla};

export const REGION = {earth:'werft',moon:'werft',mercury:'werft',venus:'werft',
  mars:'pavonis',phobos:'pavonis',deimos:'pavonis',ceres:'pavonis',
  jupiter:'valhalla',io:'valhalla',europa:'valhalla',ganymede:'valhalla',callisto:'valhalla',
  saturn:'valhalla',enceladus:'valhalla',titan:'valhalla'};

export const HUB_CAP = 40, MAX_OPEN = 6, MAX_ROUTE_DV = 12000; // längere Routen schafft kein Schiff

// Treibstoffpreise in Credits pro t, Schlüssel: Knoten oder Knoten@Landeplatz
export const FUEL_PRICE = {'earth.orbit':300,'mars.orbit':220,'earth.surf':250,'mercury.surf@prokofiev':200,'moon.surf@shackleton':150,
  'mars.surf@utopia':150,'mars.surf@pavonis':180,'mars.surf@nordpol':120,'ceres.surf@occator':120,'titan.surf@kraken':110,'ceres.surf@nordpol':100,
  'ganymede.surf@uruk':100,'europa.surf@conamara':90,'callisto.surf@valhalla':90,'enceladus.surf@tigerstreifen':80};

export const LAUNCH_FEE = 100, RESCUE_BASE = 5000, RESCUE_PER_T = 300, BANKRUPT = -50000;

export const K_T = 400, M_S = 8, V_E = 450*9.80665, K_Z = 15;

export const K_ZT = 4;          // Zeitanteil: Cr pro Tonne (Fracht + Schiffsanteil) und Reisetag

export const BULK = {min:7, max:18, slow:1.5, premium:1.1, life:180}; // Großaufträge: Größe, Nachschub langsamer als Einzelware, Aufschlag, Laufzeit

export const bodyOf = k => k.node.split('.')[0];

export const planetOfBody = b => M[b] ? M[b].parent : b;

export const bodyName = b => M[b] ? M[b].name : B[b].name;

export const kontorPlace = k => k.node==='earth.orbit' ? 'Erdorbit' : k.node.endsWith('.capt') ? `hoher ${B[bodyOf(k)].name}orbit` : bodyName(bodyOf(k));

export const kontorLabel = k => k.id==='erde' ? 'Erde' : `${k.name}, ${kontorPlace(k)}`;

export const fmtCr = n => `${Math.round(n).toLocaleString('de-DE')} Cr`;

export const planetGen = k => k==='earth'?'der Erde':k==='venus'?'der Venus':'von '+B[k].name;

export const SYSNAME = {earth:'Erdsystem', mars:'Marssystem', jupiter:'Jupitersystem', saturn:'Saturnsystem'};

const BODYCOL = {moon:'#a8a49c', phobos:'#8e8378', deimos:'#9a9086', io:'#d8c35a', europa:'#cfc6b2', ganymede:'#a89f92', callisto:'#7f776d', enceladus:'#e6ecf0', titan:'#d9a441'};

export const bodyColor = b => B[b] ? B[b].color : (BODYCOL[b]||'#9a958d');

// Wie viel Δv braucht es von einem Ort bis zur nächsten Tankstelle? 0, wenn es dort eine gibt.
export const FUEL_SPOTS = Object.keys(FUEL_PRICE).map(k=>{ const [node,site]=k.split('@'); return {node, site:site||(node==='earth.surf'?'kourou':null)}; });

export function fuelHere(node,site){ return (FUEL_PRICE[node+'@'+site] ?? FUEL_PRICE[node])!==undefined; }
