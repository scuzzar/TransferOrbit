// Wiring the game together: connect the modules, route the signals, load the save.
// This is the only place that knows both a command side and a display side exist.

import * as Events from './events.js';
import * as Basics from './basics.js';
import * as World from './game/world.js';
import * as Physics from './game/physics.js';
import * as State from './game/state.js';
import * as Graph from './game/graph.js';
import * as Economy from './game/economy.js';
import * as Actions from './game/actions.js';
import * as Geometry from './map/geometry.js';
import * as Planner from './game/planner.js';
import * as Commands from './game/commands.js';
import * as Canvas from './map/canvas.js';
import * as Rocketdata from './map/rocketdata.js';
import * as Surface from './map/surface.js';
import * as Gl from './map/gl.js';
import * as Rocket from './map/rocket.js';
import * as View from './map/view.js';
import * as Draw from './map/draw.js';
import * as Widgets from './ui/widgets.js';
import * as Pickcard from './ui/pickcard.js';
import * as Panels from './ui/panels.js';
import * as Display from './ui/display.js';
import * as Menu from './ui/menu.js';

// The display listens, the commands call. The other way round, nobody knows the display.
Events.onChange(()=>{ Display.render(); Commands.save(); });
Events.onTick(()=>{ Display.header(); Display.speedHint(); Draw.draw(); });

// Every module attaches its own DOM events.
View.wireMap();
Draw.wireDraw();
Display.wireDisplay();
Menu.wireMenu();

if(!Commands.load()) Commands.newGame();
Events.changed();
requestAnimationFrame(Draw.idleLoop);

// three.js arrives only after the first frame, and only if the network plays along.
// A dynamic import() keeps the rest of the game alive when the CDN is blocked.
import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js')
  .then((THREE: unknown) => Gl.glInit(THREE as any))
  .catch((e: unknown) => Gl.glOff(e instanceof Error ? e.message : String(e)));
setTimeout(()=>{ if(Gl.GL.state==='loading') Gl.glOff('three.js could not be loaded.'); }, 10000);

// A single outside edge for tests and the console: TO.<name> always shows the current
// value, TO.module['<path>'] the whole module.
const MODULES: Record<string, Record<string, unknown>> = {
  'events':Events as any, 'basics':Basics as any, 'game/world':World as any, 'game/physics':Physics as any, 'game/state':State as any, 'game/graph':Graph as any, 'game/economy':Economy as any, 'game/actions':Actions as any, 'map/geometry':Geometry as any, 'game/planner':Planner as any, 'game/commands':Commands as any, 'map/canvas':Canvas as any, 'map/rocketdata':Rocketdata as any, 'map/surface':Surface as any, 'map/gl':Gl as any, 'map/rocket':Rocket as any, 'map/view':View as any, 'map/draw':Draw as any, 'ui/widgets':Widgets as any, 'ui/pickcard':Pickcard as any, 'ui/panels':Panels as any, 'ui/display':Display as any, 'ui/menu':Menu as any,
};
const TO: { module: Record<string, Record<string, unknown>> } = { module: MODULES };
for(const space of Object.values(MODULES))
  for(const name of Object.keys(space))
    if(!(name in TO)) Object.defineProperty(TO, name, { get:()=>space[name], enumerable:true });
(window as any).TO = TO;