# Domain model

**This diagram leads.** The code follows it, never the other way round. A change to the model is
made here first, agreed, and then carried into the code; the code is never allowed to drift from
it, and the diagram is never redrawn to match what the code happens to do. Until the code has
caught up, the gaps are listed under *Where the code does not follow yet* at the end.

The game state as objects that relate the way the things in the game do.

- The **player** owns a **ship** and keeps a **logbook** (places visited, deliveries, milestones, depots used).
- The ship **is at** a **location**: either **docked** at a **place** (node and landing site) or
  **in transit** between two planets.
- The ship's **hold** carries the orders it has taken aboard. A **trading post** **offers** orders,
  each going to a **destination** post. Where an order lies is its state.
- A trading post **sits at** a place and keeps what it produced and what it needs; a **hub** also
  stores goods for the region.
- The **market** advances the posts day by day and hands out order ids.
- The fixed tables from `game/world.ts` (ship classes, goods, post definitions, places) are referenced, never copied.

`Game` holds the day and is where saving and loading start. The save keeps its format:
`toSave()` collects the object graph back into the flat JSON.

```mermaid
---
title: TransferOrbit – domain model
config:
  layout: elk
---
classDiagram
direction TB

class Game {
  +day: number
  +pass(days) void
  +toSave() SaveObj
  +fromSave(raw)$ Game
}

namespace Player_and_ship {
  class Player {
    +credits: number
    +bankrupt: boolean
    +autoFill: boolean
    +pay(n) void
    +charge(n) void
    +canAfford(n) boolean
  }

  class Logbook {
    +visited: Set~Place~
    +delivered: number
    +milestones: Set~Milestone~
    +depotsUsed: Set~Place~
  }

  class Ship {
    +fuel: number
    +dvUsed: number
    +busy: boolean
    +cargoMass() number
    +dvAvail() number
    +burn(dv) void
    +refuel(tons) void
    +load(order) void
    +unload(order) void
  }

  class Autopilot {
    +mode: RouteMode
    +start: Place
  }

  class Location {
    <<abstract>>
  }

  class Docked

  class InTransit {
    +from: PlanetId
    +to: PlanetId
    +dep: number
    +arr: number
  }
}

namespace Trade {
  class Market {
    +simulatedTo: number
    +nextId: number
    +advance(day) void
  }

  class TradingPost {
    +produced: Amounts
    +need: Amounts
    +bulkStore: Amounts
    +bulkLot: Amounts
    +fuelPrice() number
  }

  class Hub {
    +store: Amounts
    +room() number
  }

  class Order {
    +containers: number
    +reward: number
    +dv: number
    +days: number
    +created: number
    +deadline: number
    +expires: number
    +isBulk: boolean
    +fromHubStore: boolean
    +payout(day) number
  }

  class OrderState {
    <<enumeration>>
    offered
    aboard
  }
}

namespace World_fixed_tables {
  class Place {
    <<value object>>
    +node: NodeId
    +site: string
    +body() BodyId
    +planet() PlanetId
  }

  class ShipClass {
    <<reference>>
    +isp: number
    +dry: number
    +cap: number
    +slots: number
    +price: number
  }

  class Good {
    <<reference>>
    +mass: number
    +lot: number[2]
    +rate: number
  }

  class PostDef {
    <<reference>>
    +name: string
    +makes: Good[]
    +needs: Good[]
  }
}

%% the player and their ship
Game "1" --> "1" Player : player
Game "1" --> "1" Market : market
Player "1" --> "1" Ship : owns
Player "1" *-- "1" Logbook : keeps
Ship "*" --> "1" ShipClass : is a
Ship "1" *-- "1" Location : is at
Ship "1" *-- "0..1" Autopilot : flies with
Autopilot "*" --> "1" Place : target
Location <|-- Docked
Location <|-- InTransit
Docked "*" --> "1" Place : at

%% trade
Market "1" *-- "*" TradingPost : posts
TradingPost <|-- Hub
TradingPost "*" --> "1" PostDef : is
TradingPost "0..1" --> "1" Place : sits at
TradingPost "1" o-- "*" Order : offers (from)
Order "*" --> "1" TradingPost : destination (to)
Order "*" --> "1" Good : carries
Order --> OrderState
Ship "1" o-- "*" Order : hold

note for Order "offered: lies at its post, aboard: in the ship's hold.<br>The state follows from where the order is."
```

## Where the code does not follow yet

The code in `js/game/state.ts` was written against this model but departs from it here:

- `Game` holds the ship directly (`S.ship`); in the model the **player owns** it.
- `Market.advance(day)` does not exist; the market runs through `marketAdvance()` in
  `game/economy.ts`, which reads the global `S`. `Hub.room()` is `hubRoom()` there.
- A **trading post does not sit at a place**: `Place.post` looks up the post's definition.
  `fuelPrice()` is on `Place`, not on `TradingPost`.
- `Location` is a TypeScript union, not an abstract class.
- The **autopilot's target** and **start** are a `Target` and a key string, not `Place`s.
- `Logbook.visited` and `depots` hold strings, not places; `depotsUsed` is called `depots`.
- `Game.fromSave` does not exist; `parseSave()` in `game/save.ts` does its job, and there is
  no `Game.pass(days)`.
- The reference classes carry their `world.ts` names (`ShipDef`, `GoodDef` with `m`, `Post`),
  not `ShipClass`, `Good` (`mass`) and `PostDef`.
- `Order` has no `OrderState`; its state is only where it lies.
- Much of the behaviour is still written from outside the objects: the commands set
  `ship.busy`, fill a hub's store, count deliveries and change `need` directly.
- The code has members the model does not show (`Ship.type`, `Game.windowPlanet`,
  `Order.id`, `Order.toHub`, and many operations). They need a place in the model first.
