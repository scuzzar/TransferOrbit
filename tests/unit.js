// Unit tests for the game objects (js/game/state.ts), reading saves (js/game/save.ts) and the
// commands that drive them. No browser and no server: tsc compiles js/ into a temporary
// folder and the tests import from there, with ANIM.instant so every command finishes at once.
// Run with: npm run unit
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');

// The little of the browser that the game code touches outside the display
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { querySelector: () => null, getElementById: () => null };
globalThis.window = { innerHeight: 800 };
const store = new Map();
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k), clear: () => store.clear() };

// A seeded Math.random, so the market does the same every run
function seed(s) { let a = s >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const ready = (async () => {
  const root = path.join(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'transferorbit-unit-'));
  execFileSync(path.join(root, 'node_modules', '.bin', 'tsc'), ['-p', path.join(root, 'tsconfig.json'), '--noEmit', 'false', '--rootDir', root, '--outDir', out], { stdio: 'inherit' });
  fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
  const load = m => import(pathToFileURL(path.join(out, 'js', m + '.js')).href);
  const [world, state, save, commands, economy, actions, graph, basics, events] =
    await Promise.all(['game/world', 'game/state', 'game/save', 'game/commands', 'game/economy', 'game/actions', 'game/graph', 'basics', 'events'].map(load));
  basics.ANIM.instant = true;
  const reports = []; events.onReport((text, kind) => reports.push({ text, kind }));
  return { world, state, save, commands, economy, actions, graph, reports };
})();

// A fresh game with a fixed seed; S is read through the module so it is always the current one
async function fresh(s = 1) { const m = await ready; seed(s); store.clear(); m.commands.newGame(); m.reports.length = 0; return m; }
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

// ── Nodes, landing sites, depots ───────────────────────────────────────────

test('Bodies: a planet circles the Sun, a moon its planet, with the orbit the physics reads', async () => {
  const { world: { BODIES, PLANETS, MOONS, planetOrbit, hasAtm, rotPenalty } } = await ready;
  for (const k of PLANETS) { const b = BODIES[k]; assert.equal(b.orbits, null); assert.ok(b.gravity > 0 && b.radius > 0 && b.lowOrbitAltitude > 0); planetOrbit(k); }
  for (const k of MOONS) { const b = BODIES[k]; assert.ok(b.orbits && PLANETS.includes(b.orbits.id)); assert.ok(b.orbitRadius > 1000 && b.period > 0); }
  assert.equal(BODIES.titan.orbits, BODIES.saturn); assert.equal(BODIES.mars.orbitRadius, 1.524); assert.equal(BODIES.earth.rotation, 465);
  assert.ok(BODIES.titan.atmosphere && hasAtm('titan') && !hasAtm('moon'));
  near(rotPenalty('earth', 60), 465 / 2, 1e-9);
});

test('There is one node per place; on a surface every node is a landing site', async () => {
  const { world: { nodeAt, nodeOf, NODES, Node, LandingSite } } = await ready;
  assert.equal(nodeOf('moon.surf', 'shackleton'), nodeOf('moon.surf', 'shackleton'));       // the same object
  assert.ok(nodeOf('moon.surf', 'shackleton') instanceof LandingSite);
  assert.equal(nodeOf('moon.orbit', 'shackleton'), nodeOf('moon.orbit'));                  // off the surface the site is ignored
  assert.equal(nodeAt('venus.surf', null), undefined);                                     // no surface without a landing site
  assert.equal(nodeAt('moon.capt'), undefined); assert.equal(nodeAt('jupiter.surf', 'x'), undefined);
  assert.throws(() => nodeOf('mars.surf', 'atlantis'));
  for (const n of NODES) { assert.ok(n instanceof Node); assert.equal(n.level === 'surface', n instanceof LandingSite, n.key); }
});

test('A node knows its body, level and planet; a moon counts as its planet', async () => {
  const { world: { nodeOf } } = await ready;
  const p = nodeOf('titan.surf', 'kraken');
  assert.equal(p.body, 'titan'); assert.equal(p.level, 'surface'); assert.equal(p.planet, 'saturn');
  assert.equal(nodeOf('mars.capt').planet, 'mars');
  assert.equal(p.key, 'titan.surf@kraken'); assert.equal(p.id, '@titan.surf@kraken'); assert.equal(p.site, 'kraken');
  assert.equal(nodeOf('earth.orbit').key, 'earth.orbit'); assert.equal(nodeOf('earth.capt').site, null);
  assert.equal(p.name, 'Kraken Mare'); assert.equal(p.lat, 68); assert.equal(p.port, false);
  assert.equal(nodeOf('mars.surf', 'pavonis').port, true);
});

test('A node finds the trading post there, by site where the body has several', async () => {
  const { world: { nodeOf } } = await ready;
  assert.equal(nodeOf('moon.surf', 'shackleton').post?.id, 'shackleton');
  assert.equal(nodeOf('moon.surf', 'tranquillitatis').post?.id, 'tranq');
  assert.equal(nodeOf('earth.surf', 'kourou').post?.id, 'kourou');     // every Earth spaceport is a starport of its own
  assert.equal(nodeOf('earth.surf', 'plesetsk').post?.id, 'plesetsk');
  assert.equal(nodeOf('earth.orbit').post?.id, 'shipyard');
  assert.equal(nodeOf('venus.surf', 'ishtar').post, null);
});

test('The Earth has four starports, one per spaceport, that together make and need what the Earth did', async () => {
  const { world } = await ready;
  const earth = world.POSTS.filter(k => k.node === 'earth.surf');
  assert.deepEqual(earth.map(k => k.site), ['kourou', 'canaveral', 'baikonur', 'plesetsk']);
  assert.deepEqual(earth.flatMap(k => k.makes).sort(), ['elec', 'food', 'hab', 'mach']);
  assert.deepEqual([...new Set(earth.flatMap(k => k.needs))].sort(), ['he3', 'rare']);
  for (const k of earth) { assert.equal(world.postLabel(k), `${k.name}, Earth`); assert.equal(world.fuelHere(k.node, k.site), true); }
  assert.equal(world.fuelHere('earth.surf', null), false);    // no fuel price for the surface as a whole any more
});

test('A depot sits at a node with its fuel price and fill time', async () => {
  const { world: { nodeOf, DEPOT_LIST } } = await ready;
  const d = nodeOf('mars.surf', 'pavonis').depot;
  assert.equal(d.at, nodeOf('mars.surf', 'pavonis')); assert.equal(d.fuelPrice, 180); assert.equal(d.fillDays, 20);
  assert.equal(nodeOf('earth.surf', 'baikonur').depot.fuelPrice, 250);
  assert.deepEqual([nodeOf('earth.orbit').depot.fuelPrice, nodeOf('earth.orbit').depot.fillDays], [300, 5]);   // a fuel station in orbit
  assert.equal(nodeOf('mars.surf', 'jezero').depot, null);
  for (const x of DEPOT_LIST) assert.equal(x.at.depot, x);
});

test('Node labels read like the game has always named places', async () => {
  const { world: { nodeOf } } = await ready;
  assert.equal(nodeOf('moon.surf', 'shackleton').label, 'Shackleton Crater (Moon)');
  assert.equal(nodeOf('moon.orbit').label, 'lunar orbit');
  assert.equal(nodeOf('mars.capt').label, 'High orbit of Mars');
  assert.equal(nodeOf('mars.orbit').label, 'Low orbit of Mars');
  assert.equal(nodeOf('phobos.orbit').label, 'orbit around Phobos');
});

test('Connections lead from node to node; transfers between planets have a window, launchers a fee', async () => {
  const m = await ready;
  const { world: { nodeOf, NODES } } = m, g = m.graph;
  for (const n of NODES) for (const c of g.connectionsFrom(n)) {
    assert.equal(c.from, n); assert.ok(c.to instanceof m.world.Node); assert.notEqual(c.to, n);
    assert.ok(c.dv >= 0 && c.days > 0, `${n.key} > ${c.to.key}`);
    assert.equal(c.transferWindow, n.level === 'highOrbit' && c.to.level === 'highOrbit', `${n.key} > ${c.to.key}`);
  }
  const up = g.connectionsFrom(nodeOf('earth.surf', 'kourou'));
  assert.ok(up.find(c => c.to === nodeOf('earth.orbit')).launchFee);                  // a launcher lifts you off the Earth
  assert.ok(up.filter(c => c.hop).every(c => c.launchFee));                           // and flies the suborbital hops
  assert.ok(!g.connectionsFrom(nodeOf('mars.surf', 'pavonis')).some(c => c.launchFee));
  const t = g.connectionsFrom(nodeOf('earth.capt')).find(c => c.to === nodeOf('mars.capt'));
  assert.deepEqual(t.leg, ['earth', 'mars']); assert.equal(t.dv, g.idealTransfer('earth', 'mars').total);
  assert.equal(g.connectionsFrom(nodeOf('earth.capt')), g.connectionsFrom(nodeOf('earth.capt')));   // built once
});

// ── Ship ───────────────────────────────────────────────────────────────────

test('Ship: delta-v follows Tsiolkovsky with dry mass, cargo and propellant', async () => {
  const { state: { Ship, Docked }, world: { nodeOf, SHIPS, G0 } } = await ready;
  const s = new Ship('cog', 80, new Docked(nodeOf('earth.orbit')));
  const d = SHIPS.cog;
  near(s.dvAvail, d.isp * G0 * Math.log((d.dry + 80) / d.dry));
  near(s.dvWith(40, 10), d.isp * G0 * Math.log((d.dry + 10 + 40) / (d.dry + 10)));
  assert.equal(s.dvWith(0), 0);
});

test('Ship: a burn takes its delta-v off the tank; fuelFor is what a burn needs to end empty', async () => {
  const { state: { Ship, Docked }, world: { nodeOf } } = await ready;
  const s = new Ship('hulk', 160, new Docked(nodeOf('earth.orbit')));
  const before = s.dvAvail;
  s.burn(3000);
  near(s.dvAvail, before - 3000, 1e-6); near(s.dvUsed, 3000);
  s.fuel = s.fuelFor(2000); s.burn(2000); near(s.fuel, 0, 1e-9);
  s.fuel = 10; s.burn(1e9); assert.equal(s.fuel, 0);  // never below empty
});

test('Ship: refuelling stops at a full tank, a smaller ship keeps only what fits', async () => {
  const { state: { Ship, Docked }, world: { nodeOf } } = await ready;
  const s = new Ship('galleon', 100, new Docked(nodeOf('earth.orbit')));
  s.refuel(1000); assert.equal(s.fuel, 280);
  s.swapTo('carrack'); assert.equal(s.fuel, 150); assert.equal(s.def.name, 'Carrack');
  s.swapTo('galleon'); assert.equal(s.fuel, 150);
});

test('Ship: the hold keeps orders in id order and knows their mass and slots', async () => {
  const { state: { Ship, Docked, Order }, world: { nodeOf } } = await ready;
  const s = new Ship('cog', 80, new Docked(nodeOf('earth.orbit')));
  const o = (id, good, containers) => new Order({ id, good, containers, from: 'kourou', to: 'shipyard', reward: 1000, dv: 1, days: 1,
    deadline: 100, created: 0, expires: 90, fromHubStore: false, toHub: false });
  const a = o(5, 'water', 2), b = o(2, 'hab', 1), c = o(9, 'elec', 1);
  s.load(a); s.load(c); s.load(b);
  assert.deepEqual(s.hold.map(x => x.id), [2, 5, 9]);
  assert.equal(s.cargoMass, 2 * 8 + 10 + 1); assert.equal(s.slotsUsed, 4); assert.equal(s.slotsFree, 2);
  assert.ok(s.unload(a)); assert.ok(!s.unload(a));
  assert.deepEqual(s.hold.map(x => x.id), [2, 9]);
});

test('Ship: docked it has a place, in transit it has none', async () => {
  const { state: { Ship, Docked, InTransit }, world: { nodeOf } } = await ready;
  const s = new Ship('cog', 80, new Docked(nodeOf('earth.capt')));
  assert.equal(s.place?.node, 'earth.capt'); assert.equal(s.transit, null);
  s.depart(new InTransit({ from: 'earth', to: 'mars', dep: 0, arr: 200, th0: 0, th1: 1 }));
  assert.equal(s.place, null); assert.equal(s.transit?.to, 'mars'); assert.ok(!s.isAt(nodeOf('earth.capt')));
  s.dock(nodeOf('mars.capt')); assert.ok(s.isAt(nodeOf('mars.capt'))); assert.equal(s.transit, null);
});

// ── Order, Player ─────────────────────────────────────────────────────────

test('Order pays in full up to the deadline, then 2% less a day, never below a quarter', async () => {
  const { state: { Order } } = await ready;
  const o = new Order({ id: 1, good: 'food', containers: 2, from: 'kourou', to: 'jezero', reward: 10000, dv: 1, days: 1,
    deadline: 100, created: 0, expires: 90, fromHubStore: false, toHub: false });
  assert.equal(o.payout(100), 10000);
  assert.equal(o.payout(110), 8000);
  assert.equal(o.payout(1000), 2500);
  assert.equal(o.mass, 6); assert.equal(o.isBulk, false);
});

test('Player pays, charges and knows what it can afford', async () => {
  const { state: { Player, Ship, Docked }, world: { nodeOf } } = await ready;
  const p = new Player(1000, new Ship('cog', 80, new Docked(nodeOf('earth.orbit'))));
  p.pay(500); p.charge(2000); assert.equal(p.credits, -500);
  assert.ok(p.canAfford(-500)); assert.ok(!p.canAfford(0));
  assert.equal(p.bankrupt, false);  // only a failed rescue declares bankruptcy
  assert.equal(p.ship.type, 'cog');  // the player owns the ship
});

// ── Market ─────────────────────────────────────────────────────────────────

test('A new game: Cog at the shipyard, full tank, 20,000 Cr, orders at the posts', async () => {
  const { state } = await fresh();
  const S = state.S;
  assert.equal(S.player.ship.type, 'cog'); assert.equal(S.player.ship.fuel, 80); assert.equal(S.player.credits, 20000);
  assert.equal(S.player.ship.place?.node, 'earth.orbit'); assert.equal(S.windowPlanet, undefined);
  assert.ok(S.market.offers.length > 10); assert.equal(S.player.ship.hold.length, 0);
  assert.ok(S.canAct);
  assert.equal(S.postHere?.id, 'shipyard');
  // orders from the run-up period all start today with their full deadline
  for (const o of S.market.offers) { assert.equal(o.created, S.day); assert.ok(o.deadline > S.day); }
});

test('Market: every order lies at the post it comes from, ids are unique and below nextId', async () => {
  const { state, world } = await fresh(3);
  const S = state.S, seen = new Set();
  for (const k of world.POSTS) for (const o of S.market.post(k.id).offers) {
    assert.equal(o.from, k.id); assert.ok(!seen.has(o.id)); seen.add(o.id); assert.ok(o.id < S.market.nextId);
  }
  const ids = S.market.offers.map(o => o.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('Every body lies in the zone of influence of exactly one hub; every hub sells every ship', async () => {
  const { state, world } = await fresh();
  for (const b of [...world.PLANETS, ...world.MOONS])
    assert.equal(Object.values(world.ZONES).filter(z => z.includes(b)).length, 1, b);
  assert.equal(world.hubFor('titan'), 'valhalla'); assert.equal(world.hubFor('ceres'), 'pavonis'); assert.equal(world.hubFor('moon'), 'shipyard');
  const h = state.S.market.hub('pavonis');
  assert.deepEqual(h.zone, world.ZONES.pavonis); assert.deepEqual(h.sells, world.SHIP_IDS);
  assert.equal(h.name, 'Pavonis Mons'); assert.equal(h.at, world.nodeOf('mars.surf', 'pavonis'));
});

test('Market: only hubs are hubs, and they start with goods in store', async () => {
  const { state } = await fresh();
  const m = state.S.market;
  for (const id of ['shipyard', 'pavonis', 'valhalla']) assert.ok(m.hub(id) instanceof state.Hub, id);
  assert.equal(m.hub('kourou'), null);
  assert.ok(m.hub('shipyard').stored >= 0);
});

test('Market over five years: stores stay within bounds, expired orders go back, nothing is lost', async () => {
  const { state, world, commands } = await fresh(7);
  const S = state.S;
  for (let i = 0; i < 60; i++) commands.waitDays(30);
  for (const k of world.POSTS) {
    const p = S.market.post(k.id);
    for (const g of k.makes) { const n = state.stockOf(p.industry.stores, g); assert.ok(n >= 0 && n <= 12, `${k.id} ${g} ${n}`); }
    for (const g of k.needs) { const n = p.industry.levelOf(g); assert.ok(n >= 0 && n <= 3, `${k.id} needs ${g}`); }
    for (const o of p.offers) assert.ok(o.expires >= S.day, 'an expired order still on offer');
    for (const g of k.makes) assert.ok(p.offers.filter(o => o.good === g && !o.isBulk && !o.fromHubStore).length <= world.MAX_OPEN);
  }
  // the market runs in whole days from the start of the run-up, so it stays less than a day behind
  assert.ok(S.market.simulatedTo <= S.day && S.day - S.market.simulatedTo < 1);
});

test('An order that expires gives its goods back to the post: none are lost, none are made up', async () => {
  const { state, commands, world } = await fresh(2);
  const S = state.S;
  const o = S.market.offers.find(x => !x.isBulk && !x.fromHubStore && world.POST_BY_ID[x.from].makes.includes(x.good));
  const post = S.market.post(o.from), g = o.good;
  o.expires = S.day;                                  // gone with the next market day
  const before = state.stockOf(post.industry.stores, g), made = 1 / world.GOODS[g].rate;
  commands.waitDays(1);
  assert.ok(!post.offers.includes(o));
  const newer = post.offers.filter(x => x.good === g && x.created === S.market.simulatedTo && !x.isBulk && !x.fromHubStore);
  const after = state.stockOf(post.industry.stores, g) + newer.reduce((s, x) => s + x.containers, 0);
  near(after, Math.min(12, before + made) + o.containers, 1e-9);
});

// ── Commands on the objects ────────────────────────────────────────────────

test('Where an order lies is its state: offered at its starport, aboard in the hold, then gone', async () => {
  const { state, commands } = await fresh();
  const S = state.S, o = S.postHere.offers.find(x => x.containers <= 2);
  assert.equal(S.stateOf(o), 'offered');
  commands.acceptOrders([o.id]); assert.equal(S.stateOf(o), 'aboard');
  commands.abortOrder(o); assert.equal(S.stateOf(o), null);
  assert.ok(S.player.ship.location instanceof state.Location && S.player.ship.location instanceof state.Docked);
});

test('Accepting moves orders from the post into the hold with a fresh deadline; all or none', async () => {
  const { state, commands } = await fresh();
  const S = state.S, post = S.postHere, small = post.offers.filter(o => o.containers <= 2).slice(0, 2);
  assert.equal(small.length, 2);
  const before = post.offers.length;
  assert.ok(commands.acceptOrders(small.map(o => o.id)));
  assert.equal(post.offers.length, before - 2);
  assert.deepEqual(S.player.ship.hold.map(o => o.id), small.map(o => o.id).sort((a, b) => a - b));
  for (const o of S.player.ship.hold) assert.equal(o.created, S.day);
  // too many for the hold: nothing moves
  const big = post.offers.filter(o => o.containers > S.player.ship.slotsFree);
  if (big.length) { assert.ok(!commands.acceptOrders([big[0].id])); assert.equal(S.player.ship.hold.length, 2); }
  assert.ok(!commands.acceptOrders([]));
});

test('Returning puts an order back at its post, free', async () => {
  const { state, commands } = await fresh();
  const S = state.S, o = S.postHere.offers.find(x => x.containers <= 2);
  commands.acceptOrders([o.id]);
  const cr = S.player.credits;
  commands.returnOrder(o);
  assert.equal(S.player.ship.hold.length, 0); assert.ok(S.postHere.offers.includes(o)); assert.equal(S.player.credits, cr);
  commands.returnOrder(o); assert.equal(S.postHere.offers.filter(x => x === o).length, 1);   // not aboard: nothing happens
});

test('Cancelling costs a fifth of the reward, loses the cargo and raises the need at the destination', async () => {
  const { state, commands } = await fresh();
  const S = state.S, o = S.postHere.offers.find(x => x.containers <= 2 && !x.toHub);
  commands.acceptOrders([o.id]);
  const dest = S.market.post(o.to), need = dest.industry.levelOf(o.good), cr = S.player.credits;
  commands.abortOrder(o);
  assert.equal(S.player.credits, cr - Math.round(o.reward * 0.2));
  assert.equal(S.player.ship.hold.length, 0); assert.ok(!S.orders.includes(o));
  assert.equal(dest.industry.levelOf(o.good), Math.min(3, need + 1));
});

test('Delivering pays, empties the hold and fills a hub store for transhipments', async () => {
  const { state, commands, world } = await fresh();
  const S = state.S, o = S.postHere.offers.find(x => x.containers <= 3);
  commands.acceptOrders([o.id]);
  const to = world.POST_BY_ID[o.to];
  S.player.ship.dock(world.nodeOf(to.node, to.site));
  assert.deepEqual(commands.deliverables(), [o]);
  const cr = S.player.credits, hub = o.toHub ? S.market.hub(o.to) : null, stored = hub ? state.stockOf(hub.transship, o.good) : 0;
  commands.deliverAll();
  assert.equal(S.player.credits, cr + o.payout(S.day)); assert.equal(S.player.ship.hold.length, 0);
  if (hub) assert.equal(state.stockOf(hub.transship, o.good), stored + o.containers);
});

test('A hub counts the orders heading to it, open or aboard, against its room', async () => {
  const { state, economy, world } = await fresh();
  const S = state.S, hub = world.POST_BY_ID.pavonis;
  const room = economy.hubRoom(hub);
  const o = new state.Order({ id: 9999, good: 'mach', containers: 3, from: 'shipyard', to: 'pavonis', reward: 1, dv: 1, days: 1,
    deadline: S.day + 100, created: S.day, expires: S.day + 90, fromHubStore: false, toHub: true });
  S.player.ship.load(o); assert.equal(economy.hubRoom(hub), room - 3);
  S.player.ship.unload(o); S.market.post('shipyard').offer(o); assert.equal(economy.hubRoom(hub), room - 3);
});

test('Refuelling takes days and costs money', async () => {
  const { state, commands } = await fresh();
  const S = state.S;
  S.player.ship.fuel = 30;
  const r = commands.refuelInfo(), day = S.day, cr = S.player.credits;
  assert.equal(r.price, 300); assert.equal(r.need, 50); assert.equal(r.source, 'Orbital fuel depot');
  assert.ok(commands.doRefuel(50));
  assert.equal(S.player.ship.fuel, 80); assert.equal(S.player.credits, cr - 15000); assert.equal(S.day, day + r.days);
  assert.ok(!S.player.ship.busy);
  assert.ok(!commands.doRefuel(10));   // full
});

test('A manoeuvre burns fuel, takes its time and arrives', async () => {
  const { state, commands, actions, reports } = await fresh();
  const S = state.S, a = actions.localActions().find(x => x.label === 'Up to high orbit');
  const fuel = S.player.ship.fuel, day = S.day;
  commands.doAction(a);
  assert.equal(S.player.ship.place?.node, 'earth.capt'); assert.ok(S.player.ship.fuel < fuel); assert.equal(S.day, day + a.days);
  assert.match(reports.at(-1).text, /Up to high orbit: .* Now: High orbit of Earth\./);
});

test('An interplanetary transfer leaves from high orbit and arrives in high orbit', async () => {
  const { state, commands, world } = await fresh();
  const S = state.S;
  S.player.ship.dock(world.nodeOf('earth.capt')); S.player.ship.fuel = 80;
  commands.doTransfer('venus');                                    // may cost more than the tank holds
  if (S.player.ship.place?.node === 'earth.capt') { S.player.ship.swapTo('carrack'); S.player.ship.fuel = 150; commands.doTransfer('venus'); }
  assert.equal(S.player.ship.place?.node, 'venus.capt'); assert.equal(S.player.ship.transit, null); assert.ok(!S.player.ship.busy);
  S.player.ship.dock(world.nodeOf('venus.orbit'));                     // not from low orbit
  const day = S.day, fuel = S.player.ship.fuel; commands.doTransfer('mars');
  assert.equal(S.day, day); assert.equal(S.player.ship.fuel, fuel); assert.equal(S.player.ship.place?.node, 'venus.orbit');
});

test('Buying a ship trades in the old one at 70%', async () => {
  const { state, commands } = await fresh();
  const S = state.S;
  S.player.credits = 400000;
  commands.buyShip('hulk');
  assert.equal(S.player.ship.type, 'hulk'); assert.equal(S.player.credits, 400000 - (400000 - 0.7 * 150000));
  commands.buyShip('carrack'); assert.equal(S.player.ship.type, 'hulk');   // not enough money
});

test('Nothing happens while bankrupt', async () => {
  const { state, commands } = await fresh();
  const S = state.S;
  S.player.bankrupt = true; assert.ok(!S.canAct);
  const day = S.day; commands.waitDays(10); assert.equal(S.day, day);
  assert.ok(!commands.acceptOrders(S.postHere.offers.map(o => o.id)));
});

test('Stranded without money: a tanker on credit; bankrupt when the balance falls too low', async () => {
  const { state, commands, world } = await fresh();
  const S = state.S;
  S.player.ship.dock(world.nodeOf('mars.surf', 'pavonis')); S.player.credits = 0; S.player.ship.fuel = 1; commands.strandCache.key = null;
  assert.ok(commands.stranded());
  const r = commands.rescueInfo(); assert.ok(r.local);
  commands.rescue();
  assert.equal(S.player.ship.fuel, S.player.ship.def.cap); assert.equal(S.player.credits, -r.cost); assert.ok(!S.player.bankrupt);
  // again, from deep in debt
  S.player.credits = world.BANKRUPT + 100; S.player.ship.fuel = 1; commands.strandCache.key = null;
  commands.rescue(); assert.ok(S.player.bankrupt);
});

test('On the surface of Venus the tanker lifts the ship into orbit', async () => {
  const { state, commands, world } = await fresh();
  const S = state.S;
  S.player.ship.dock(world.nodeOf('venus.surf', 'ishtar')); S.player.ship.fuel = 1; S.player.credits = 1e6; commands.strandCache.key = null;
  assert.ok(commands.stranded()); assert.ok(commands.rescueInfo().lift);
  commands.rescue();
  assert.equal(S.player.ship.place?.node, 'venus.orbit'); assert.equal(S.player.ship.place?.site, null);
});

test('The autopilot flies to its target and stops there', async () => {
  const { state, commands, world } = await fresh();
  const S = state.S;
  S.player.credits = 1e6;
  commands.startAutopilot(world.nodeOf('moon.surf', 'shackleton'), 'eco');
  assert.ok(S.player.ship.autopilot instanceof state.Autopilot); assert.equal(S.player.ship.autopilot.start, world.nodeOf('earth.orbit'));
  for (let i = 0; i < 200 && S.player.ship.autopilot; i++) await new Promise(r => setTimeout(r, 0));
  assert.equal(S.player.ship.autopilot, null); assert.ok(S.player.ship.isAt(world.nodeOf('moon.surf', 'shackleton')));
});

// ── Saves ──────────────────────────────────────────────────────────────────

test('Save and load give the same game back, cargo and stores included', async () => {
  const { state, save, commands } = await fresh(5);
  const S = state.S;
  commands.acceptOrders(S.postHere.offers.filter(o => o.containers <= 2).slice(0, 2).map(o => o.id));
  commands.setAutoFill(true);
  for (let i = 0; i < 5; i++) commands.waitDays(30);
  const a = S.toSave(), json = JSON.stringify(a);
  const g = save.parseSave(JSON.parse(json));
  assert.ok(g); assert.deepEqual(g.toSave(), a);
  assert.equal(g.player.ship.hold.length, 2); assert.ok(g.player.autoFill);
  assert.ok(g.market.hub('valhalla') instanceof state.Hub);
});

test('commands.save and load go through localStorage', async () => {
  const { state, commands } = await fresh(6);
  const S = state.S; S.player.credits = 12345; commands.save();
  commands.newGame(); assert.equal(state.S.player.credits, 20000);
  assert.ok(commands.load()); assert.equal(state.S.player.credits, 12345); assert.notEqual(state.S, S);
});

test('A save is refused while in transit', async () => {
  const { state } = await fresh();
  state.S.player.ship.depart(new state.InTransit({ from: 'earth', to: 'mars', dep: 0, arr: 1, th0: 0, th1: 0 }));
  assert.throws(() => state.S.toSave());
});

test('A save from before the translation and the renaming still loads', async () => {
  const { save, state } = await fresh();
  const old = {
    day: 11000, node: 'mars.surf', site: 'nordpol', ship: 'holk', fuel: 50, used: 1234, credits: 99000,
    visited: ['earth.orbit', 'mars@nordpol'], flags: { delivered: 3, marsLanded: true, 'refuel:mars@nordpol': true, junk: true },
    target: 'jupiter', over: false, autoFill: true,
    eco: {
      stock: { erde: { food: 3, mach: 2 } }, demand: { werft: { water: 2 } }, fwd: { werft: { food: 4 } }, orders: [
        { id: 7, good: 'food', n: 2, from: 'erde', to: 'werft', reward: 5000, dv: 100, days: 3, deadline: 11050, created: 10990, expires: 11080, state: 'open', fwdOrder: false, transship: true },
        { id: 8, good: 'water', n: 3, from: 'marsnord', to: 'jezero', reward: 7000, dv: 200, days: 4, deadline: 11060, created: 10995, expires: 11085, state: 'aboard', fwdOrder: false, bulk: true },
      ], nextId: 9, day: 11000 },
  };
  const g = save.parseSave(old);
  assert.ok(g);
  assert.equal(g.player.ship.type, 'hulk'); assert.equal(g.player.ship.place?.site, 'northpole'); assert.equal(g.player.ship.dvUsed, 1234);
  assert.ok(g.player.autoFill);
  const back = g.toSave();                                      // what the game no longer keeps is dropped
  assert.equal(back.visited, undefined); assert.equal(back.flags, undefined); assert.equal(back.windowPlanet, undefined);
  assert.deepEqual(g.market.post('kourou').offers.map(o => [o.id, o.to, o.containers, o.toHub]), [[7, 'shipyard', 2, true]]);   // the Earth's post became Kourou
  assert.deepEqual(g.player.ship.hold.map(o => [o.id, o.from, o.isBulk]), [[8, 'marsnorth', true]]);
  assert.equal(state.stockOf(g.market.hub('shipyard').transship, 'food'), 4);
  assert.deepEqual([...g.market.post('kourou').industry.stores.values()].map(x => [x.good, x.stock]), [['mach', 2]]);   // Kourou makes machinery; the Earth's food is dropped
  assert.equal(g.market.post('jezero').industry.stores.size, 0);    // a post the save does not know starts empty
});

test('A broken save is refused', async () => {
  const { state, save } = await fresh();
  const good = state.S.toSave();
  const bad = f => { const s = JSON.parse(JSON.stringify(good)); f(s); return save.parseSave(s); };
  assert.ok(bad(() => {}));
  assert.equal(bad(s => { s.ship = 'dinghy'; }), null);
  assert.equal(bad(s => { s.node = 'pluto.orbit'; }), null);
  assert.equal(bad(s => { s.fuel = 'lots'; }), null);
  assert.equal(bad(s => { s.market.orders[0].state = 'lost'; }), null);
  assert.equal(bad(s => { s.market.orders[0].from = 'atlantis'; }), null);
  assert.equal(bad(s => { s.market.produced.kourou.mach = 'x'; }), null);
  assert.equal(save.parseSave(null), null); assert.equal(save.parseSave([]), null);
});
