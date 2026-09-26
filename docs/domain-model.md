# Domain model

**This diagram leads.** The code follows it, never the other way round. A change to the model is
made here first, agreed, and then carried into the code; the diagram is never redrawn to match
what the code happens to do. Until the code has caught up, the gaps are listed under
*Where the code does not follow yet* at the end.

![TransferOrbit domain model](domain-model.png)

The source is [`domain-model.puml`](domain-model.puml) (PlantUML). After changing it, render the
picture again with `java -jar plantuml.jar -tpng docs/domain-model.puml`; it needs no Graphviz.

The diagram shows data and relations only, no operations. Blue is the game state that a save
keeps, grey with a dashed frame exists only while time runs or the autopilot flies and is never
saved, green is the world: fixed tables, the same in every game. White boxes are value lists.
Orange is kept by the browser across games, apart from the save: the leaderboard.

## Rules the picture does not show

- **What stays out.** Game rules (hub capacity, launch fee per tonne, rescue time per hub, how much
  slower bulk goods come in) stay constants in the code. Data used only for display (colours,
  notes, longitudes, short names) may stay in the world tables beside the classes. Where the
  solar system map points its transfer window is interface state: it starts empty and is not saved.
- **Lifetime.** Time costs the player years of their life. `born` is the day the player was born:
  a new game starts them at 21. How old they are follows from the game's `day`; nothing ages on
  its own. From 80 years on, plus the years `bought`, they may die: the risk starts small and
  doubles every few years (the numbers are game rules in the code). It is rolled each time a
  stretch of time ends, an arrival, waiting, refuelling, the shipyard, a rescue, for the whole
  stretch at once. A player who has died is `dead` and can do nothing more, like one who is
  bankrupt. Years are bought at the youth clinic, which the spaceports on the Earth's surface have;
  a year costs the same wherever and whenever, and buying takes no time.
- **Leaderboard.** Whoever dies is entered: an entry is a copy of the player on the day they died,
  their `name`, `age`, balance (`credits`), the `day` and the years `bought`, not a reference to
  them. The board keeps the ten best balances. It outlives the game, so it is not game state: the
  browser keeps it in a cookie of its own, apart from the save, and a new game leaves it as it is.
- **Orders.** An order lies either in its starport's offers or in the ship's hold, never both;
  its state (`/state`) follows from where it lies. `from` and `to` stay the same wherever it lies.
- **Time at a place, time under way.** Every manoeuvre puts the ship in transit along a
  connection. `busy` means time passes while the ship stays where it is: waiting, refuelling,
  the shipyard, a rescue. Saving works only at a place with the clock stopped.
- **Connections with a transfer window** run between the high orbits of two planets. A connection
  has a transfer window exactly when it has a transfer table; there is no flag besides. What a
  transfer costs depends on when it leaves and how long it flies. Their `dv` and `days` are the table's cheapest cell, the ideal window.
  All other connections always cost what they say, moons and landings included.
- **Transfer tables.** The orbits are circles in one plane, so a transfer's cost depends only on
  the angle it sweeps round the Sun, from the departure planet on the day it leaves to the target
  planet on the day it arrives, and on the flight time. The date only decides that angle, so one
  table serves the whole game. It runs over the transfer angle in `angleSteps` steps, one full
  turn, and over the flight time from `flightRange[0]` to `flightRange[1]` days in `flightSteps`
  steps. Each cell holds the excess speeds at departure and arrival (`vInfDep`,
  `vInfArr`); the delta-v follows from them and the two bodies, with the burn at the low point of
  the high orbit. A table is computed from the orbits of its two bodies, never written by hand,
  and one that no longer matches them is an error. It is for looking and searching: a transfer
  burns the exact delta-v for its departure day and flight time, worked out from the same orbits.
- **Flight time.** A transfer leaves on a chosen day and flies a chosen time, both picked on its
  map; `dep` and `arr` of the transit are that day and the arrival. A shorter flight costs
  more delta-v, and so does leaving far from the window. How much delta-v the ship can spend
  follows from its class, its cargo and its fuel; the table is the same for every ship.
- **Nodes on a surface are landing sites.** Every spaceport has its own starport; the Earth has
  four (Kourou, Cape Canaveral, Baikonur, Plesetsk).
- **Depots.** A depot in orbit is a fuel station (Earth orbit, Mars orbit); on a surface it is at
  a landing site that sells fuel.
- **Hubs.** A hub's zone of influence decides where goods for other zones are transhipped, which
  destinations the orders from its transhipment store serve, how long a rescue takes and which
  fuel prices the refuel panel lists. Every hub sells every ship class. Whether a hub has room
  counts its store and the orders offered towards it, not what the ship carries towards it.
- **Industry.** An industry makes and needs goods. For every good it makes there is a store for
  ordinary orders and one for bulk orders, for every good it needs a demand (`level` 0 to 3: how
  keen the starport is to get it). A good comes in at one container per `rate` days. Once the bulk
  store holds enough for a bulk order, a random test each day decides whether the order appears:
  likelier the closer the store gets to the good's `bulkLot`, certain at the largest size, so the
  sizes average `bulkLot`. The order takes the whole containers in the store; if more piled up
  while an earlier bulk order was on offer, it takes one order's worth and the rest stays.
- **Starports, hubs and industries** are game state, so they can change during a game: their
  name, where they lie, what they make and need, a hub's zone and the ships it sells. A new game
  takes them from the starport table in `game/world.ts`, the save keeps them. Every arrow between
  the game and the world points from the game into the world, never back: a starport knows the
  node it lies `at`, and which starport lies at a node is a question to the game's market.
- **Autopilot.** `start` is where the trip began and stays for the whole trip: a delivery there is
  no reason to stop. `target` is where it ends. It flies its plan's steps in order and waits
  where a transfer's departure day still lies ahead.
- **Plans.** A plan is the way to the target, step by step, each step along one connection. A
  transfer step says when it leaves (`leaveOn`) and how long it flies (`flightDays`). The first
  draft follows a preset: `economical`, `balanced` or `fast` say how much delta-v a day of waiting
  or flying is worth (the amounts are game rules in the code). If that plan needs more delta-v
  than the ship has, the preset counts a day for less, down to what economical counts: fast means
  as fast as the tank allows. The player can then change any
  step: on a transfer the departure day and flight time, picked on its map; where two connections
  join the same two places, such as burning down into low orbit or aerobraking, which one it
  takes. A changed step is `pinned`. After every change, and after every step flown, the steps
  after it that are not pinned are planned again from the preset, from where and when the ship
  will then be; their way may change. A pinned step that can no longer be flown as chosen, because
  its departure lies before the ship gets there, loses its pin and is planned again, and the
  player is told. A plan still being drafted in the planner, before the autopilot takes it, is
  interface state.

## Where the code does not follow yet

Nothing at the moment.
