# Domain model (proposal)

The simulation state as objects instead of the flat `S.domain`. This is a proposal: the
code does not look like this yet. `Game` is the root; everything in *Gespeichert* is
written to a save by `toSave()`, in exactly today's format. *Laufzeit* is never saved,
*Referenzdaten* are the fixed tables in `game/world.ts`, referenced by id.

The order generation stays in `game/economy.ts` as `marketAdvance(market, day)`, and
`game/commands.ts` stays the layer that runs a move: guards, animation, `report()`,
`changed()`. The classes only do the immediate state change and keep its invariants.

```mermaid
classDiagram
direction TB

namespace Gespeichert {
  class Game {
    <<aggregate root>>
    +day: number
    +canAct() boolean
    +cargoMass() number
    +dvAvail() number
    +burn(dv) void
    +arrive(node, site) void
    +toSave() SaveObj
    +fromSave(raw)$ Game
    +fresh()$ Game
  }

  class Ship {
    +type: ShipId
    +fuel: number
    +dvUsed: number
    +def() ShipDef
    +dvWith(fuel, cargo) number
    +fuelFor(dv, cargo) number
    +burn(dv, cargo) void
    +refuel(tons) void
    +swapTo(id) void
  }

  class Position {
    <<value object>>
    +node: NodeId
    +site: string
    +body() BodyId
    +level() Level
    +key() string
    +planet() PlanetId
    +post() Post
    +fuelPrice() number
    +is(target) boolean
  }

  class Account {
    +credits: number
    +bankrupt: boolean
    +pay(n) void
    +charge(n) void
    +canAfford(n, floor) boolean
  }

  class Market {
    +produced: Amounts per Post
    +need: Amounts per Post
    +hubStore: Amounts per Hub
    +bulkStore: Amounts per Post
    +bulkLot: Amounts per Post
    +nextId: number
    +simulatedTo: number
    +cargo() Order[]
    +openAt(post) Order[]
    +remove(order) void
  }

  class Order {
    +id: number
    +containers: number
    +reward: number
    +dv: number
    +days: number
    +deadline: number
    +created: number
    +expires: number
    +state: OrderState
    +fromHubStore: boolean
    +toHub: boolean
    +isBulk: boolean
  }

  class OrderState {
    <<enumeration>>
    open
    aboard
  }

  class Progress {
    +visited: Set~string~
    +flags: Flags
    +visit(pos) void
    +refuelled(pos) void
  }

  class Settings {
    +windowPlanet: PlanetId
    +autoFill: boolean
  }
}

namespace Laufzeit {
  class Activity {
    <<transient>>
    +busy: boolean
  }

  class Transit {
    <<transient>>
    +a: PlanetId
    +b: PlanetId
    +dep: number
    +arr: number
    +th0: number
    +th1: number
  }

  class Autopilot {
    <<transient>>
    +mode: RouteMode
    +start: string
  }

  class Target {
    <<value object>>
    +node: NodeId
    +site: string
  }
}

namespace Referenzdaten {
  class ShipDef {
    <<reference>>
    +name: string
    +isp: number
    +dry: number
    +cap: number
    +slots: number
    +price: number
  }

  class Post {
    <<reference>>
    +id: PostId
    +name: string
    +node: NodeId
    +site: string
    +makes: GoodId[]
    +needs: GoodId[]
    +hub: HubId
  }

  class GoodDef {
    <<reference>>
    +name: string
    +m: number
    +lot: number[2]
    +rate: number
  }
}

%% ── Beziehungen ────────────────────────────────────────────
Game "1" *-- "1" Ship : ship
Game "1" *-- "0..1" Position : pos
Game "1" *-- "1" Account : account
Game "1" *-- "1" Market : market
Game "1" *-- "1" Progress : log
Game "1" *-- "1" Settings : settings
Game "1" *-- "1" Activity : action

Activity "1" *-- "0..1" Transit : transit
Activity "1" *-- "0..1" Autopilot : auto
Autopilot "1" *-- "1" Target : target

Market "1" *-- "*" Order : orders
Order --> OrderState
Order "*" --> "1" GoodDef : good
Order "*" --> "2" Post : from, to

Ship "*" --> "1" ShipDef : type
Position ..> Post : post()

note for Game "Gespeichert wird genau toSave():<br>day, ship, pos, account, market, log, settings.<br>Laufzeit wird nie gespeichert, Referenzdaten stehen fest in world.ts."
```
