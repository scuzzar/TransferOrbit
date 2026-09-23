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

## Rules the picture does not show

- **What stays out.** Game rules (hub capacity, launch fee per tonne, rescue time per hub, how much
  slower bulk goods come in) stay constants in the code. Data used only for display (colours,
  notes, longitudes, short names) may stay in the world tables beside the classes. Where the
  solar system map points its transfer window is interface state: it starts empty and is not saved.
- **Orders.** An order lies either in its starport's offers or in the ship's hold, never both;
  its state (`/state`) follows from where it lies. `from` and `to` stay the same wherever it lies.
- **Time at a place, time under way.** Every manoeuvre puts the ship in transit along a
  connection. `busy` means time passes while the ship stays where it is: waiting, refuelling,
  the shipyard, a rescue. Saving works only at a place with the clock stopped.
- **Connections with a transfer window** run between the high orbits of two planets. Their `dv`
  and `days` are the values at the ideal window: the least delta-v and the longest flight. Leaving
  on another day costs more and flies faster; how much follows from the two bodies' orbits and the
  departure day. All other connections always cost what they say.
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
  no reason to stop. `target` is where it ends.

## Where the code does not follow yet

Nothing at the moment.
