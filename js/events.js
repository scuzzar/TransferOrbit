// The signal path. Anything that changes the game state calls changed(); anything
// that only advances time calls tick(). The display subscribes with onChange/onTick,
// so no module below has to know that a display exists at all.

const listeners = { change:[], tick:[] };

// The display subscribes here. start.js does it once while wiring everything up.
export function onChange(fn){ listeners.change.push(fn); }
export function onTick(fn){ listeners.tick.push(fn); }

// The game state changed: rebuild everything, then save.
export function changed(){ for(const fn of listeners.change) fn(); }

// Only time moved on (animation): header and map, nothing else.
export function tick(){ for(const fn of listeners.tick) fn(); }
