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
  const [world, state, save, commands, economy, actions, graph, planner, basics, events, physics] =
    await Promise.all(['game/world', 'game/state', 'game/save', 'game/commands', 'game/economy', 'game/actions', 'game/graph', 'game/planner', 'basics', 'events', 'game/physics'].map(load));
  plannerMod = planner; TOphysics = physics; TOworld = world;
  basics.ANIM.instant = true;
  const reports = []; events.onReport((text, kind) => reports.push({ text, kind }));
  // what the ship was doing whenever a command reported a change
  const seen = []; events.onChange(() => { const sh = state.S?.player.ship; if (sh) seen.push({ transit: sh.transit, busy: sh.busy, place: sh.place }); });
  return { world, state, save, commands, economy, actions, graph, planner, physics, reports, seen };
})();

// A fresh game with a fixed seed; S is read through the module so it is always the current one
async function fresh(s = 1) { const m = await ready; seed(s); store.clear(); m.commands.newGame(); m.reports.length = 0; return m; }
const TOplan = (_c, t) => plannerMod.planRoute(t, 'economical');
let plannerMod, TOphysics, TOworld;
const TOtable = (a, b) => TOworld.transferTable(a, b);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

// ── Nodes, landing sites, depots ───────────────────────────────────────────

test('Bodies: a planet circles the Sun, a moon its planet, with the orbit the physics reads', async () => {
  const { world: { BODIES, PLANETS, MOONS, hasAtm, rotPenalty } } = await ready;
  for (const k of PLANETS) { const b = BODIES[k]; assert.equal(b.orbits, null); assert.ok(b.gravity > 0 && b.radius > 0 && b.lowOrbitAltitude > 0); }
  for (const k of MOONS) { const b = BODIES[k]; assert.ok(b.orbits && PLANETS.includes(b.orbits.id)); assert.ok(b.orbitRadius > 1000 && b.period > 0);
    assert.ok(b.gravity > 0 && b.radius > 0 && b.lowOrbitAltitude > 0, k); assert.ok(b.gravity < b.orbits.gravity, k); }
  assert.equal(BODIES.moon.gravity, 4902.8); assert.equal(BODIES.titan.radius, 2574.7);
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

test('The market finds the starport at a node, by site where the body has several', async () => {
  const { world: { nodeOf }, state } = await fresh();
  const postAt = n => state.S.market.at(n);
  assert.equal(postAt(nodeOf('moon.surf', 'shackleton'))?.id, 'shackleton');
  assert.equal(postAt(nodeOf('moon.surf', 'tranquillitatis'))?.id, 'tranq');
  assert.equal(postAt(nodeOf('earth.surf', 'kourou'))?.id, 'kourou');     // every Earth spaceport is a starport of its own
  assert.equal(postAt(nodeOf('earth.surf', 'plesetsk'))?.id, 'plesetsk');
  assert.equal(postAt(nodeOf('earth.orbit'))?.id, 'shipyard');
  assert.equal(postAt(nodeOf('venus.surf', 'ishtar')), null);
});

test('The Earth has four starports, one per spaceport, that together make and need what the Earth did', async () => {
  const { world, state } = await fresh();
  const earth = world.STARPORT_TABLE.filter(k => k.node === 'earth.surf');
  assert.deepEqual(earth.map(k => k.site), ['kourou', 'canaveral', 'baikonur', 'plesetsk']);
  assert.deepEqual(earth.flatMap(k => k.makes).sort(), ['elec', 'food', 'hab', 'mach']);
  assert.deepEqual([...new Set(earth.flatMap(k => k.needs))].sort(), ['he3', 'rare']);
  for (const k of earth) { assert.equal(state.postLabel(state.S.market.post(k.id)), `${k.name}, Earth`); assert.equal(world.fuelHere(k.node, k.site), true); }
  assert.equal(state.postLabel(state.S.market.post('valhalla')), 'Valhalla, Callisto (Jupiter)');   // a moon names its planet
  assert.equal(state.postLabel(state.S.market.post('jupgas')), 'Jupiter Gas Collector, high orbit of Jupiter');
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
    assert.equal(!!c.window, n.level === 'highOrbit' && c.to.level === 'highOrbit', `${n.key} > ${c.to.key}`);
    if (c.window) assert.equal(c.window, m.world.transferTable(n.planet, c.to.planet));
  }
  const up = g.connectionsFrom(nodeOf('earth.surf', 'kourou'));
  assert.ok(up.find(c => c.to === nodeOf('earth.orbit')).launchFee);                  // a launcher lifts you off the Earth
  assert.ok(up.filter(c => c.hop).every(c => c.launchFee));                           // and flies the suborbital hops
  assert.ok(!g.connectionsFrom(nodeOf('mars.surf', 'pavonis')).some(c => c.launchFee));
  const t = g.connectionsFrom(nodeOf('earth.capt')).find(c => c.to === nodeOf('mars.capt'));
  assert.deepEqual(t.leg, ['earth', 'mars']); assert.equal(t.dv, g.idealTransfer('earth', 'mars').total);
  assert.equal(g.connectionsFrom(nodeOf('earth.capt')), g.connectionsFrom(nodeOf('earth.capt')));   // built once
});

// ── Transfers ──────────────────────────────────────────────────────────────

test('Lambert: across 180 degrees in the Hohmann time it gives the Hohmann excess speeds', async () => {
  const { physics, world: { AU, MU_SUN } } = await ready;
  const r1 = AU, r2 = 1.524 * AU, a = (r1 + r2) / 2, t = Math.PI * Math.sqrt(a ** 3 / MU_SUN);
  const [v1, v2] = physics.lambert(r1, r2, Math.PI, t);
  near(v1, Math.sqrt(MU_SUN * (2 / r1 - 1 / a)) - Math.sqrt(MU_SUN / r1), 1e-6);
  near(v2, Math.sqrt(MU_SUN / r2) - Math.sqrt(MU_SUN * (2 / r2 - 1 / a)), 1e-6);
  const [w1] = physics.lambert(r1, r2, Math.PI - 1e-4, t), [u1] = physics.lambert(r1, r2, Math.PI + 1e-4, t);
  near(w1, v1, 1e-3); near(u1, v1, 1e-3);                                 // smooth through 180 degrees
  assert.equal(physics.lambert(r1, r2, 0, t), null);
});

test('The transfer tables match the orbits they were computed from', async () => {
  const { physics, world: { PLANETS, transferTable, vInfToByte, TABLE_GRID } } = await ready;
  let cells = 0, off = 0;
  for (const a of PLANETS) for (const b of PLANETS) {
    if (a === b) continue;
    const t = transferTable(a, b), c = physics.computeTable(a, b);
    assert.ok(t, `${a}>${b}`); assert.equal(t.angleSteps, TABLE_GRID.angleSteps); assert.equal(t.flightSteps, TABLE_GRID.flightSteps);
    near(t.flightRange[0], c.flightRange[0], 1e-5); near(t.flightRange[1], c.flightRange[1], 1e-5);
    for (let k = 0; k < c.vInfDep.length; k++) for (const [s, v] of [[t.vInfDep[k], c.vInfDep[k]], [t.vInfArr[k], c.vInfArr[k]]]) {
      const d = Math.abs(vInfToByte(s) - vInfToByte(v)); cells++; if (d) off++;
      assert.ok(d <= 1, `${a}>${b} cell ${k}: run npm run tables`);
    }
  }
  assert.ok(off / cells < 0.001, `${off} of ${cells} cells differ: run npm run tables`);
});

test('The table agrees with the exact cost; the connection holds its cheapest cell', async () => {
  const { physics, graph, world: { PLANETS, START_DAY } } = await ready;
  seed(7); let sum = 0, n = 0, worst = 0;
  for (const a of PLANETS) for (const b of PLANETS) {
    if (a === b) continue;
    const id = graph.idealTransfer(a, b), t = physics.cheapestCell(a, b);
    assert.equal(id.total, t.dv); assert.ok(id.total > 0 && id.total < 25000, `${a}>${b} ${id.total}`);
    for (let i = 0; i < 60; i++) {
      const [f0, f1] = TOtable(a, b).flightRange, dep = START_DAY + Math.random() * 5000, days = f0 + Math.random() * (f1 - f0);
      const ex = physics.transferCost(a, b, dep, days).total; if (ex > 2 * id.total) continue;
      const e = Math.abs(physics.tableCost(a, b, dep, days) - ex) / ex; sum += e; n++; worst = Math.max(worst, e);
    }
  }
  assert.ok(n > 300 && sum / n < 0.01 && worst < 0.08, `mean ${sum / n}, worst ${worst}, n ${n}`);
  const id = graph.idealTransfer('earth', 'mars');
  near(id.total, 1374, 15); near(id.tof, 259, 8);                              // Hohmann, as the textbooks have it
});

test('A shorter flight costs more: the presets trade delta-v for days', async () => {
  const { physics, world: { DAY_VALUE, START_DAY } } = await ready;
  const eco = physics.bestTransfer('earth', 'mars', START_DAY, DAY_VALUE.economical);
  const from = eco.dep, r = ['economical', 'balanced', 'fast'].map(p => physics.bestTransfer('earth', 'mars', from, DAY_VALUE[p]));
  assert.ok(eco.dep - START_DAY > 300, 'the window of 2031 is more than 300 days away');
  for (let i = 1; i < 3; i++) { assert.ok(r[i].days < r[i - 1].days - 10); assert.ok(r[i].dv > r[i - 1].dv); }
  near(r[0].dv, physics.transferCost('earth', 'mars', r[0].dep, r[0].days).total, 1e-6);   // chosen on the exact cost
});

test('A transfer flies the chosen time and burns the exact cost', async () => {
  const { state, commands, physics, world } = await fresh();
  const S = state.S, ship = S.player.ship;
  ship.dock(world.nodeOf('earth.capt')); ship.swapTo('carrack'); ship.fuel = 150;
  const w = physics.bestTransfer('earth', 'mars', S.day, world.DAY_VALUE.economical); S.day = w.dep;
  const cost = physics.transferCost('earth', 'mars', S.day, 200).total, dv = ship.dvAvail, day = S.day;
  assert.ok(commands.doTransfer('mars', 200));
  assert.equal(ship.place?.node, 'mars.capt'); near(S.day, day + 200, 1e-9); near(ship.dvUsed, cost, 1e-6);
  assert.ok(ship.dvAvail < dv - cost + 1);
});

test('Planner: the presets draft different plans; the fast one arrives sooner', async () => {
  const { state, planner, world } = await fresh();
  const S = state.S, ship = S.player.ship; ship.dock(world.nodeOf('earth.capt')); ship.swapTo('carrack'); ship.fuel = 150;
  const tgt = world.nodeOf('mars.surf', 'pavonis'), p = world.PRESETS.map(m => planner.planRoute(tgt, m));
  assert.ok(p.every(x => x && x.legs.at(-1).step.to === tgt));
  assert.ok(p[2].arrive < p[1].arrive && p[1].arrive < p[0].arrive, p.map(x => x.arrive).join(' '));
  assert.ok(p[0].dv < p[1].dv && p[1].dv < p[2].dv);
  assert.ok(p.every(x => x.dv <= ship.dvAvail), 'fast means as fast as the tank allows');
  ship.swapTo('cog'); ship.fuel = 20;                                     // a small tank: every preset falls back to what it can afford
  const q = world.PRESETS.map(m => planner.planRoute(tgt, m));
  assert.ok(q[2].dv <= ship.dvAvail + 0.5 || q[2].dv === q[0].dv, `${q[2].dv} of ${ship.dvAvail}`);
  const leg = p[0].legs.find(l => l.kind === 'transfer');
  near(leg.dv, TOphysics.transferCost('earth', 'mars', leg.dep, leg.arr - leg.dep).total, 1e-6);   // the plan shows what will be burned
});

test('Planner: a pinned transfer stays, the rest is planned again around it', async () => {
  const { state, planner, physics, world } = await fresh();
  const S = state.S; S.player.ship.dock(world.nodeOf('earth.orbit'));
  const tgt = world.nodeOf('mars.surf', 'pavonis'), plan = planner.draftPlan(tgt, 'economical');
  const i = plan.steps.findIndex(s => s.along.leg), st = plan.steps[i], dep = st.leaveOn + 30, days = 180;
  planner.pinTransfer(plan, i, dep, days); assert.deepEqual(planner.replan(plan, tgt), []);
  assert.equal(plan.steps[i], st); assert.ok(st.pinned); assert.equal(st.leaveOn, dep); assert.equal(st.flightDays, days);
  const sch = planner.schedule(plan);
  near(sch.legs[i].dep, dep, 1e-9); near(sch.legs[i].arr, dep + days, 1e-9);
  assert.ok(sch.legs.slice(i + 1).every(l => l.ready >= dep + days - 1e-9));
  // a departure before the ship gets there cannot stay: the pin goes and the player is told
  planner.pinTransfer(plan, i, S.day - 10, days);
  const msgs = planner.replan(plan, tgt);
  assert.equal(msgs.length, 1); assert.match(msgs[0], /Mars no longer fits/); assert.ok(!plan.steps[i].pinned);
  assert.ok(plan.steps[i].leaveOn >= S.day);
  assert.ok(physics.transferCost('earth', 'mars', plan.steps[i].leaveOn, plan.steps[i].flightDays).total < 2000);
});

test('Planner: where burning and aerobraking join the same places, a step switches and stays switched', async () => {
  const { state, planner, world } = await fresh();
  const S = state.S; S.player.ship.dock(world.nodeOf('moon.surf', 'shackleton'));
  const tgt = world.nodeOf('earth.surf', 'kourou'), plan = planner.draftPlan(tgt, 'economical');
  const i = plan.steps.findIndex(s => s.from === world.nodeOf('earth.capt') && s.to === world.nodeOf('earth.orbit'));
  assert.ok(i >= 0 && plan.steps[i].along.dv < 100, 'economical aerobrakes');
  const slow = planner.schedule(plan);
  planner.switchStep(plan, i); planner.replan(plan, tgt);
  assert.ok(plan.steps[i].pinned && plan.steps[i].along.dv > 2000, 'now it burns');
  const quick = planner.schedule(plan); assert.ok(quick.arrive < slow.arrive - 30 && quick.dv > slow.dv + 2000);
  assert.equal(planner.draftPlan(tgt, 'fast').steps[i].along, plan.steps[i].along);     // what the fast preset does anyway
  planner.unpin(plan, i); planner.replan(plan, tgt); assert.ok(!plan.steps[i].pinned);
});

test('The autopilot flies a plan with a pinned transfer as chosen', async () => {
  const { state, commands, planner, world } = await fresh();
  const S = state.S, ship = S.player.ship;
  ship.dock(world.nodeOf('earth.capt')); ship.swapTo('carrack'); ship.fuel = 150; S.player.credits = 1e6;
  const tgt = world.nodeOf('mars.capt'), plan = planner.draftPlan(tgt, 'economical'), st = plan.steps[0];
  planner.pinTransfer(plan, 0, st.leaveOn, 210);
  commands.startAutopilot(tgt, plan);
  for (let i = 0; i < 200 && ship.autopilot; i++) await new Promise(r => setTimeout(r, 0));
  assert.ok(ship.isAt(tgt)); near(S.day, st.leaveOn + 210, 1e-6);
});

test('A route with a stopover waits for the window of every transfer, not just the first', async () => {
  const { graph, economy, physics, world: { DAY_VALUE, START_DAY } } = await ready;
  const r = graph.route({ node: 'venus.capt', site: null }, { node: 'mars.capt', site: null });
  assert.deepEqual(r.legs, [['venus', 'earth'], ['earth', 'mars']]);                     // via Earth
  assert.equal(r.path.length, 2); assert.equal(r.path[0], r.first);
  let longest = 0;
  for (let day = START_DAY; day < START_DAY + 800; day += 40) {
    const t1 = physics.searchTransfer('venus', 'earth', day, DAY_VALUE.economical), at = t1.dep + t1.days;
    const t2 = physics.searchTransfer('earth', 'mars', at, DAY_VALUE.economical);
    near(economy.routeWait(r, day), (t1.dep - day) + (t2.dep - at), 1e-9);
    longest = Math.max(longest, t2.dep - at);
  }
  assert.ok(longest > 100, `at Earth the ship waits up to ${longest} days for the window to Mars`);
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

test('Ship: docked it has a place, in transit along a connection it has none', async () => {
  const { state: { Ship, Docked, InTransit }, world: { nodeOf }, graph } = await ready;
  const s = new Ship('cog', 80, new Docked(nodeOf('earth.capt')));
  assert.equal(s.place?.node, 'earth.capt'); assert.equal(s.transit, null); assert.ok(!s.underWay);
  const toMars = graph.connectionsFrom(nodeOf('earth.capt')).find(c => c.to === nodeOf('mars.capt'));
  s.depart(new InTransit(toMars, 0, 200));
  assert.equal(s.place, null); assert.equal(s.transit?.to, 'mars'); assert.equal(s.transit?.from, 'earth'); assert.ok(!s.isAt(nodeOf('earth.capt')));
  assert.equal(s.near, null); assert.ok(s.underWay);                         // on the way to another planet: near nowhere
  s.dock(nodeOf('mars.capt')); assert.ok(s.isAt(nodeOf('mars.capt'))); assert.equal(s.transit, null);
  const down = graph.connectionsFrom(nodeOf('mars.capt')).find(c => c.to === nodeOf('mars.orbit'));
  s.depart(new InTransit(down, 0, 1));
  assert.equal(s.place, null); assert.equal(s.near, nodeOf('mars.capt')); assert.ok(s.underWay);   // a local manoeuvre: near where it left
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
  const { state } = await fresh(3);
  const S = state.S, seen = new Set();
  for (const k of S.market.list) for (const o of S.market.post(k.id).offers) {
    assert.equal(o.from, k.id); assert.ok(!seen.has(o.id)); seen.add(o.id); assert.ok(o.id < S.market.nextId);
  }
  const ids = S.market.offers.map(o => o.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('Every body lies in the zone of influence of exactly one hub; every hub sells every ship', async () => {
  const { state, world } = await fresh();
  for (const b of [...world.PLANETS, ...world.MOONS])
    assert.equal(Object.values(world.ZONES).filter(z => z.includes(b)).length, 1, b);
  const hubFor = b => state.S.market.hubFor(b)?.id;
  assert.equal(hubFor('titan'), 'valhalla'); assert.equal(hubFor('ceres'), 'pavonis'); assert.equal(hubFor('moon'), 'shipyard');
  const h = state.S.market.hub('pavonis');
  assert.deepEqual(h.zone, world.ZONES.pavonis); assert.deepEqual(h.sells, world.SHIP_IDS);
  assert.equal(h.name, 'Pavonis Mons'); assert.equal(h.at, world.nodeOf('mars.surf', 'pavonis'));
  assert.equal(state.S.market.at(world.nodeOf('mars.surf', 'pavonis')), h); assert.equal(state.S.market.at(world.nodeOf('mars.orbit')), null);   // a node finds its starport through the market
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
  for (const p of S.market.list) {
    const k = { id: p.id, makes: p.industry.makes, needs: p.industry.needs };
    // production stops at 12; an expired order may bring its containers back on top
    for (const g of k.makes) { const n = state.stockOf(p.industry.stores, g); assert.ok(n >= 0 && n <= 12 + world.GOODS[g].lot[1], `${k.id} ${g} ${n}`); }
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
  const o = S.market.offers.find(x => !x.isBulk && !x.fromHubStore && S.market.post(x.from).industry.makes.includes(x.good));
  const post = S.market.post(o.from), g = o.good;
  o.expires = S.day;                                  // gone with the next market day
  const before = state.stockOf(post.industry.stores, g), made = 1 / world.GOODS[g].rate;
  commands.waitDays(1);
  assert.ok(!post.offers.includes(o));
  const newer = post.offers.filter(x => x.good === g && x.created === S.market.simulatedTo && !x.isBulk && !x.fromHubStore);
  const after = state.stockOf(post.industry.stores, g) + newer.reduce((s, x) => s + x.containers, 0);
  near(after, Math.min(12, before + made) + o.containers, 1e-9);
});

test('Bulk orders: the daily test gives sizes between the least and largest, averaging the good\'s bulkLot', async () => {
  const { economy, world: { GOODS, BULK } } = await ready;
  seed(11);
  for (const [g, G] of Object.entries(GOODS)) {
    const step = 1 / (G.rate * BULK.slow), sizes = [];
    for (let run = 0; run < 3000; run++) {
      let have = 0;
      for (;;) { have += step; if (Math.random() < economy.bulkChance(g, have, step)) break; }
      sizes.push(Math.min(Math.floor(have), BULK.max));
      assert.ok(have >= BULK.min && have < BULK.max + 1 + step, `${g} ${have}`);
    }
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    assert.ok(Math.abs(mean - G.bulkLot) < 0.25, `${g}: mean ${mean.toFixed(2)} for bulkLot ${G.bulkLot}`);
  }
  assert.equal(economy.bulkChance('water', 6.9, 0.1), 0); assert.equal(economy.bulkChance('water', 19, 0.1), 1);
});

test('A bulk store that piled up while an order was on offer gives one order\'s worth, the rest stays', async () => {
  const { state, commands, economy, world } = await fresh(9);
  const S = state.S, p = S.market.post('marsnorth'), g = 'water';
  p.offers.filter(o => o.isBulk).forEach(o => p.withdraw(o));
  const st = state.storeOf(p.industry.bulk, g); st.stock = 40;
  let before = 40;
  for (let i = 0; i < 30 && !p.offers.some(x => x.isBulk && x.good === g); i++) { before = st.stock; commands.waitDays(1); }  // until a buyer turns up
  const o = p.offers.find(x => x.isBulk && x.good === g), [a, b] = economy.bulkRange(g);
  assert.ok(o, 'a bulk order right away');
  assert.ok(o.containers >= Math.floor(a) && o.containers <= world.BULK.max, String(o.containers));
  assert.ok(Math.abs(st.stock + o.containers - before) < 0.2);             // the rest stays in store
});

test('A save no longer keeps the size the next bulk order waits for', async () => {
  const { state, commands } = await fresh(4);
  for (let i = 0; i < 20; i++) commands.waitDays(30);
  const sv = state.S.toSave();
  assert.equal(sv.market.bulkLot, undefined); assert.ok(Object.keys(sv.market.bulkStore).length > 0);
  assert.ok(state.S.market.offers.some(o => o.isBulk && o.containers >= 7 && o.containers <= 18));
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
  S.player.ship.dock(S.market.post(o.to).at);
  assert.deepEqual(commands.deliverables(), [o]);
  const cr = S.player.credits, hub = o.toHub ? S.market.hub(o.to) : null, stored = hub ? state.stockOf(hub.transship, o.good) : 0;
  commands.deliverAll();
  assert.equal(S.player.credits, cr + o.payout(S.day)); assert.equal(S.player.ship.hold.length, 0);
  if (hub) assert.equal(state.stockOf(hub.transship, o.good), stored + o.containers);
});

test('A hub counts its store and the orders offered towards it against its room, not what the ship carries', async () => {
  const { state, economy } = await fresh();
  const S = state.S, hub = S.market.post('pavonis');
  const room = economy.hubRoom(S.market, hub);
  const o = new state.Order({ id: 9999, good: 'mach', containers: 3, from: 'shipyard', to: 'pavonis', reward: 1, dv: 1, days: 1,
    deadline: S.day + 100, created: S.day, expires: S.day + 90, fromHubStore: false, toHub: true });
  S.player.ship.load(o); assert.equal(economy.hubRoom(S.market, hub), room);          // aboard: none of the market's business
  S.player.ship.unload(o); S.market.post('shipyard').offer(o); assert.equal(economy.hubRoom(S.market, hub), room - 3);
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

test('Every manoeuvre is a transit along its connection; busy is only time spent at a place', async () => {
  const m = await fresh(), { state, commands, actions, world, seen } = m;
  const S = state.S, a = actions.localActions().find(x => x.label === 'Up to high orbit');
  seen.length = 0; commands.doAction(a);
  const under = seen.find(x => x.transit);
  assert.ok(under, 'the ship was in transit'); assert.equal(under.transit.along, a.via); assert.equal(under.place, null); assert.ok(!under.busy);
  assert.equal(under.transit.along.to, world.nodeOf('earth.capt')); assert.equal(S.player.ship.transit, null);
  seen.length = 0; commands.waitDays(3);
  assert.ok(seen.some(x => x.busy && x.place === world.nodeOf('earth.capt') && !x.transit));   // waiting: busy at the place
  S.player.ship.swapTo('carrack'); S.player.ship.fuel = 150;
  S.day = m.physics.bestTransfer('earth', 'mars', S.day, world.DAY_VALUE.economical).dep;     // in the window
  seen.length = 0; commands.doTransfer('mars');
  const tr = seen.find(x => x.transit);
  assert.ok(tr && tr.transit.along.window && tr.transit.to === 'mars' && !tr.busy);
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
  commands.startAutopilot(world.nodeOf('moon.surf', 'shackleton'), 'economical');
  assert.ok(S.player.ship.autopilot instanceof state.Autopilot); assert.equal(S.player.ship.autopilot.start, world.nodeOf('earth.orbit'));
  for (let i = 0; i < 200 && S.player.ship.autopilot; i++) await new Promise(r => setTimeout(r, 0));
  assert.equal(S.player.ship.autopilot, null); assert.ok(S.player.ship.isAt(world.nodeOf('moon.surf', 'shackleton')));
});

test('The autopilot keeps its start for the whole trip: a wait for the window there is no reason to stop', async () => {
  const { state, commands, world, reports } = await fresh();
  const S = state.S, ship = S.player.ship;
  ship.dock(world.nodeOf('jupiter.capt')); ship.swapTo('carrack'); ship.fuel = 150; S.player.credits = 1e6;
  ship.load(new state.Order({ id: 9999, good: 'food', containers: 1, from: 'shackleton', to: 'jupgas', reward: 1000, dv: 1, days: 1,
    deadline: S.day + 1000, created: S.day, expires: S.day + 900, fromHubStore: false, toHub: false }));
  assert.equal(commands.deliverables().length, 1);                       // it could be delivered right here
  const tgt = world.nodeOf('saturn.capt'), plan = plannerMod.draftPlan(tgt, 'economical'), st = plan.steps[0];
  plannerMod.pinTransfer(plan, 0, st.leaveOn + 40, st.flightDays);
  assert.ok(plannerMod.schedule(plan).legs[0].wait > 39);                  // the trip starts with a wait
  commands.startAutopilot(tgt, plan);
  for (let i = 0; i < 200 && ship.autopilot; i++) await new Promise(r => setTimeout(r, 0));
  assert.ok(!reports.some(r => /cargo can be delivered here/.test(r.text)), reports.map(r => r.text).join(' / '));
  assert.ok(ship.isAt(tgt), ship.place?.key);
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

test('Starports, hubs and industries are game state: a save keeps them, changes included', async () => {
  const { state, save, world, commands } = await fresh(4);
  const S = state.S, m = S.market;
  const a = S.toSave();
  assert.deepEqual(a.market.starports.map(k => k.id), world.STARPORT_TABLE.map(k => k.id));   // a new game founds the table's starports
  assert.deepEqual(a.market.starports.find(k => k.id === 'kourou'), { id: 'kourou', name: 'Kourou', node: 'earth.surf', site: 'kourou',
    makes: ['mach'], needs: ['he3'] });
  assert.deepEqual(a.market.starports.find(k => k.id === 'pavonis').hub, { zone: world.ZONES.pavonis, sells: world.SHIP_IDS });
  // change all three during the game
  const k = m.post('jezero'); k.name = 'Jezero Base'; k.at = world.nodeOf('mars.surf', 'northpole');
  k.industry.makes.push('elec'); k.industry.needs.splice(0);
  const h = m.hub('valhalla'); const old = m.hubFor('mercury'); old.zone.splice(old.zone.indexOf('mercury'), 1); h.zone.push('mercury');
  h.sells.splice(0, h.sells.length, 'cog');
  commands.waitDays(20);                                          // the market runs on what they are now
  const b = S.toSave(), g = save.parseSave(JSON.parse(JSON.stringify(b)));
  assert.ok(g); assert.deepEqual(g.toSave(), b);
  const k2 = g.market.post('jezero');
  assert.equal(k2.name, 'Jezero Base'); assert.equal(k2.at, world.nodeOf('mars.surf', 'northpole'));
  assert.deepEqual(k2.industry.makes, [...world.STARPORT_TABLE.find(x => x.id === 'jezero').makes, 'elec']); assert.deepEqual(k2.industry.needs, []);
  assert.equal(g.market.at(world.nodeOf('mars.surf', 'northpole')), k2); assert.equal(g.market.at(world.nodeOf('mars.surf', 'jezero')), null);
  assert.deepEqual(g.market.hub('valhalla').sells, ['cog']); assert.equal(g.market.hubFor('mercury'), g.market.hub('valhalla'));
  assert.equal(state.postLabel(k2), 'Jezero Base, Mars');
});

test('A starport founded during a game trades, and a save keeps it', async () => {
  const { state, save, world, commands } = await fresh(8);
  const S = state.S, m = S.market;
  const k = new state.Starport('ishtar', 'Ishtar Terra', world.nodeOf('venus.surf', 'ishtar'),
    new state.Industry({ makes: ['rare'], needs: ['food'] }, { stores: new Map(), demands: new Map() }));
  m.posts.set(k.id, k);
  assert.equal(m.at(world.nodeOf('venus.surf', 'ishtar')), k); assert.equal(m.post('ishtar'), k);
  for (let i = 0; i < 12; i++) commands.waitDays(30);
  assert.ok(state.stockOf(k.industry.stores, 'rare') > 0 || m.offers.some(o => o.from === 'ishtar'), 'it makes goods');
  assert.ok(m.offers.some(o => o.from === 'ishtar' || o.to === 'ishtar'), 'orders from or to it');
  const a = S.toSave(), g = save.parseSave(JSON.parse(JSON.stringify(a)));
  assert.ok(g); assert.deepEqual(g.toSave(), a);
  assert.equal(g.market.post('ishtar').name, 'Ishtar Terra'); assert.ok(!(g.market.post('ishtar') instanceof state.Hub));
});

test('A save from before the starports were game state gets those of a new game', async () => {
  const { state, save, world } = await fresh();
  const a = state.S.toSave(); delete a.market.starports;
  const g = save.parseSave(JSON.parse(JSON.stringify(a)));
  assert.ok(g);
  assert.deepEqual(g.market.list.map(k => k.id), world.STARPORT_TABLE.map(k => k.id));
  assert.deepEqual(g.toSave().market.starports, state.S.toSave().market.starports);
});

test('commands.save and load go through localStorage', async () => {
  const { state, commands } = await fresh(6);
  const S = state.S; S.player.credits = 12345; commands.save();
  commands.newGame(); assert.equal(state.S.player.credits, 20000);
  assert.ok(commands.load()); assert.equal(state.S.player.credits, 12345); assert.notEqual(state.S, S);
});

test('A save is refused while in transit', async () => {
  const { state } = await fresh();
  const { graph, world } = await ready;
  state.S.player.ship.depart(new state.InTransit(graph.connectionsFrom(world.nodeOf('earth.orbit'))[0], 0, 1));
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
  assert.equal(bad(s => { s.market.starports = {}; }), null);
  assert.equal(bad(s => { s.market.starports[1].id = s.market.starports[0].id; }), null);       // two starports with one id
  assert.equal(bad(s => { s.market.starports[0].node = 'pluto.surf'; }), null);
  assert.equal(bad(s => { s.market.starports[0].site = 'atlantis'; }), null);
  assert.equal(bad(s => { s.market.starports[0].makes = ['gold']; }), null);
  assert.equal(bad(s => { delete s.market.starports[0].name; }), null);
  assert.equal(bad(s => { s.market.starports.find(k => k.hub).hub.sells = ['dinghy']; }), null);
  assert.equal(bad(s => { s.market.starports.find(k => k.hub).hub.zone = ['pluto']; }), null);
  assert.equal(bad(s => { const o = s.market.orders[0]; s.market.starports = s.market.starports.filter(k => k.id !== o.from); }), null);   // an order from a starport that is gone
  assert.equal(save.parseSave(null), null); assert.equal(save.parseSave([]), null);
});
